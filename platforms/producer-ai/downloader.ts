// Producer.ai download functions

import { writeFile, copyFile, unlink, mkdir, stat } from "fs/promises"
import { existsSync } from "fs"
import { join, resolve } from "path"
import { tmpdir } from "os"
import type { Page, BrowserContext, TrackMetadata, Manifest } from "../../core/types"
import { log, debug as debugLog, randomDelay, sanitizeFilename } from "../../core/utils"
import { extractAuthFromCookies } from "../../core/auth"
import { saveManifest as coreSaveManifest } from "../../core/manifest"
import { config, API } from "./config"

const STAGING_DIR = join(tmpdir(), "genvault-producer-ai")

async function downloadWavViaBlob(
  page: Page,
  songId: string,
  bearer: string,
  filepath: string
): Promise<{ ok: boolean; error?: string }> {
  const apiPath = `/__api/${songId}/download?format=wav`
  const filename = filepath.split("/").pop() ?? `${songId}.wav`

  const check = await page.evaluate(
    async (args: { apiPath: string; bearer: string; filename: string }) => {
      try {
        const r = await fetch(args.apiPath, {
          method: "GET",
          credentials: "include",
          headers: { Authorization: `Bearer ${args.bearer}` },
          cache: "no-store",
        })
        if (!r.ok) {
          const text = await r.text().catch(() => "")
          return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}` }
        }
        const ct = r.headers.get("content-type") || ""
        if (!ct.includes("audio") && !ct.includes("octet-stream")) {
          const text = await r.text().catch(() => "")
          return {
            ok: false,
            error: `Not audio (${ct}): ${text.slice(0, 100)}`,
          }
        }
        const blob = await r.blob()
        if (blob.size < 10000) {
          return { ok: false, error: `Response too small (${blob.size} bytes)` }
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = args.filename
        a.rel = "noopener"
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
        return { ok: true, size: blob.size }
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) }
      }
    },
    { apiPath, bearer, filename }
  )

  if (!check.ok) {
    return { ok: false, error: check.error }
  }

  const download = await page.waitForEvent("download", { timeout: 15000 })
  await download.saveAs(filepath)
  return { ok: true }
}

async function downloadViaUI(
  page: Page,
  track: TrackMetadata,
  filepath: string,
  isDebug: boolean
): Promise<boolean> {
  await page.goto(track.songUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })
  await randomDelay(2000, 4000)

  const title = await page.title()
  if (
    title.toLowerCase().includes("just a moment") ||
    title.toLowerCase().includes("attention required") ||
    title.toLowerCase().includes("cloudflare")
  ) {
    await page.waitForFunction(
      () =>
        !document.title.toLowerCase().includes("just a moment") &&
        !document.title.toLowerCase().includes("attention required"),
      { timeout: 30000 }
    ).catch(() => false)
    await randomDelay(2000, 3000)
  }

  const ellipsis = page.locator("button:has(svg.lucide-ellipsis)").first()
  if ((await ellipsis.count()) === 0) {
    debugLog(isDebug, "  No ellipsis button found")
    return false
  }
  await ellipsis.click({ force: true, timeout: 5000 })
  await new Promise((r: (v: void) => void) => setTimeout(r, 1500))

  const dlItem = page.getByText("Download", { exact: true })
  if ((await dlItem.count()) === 0) {
    debugLog(isDebug, "  No 'Download' menu item found")
    return false
  }
  await dlItem.first().click()
  await new Promise((r: (v: void) => void) => setTimeout(r, 1500))

  const wavOption = page.getByText("WAV", { exact: true })
  if ((await wavOption.count()) === 0) {
    debugLog(isDebug, "  No 'WAV' option found")
    return false
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 120000 })
  await wavOption.first().click()
  const download = await downloadPromise
  await download.saveAs(filepath)
  return true
}

async function copyToOutput(
  localPath: string,
  trackId: string,
  outputDir: string
): Promise<boolean> {
  const destPath = join(outputDir, `${trackId}.wav`)
  try {
    await mkdir(outputDir, { recursive: true })
    await copyFile(localPath, destPath)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`  Failed to copy to output: ${msg}`)
    return false
  }
}

export async function downloadPendingTracks(
  page: Page,
  context: BrowserContext,
  manifest: Manifest,
  manifestPath: string,
  outputDir: string,
  batchSize: number,
  isDebug: boolean
): Promise<{ downloaded: number; failed: string[] }> {
  await mkdir(STAGING_DIR, { recursive: true })

  const failedMsgs: string[] = []
  let downloaded = 0

  const pending = Object.values(manifest.tracks)
    .filter((t) => t.status === "pending" || t.status === "failed")
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "pending" ? -1 : 1
      }
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return db - da
    })

  if (pending.length === 0) {
    log("All tracks already downloaded!")
    return { downloaded, failed: failedMsgs }
  }

  const totalBatches = Math.ceil(pending.length / batchSize)
  log(`${pending.length} tracks to download, batch size: ${batchSize} (${totalBatches} batches)`)

  let bearer: string
  try {
    const auth = await extractAuthFromCookies(context, config.baseUrl)
    bearer = auth.bearer
    debugLog(isDebug, `Bearer token extracted (${bearer.length} chars)`)
  } catch (err) {
    log(`Could not extract bearer token: ${err}`)
    log("Falling back to UI download method for all tracks")
    bearer = ""
  }

  let consecutiveFailures = 0
  const MAX_CONSECUTIVE_FAILURES = 5
  let batchNum = 1
  let batchDownloaded: { localPath: string; track: TrackMetadata }[] = []

  for (let i = 0; i < pending.length; i++) {
    const track = pending[i]
    const stagingPath = join(STAGING_DIR, `${track.id}.wav`)

    log(`[${i + 1}/${pending.length}] Downloading "${track.title}" by ${track.artist}...`)
    track.lastAttempt = new Date().toISOString()

    try {
      let success = false

      if (bearer) {
        try {
          const result = await downloadWavViaBlob(page, track.id, bearer, stagingPath)
          if (result.ok) {
            success = true
          } else {
            debugLog(isDebug, `  Blob download failed: ${result.error}`)
            if (result.error?.includes("401") || result.error?.includes("403")) {
              try {
                const refreshed = await extractAuthFromCookies(context, config.baseUrl)
                bearer = refreshed.bearer
                debugLog(isDebug, `  Refreshed bearer token`)
                const retry = await downloadWavViaBlob(page, track.id, bearer, stagingPath)
                if (retry.ok) success = true
              } catch {
                debugLog(isDebug, `  Retry with refreshed token also failed`)
              }
            }
          }
        } catch (blobErr) {
          const msg = blobErr instanceof Error ? blobErr.message : String(blobErr)
          debugLog(isDebug, `  Blob download error: ${msg}`)
        }
      }

      if (!success) {
        debugLog(isDebug, `  Falling back to UI download...`)
        success = await downloadViaUI(page, track, stagingPath, isDebug)
      }

      if (success && existsSync(stagingPath)) {
        const fileStats = await stat(stagingPath)
        if (fileStats.size > 10000) {
          const sizeMB = fileStats.size / 1024 / 1024
          log(`  Downloaded: ${sizeMB.toFixed(1)} MB`)
          track.fileSizeMB = Math.round(sizeMB * 10) / 10
          consecutiveFailures = 0
          batchDownloaded.push({ localPath: stagingPath, track })
        } else {
          track.status = "failed"
          track.error = `File too small (${fileStats.size} bytes)`
          log(`  ${track.error}`)
          failedMsgs.push(`${track.title} [${track.id}] — ${track.error}`)
          consecutiveFailures++
          try { await unlink(stagingPath) } catch { /* ignore */ }
        }
      } else {
        track.status = "failed"
        track.error = "Both blob and UI download failed"
        log(`  ${track.error}`)
        failedMsgs.push(`${track.title} [${track.id}] — ${track.error}`)
        consecutiveFailures++
      }

      await coreSaveManifest(manifestPath, manifest)

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log(`\nStopping: ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Session may be expired.`)
        break
      }

      if (batchDownloaded.length >= batchSize) {
        log(`\n--- Batch ${batchNum}/${totalBatches}: copying ${batchDownloaded.length} files to output ---`)
        for (const item of batchDownloaded) {
          const ok = await copyToOutput(item.localPath, item.track.id, outputDir)
          if (ok) {
            item.track.status = "downloaded"
            item.track.driveFilename = `${item.track.id}.wav`
            item.track.error = undefined
            await unlink(item.localPath)
            downloaded++
            log(`  + ${item.track.title} by ${item.track.artist} → Output`)
          } else {
            item.track.status = "failed"
            item.track.error = "Copy to output failed"
            failedMsgs.push(`${item.track.title} [${item.track.id}] — copy to output failed`)
            log(`  x ${item.track.title} — copy to output failed (staging file kept)`)
          }
        }
        await coreSaveManifest(manifestPath, manifest)
        batchDownloaded = []
        batchNum++
      }

      await randomDelay(300, 800)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      track.status = "failed"
      track.error = msg
      log(`  Error: ${msg}`)
      failedMsgs.push(`${track.title} [${track.id}] — ${msg}`)
      await coreSaveManifest(manifestPath, manifest)
      consecutiveFailures++

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log(`\nStopping: ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`)
        break
      }
    }
  }

  if (batchDownloaded.length > 0) {
    log(`\n--- Final batch (${batchDownloaded.length} files): copying to output ---`)
    for (const item of batchDownloaded) {
      const ok = await copyToOutput(item.localPath, item.track.id, outputDir)
      if (ok) {
        item.track.status = "downloaded"
        item.track.driveFilename = `${item.track.id}.wav`
        item.track.error = undefined
        await unlink(item.localPath)
        downloaded++
        log(`  + ${item.track.title} by ${item.track.artist} → Output`)
      } else {
        item.track.status = "failed"
        item.track.error = "Copy to output failed"
        failedMsgs.push(`${item.track.title} [${item.track.id}] — copy to output failed`)
        log(`  x ${item.track.title} — copy to output failed (staging file kept)`)
      }
    }
    await coreSaveManifest(manifestPath, manifest)
  }

  return { downloaded, failed: failedMsgs }
}
