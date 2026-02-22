// GenVault CLI - Main entry point

import { parseArgs } from "util"
import { mkdir, readdir } from "fs/promises"
import { join, resolve } from "path"
import { launchBrowser } from "../core/browser"
import { extractAuthFromCookies } from "../core/auth"
import { loadManifest, saveManifest, verifyDownloadedFiles } from "../core/manifest"
import { log, debug as debugLog } from "../core/utils"
import { isPlatformSupported, getSupportedPlatforms } from "../platforms"

// Producer.ai imports
import { config as producerConfig, type SyncMode } from "../platforms/producer-ai/config"
import * as producerApi from "../platforms/producer-ai/api"
import { navigateAndLogin } from "../platforms/producer-ai/auth"
import { downloadPendingTracks } from "../platforms/producer-ai/downloader"

const { values: CLI } = parseArgs({
  options: {
    platform:  { type: "string", short: "p", default: "producer-ai" },
    mode:      { type: "string", short: "m", default: "favorites" },
    batch:     { type: "string", short: "b", default: "10" },
    output:    { type: "string", short: "o" },
    "dry-run": { type: "boolean", default: false },
    verify:    { type: "boolean", default: false },
    debug:     { type: "boolean", short: "d", default: false },
    help:      { type: "boolean", short: "h", default: false },
  },
  strict: false,
})

if (CLI.help) {
  console.log(`GenVault - Ethical backup tool for music generation platforms

Usage: npx tsx src/cli.ts [options]

For personal backup of content you own/are authorized to download only.
Comply with platform Terms of Service and copyright permissions.
No circumvention, no bulk scraping, no redistribution. Use at your own risk.

Options:
  --platform NAME, -p  Platform to backup from (default: producer-ai)
                       Supported: ${getSupportedPlatforms().join(", ")}
  --mode MODE, -m      "favorites" (default) or "published" (your own tracks)
                       (Currently applies to producer-ai only)
  --output DIR, -o     Where to save audio files (default: ./downloads)
  --batch N, -b N      Tracks per batch before copying to output (default: 10)
  --dry-run            Show what would be downloaded, don't download
  --verify             Check output dir for missing files, mark for redownload
  --debug, -d          Enable verbose logging
  --help, -h           Show this help

Examples:
  npx tsx src/cli.ts --dry-run
  npx tsx src/cli.ts --platform producer-ai --mode published --output ~/Music/MyTracks
  npx tsx src/cli.ts --output ~/Music/Backups --batch 5
  npx tsx src/cli.ts --verify
`)
  process.exit(0)
}

const PLATFORM = CLI.platform as string
const HOME = process.env.HOME || process.env.USERPROFILE || "."
const OUTPUT_DATA_DIR = resolve("data/output")
const OUTPUT_DIR = CLI.output ? resolve(CLI.output as string) : resolve("downloads")
const BATCH_SIZE = Math.max(1, parseInt(CLI.batch as string, 10) || 10)
const DRY_RUN = !!CLI["dry-run"]
const VERIFY = !!CLI.verify
const DEBUG = !!CLI.debug || !!process.env.DEBUG

// Platform-specific configuration (currently only Producer.ai)
if (PLATFORM !== "producer-ai") {
  log(`ERROR: Platform "${PLATFORM}" not yet supported.`)
  log(`Supported platforms: ${getSupportedPlatforms().join(", ")}`)
  log(`Coming soon: Suno, Udio, and more!`)
  process.exit(1)
}

const MODE: SyncMode = (CLI.mode as string) === "published" ? "published" : "favorites"
const MANIFEST_FILENAME = MODE === "published" ? "published.json" : "favorites.json"
const MANIFEST_PATH = join(OUTPUT_DATA_DIR, MANIFEST_FILENAME)
const AUTH_STATE_PATH = join(HOME, producerConfig.authStateName)

function printSummary(
  downloadedThisRun: number,
  failedThisRun: string[],
  totalTracks: number,
  downloadedTotal: number,
  pending: number,
  failed: number
): void {
  console.log("\n" + "═".repeat(60))
  console.log("  SYNC SUMMARY")
  console.log("═".repeat(60))
  console.log(`  Total tracks in manifest:  ${totalTracks}`)
  console.log(`  Downloaded (all time):     ${downloadedTotal}`)
  console.log(`  Downloaded this run:       ${downloadedThisRun}`)
  console.log(`  Failed:                    ${failed}`)
  console.log(`  Remaining:                 ${pending}`)
  console.log("═".repeat(60))

  if (failedThisRun.length > 0) {
    console.log("\n  FAILED THIS RUN:")
    for (const msg of failedThisRun) {
      console.log(`    - ${msg}`)
    }
  }

  if (pending > 0) {
    console.log(`\n  Run again to continue downloading remaining tracks.`)
  }
  console.log("")
}

async function main(): Promise<void> {
  log(`Platform: ${PLATFORM}`)
  log(`Mode: ${MODE}`)
  await mkdir(OUTPUT_DATA_DIR, { recursive: true })

  // Verify-only mode
  if (VERIFY) {
    const manifest = await loadManifest(MANIFEST_PATH, MODE)
    const trackCount = Object.keys(manifest.tracks).length
    if (trackCount === 0) {
      log("Manifest is empty. Run without --verify first to populate it.")
      return
    }
    log(`Loaded manifest with ${trackCount} tracks`)
    const { missing, verified } = await verifyDownloadedFiles(
      manifest,
      OUTPUT_DIR,
      producerConfig.fileExtension
    )
    if (missing > 0) {
      await saveManifest(MANIFEST_PATH, manifest)
    }
    return
  }

  const { browser, context, page } = await launchBrowser(AUTH_STATE_PATH)

  try {
    // Step 1: Navigate and login
    await navigateAndLogin(page, context, AUTH_STATE_PATH)

    // Step 2: Extract authentication
    let bearer: string
    let userId: string
    try {
      const auth = await extractAuthFromCookies(context, producerConfig.baseUrl)
      bearer = auth.bearer
      userId = auth.userId
      debugLog(DEBUG, `Bearer token extracted (${bearer.length} chars), userId: ${userId}`)
    } catch (err) {
      log(`ERROR: Could not extract auth: ${err}`)
      log(`Try deleting ${AUTH_STATE_PATH} and running again to re-authenticate.`)
      await browser.close()
      process.exit(1)
    }

    // Step 3: Verify auth
    const authed = await producerApi.verifyAuth(page, bearer, DEBUG)
    if (!authed) {
      log("ERROR: Authentication failed. API not responding.")
      log(`Try deleting ${AUTH_STATE_PATH} and running again to re-authenticate.`)
      await browser.close()
      process.exit(1)
    }

    // Load existing manifest
    const manifest = await loadManifest(MANIFEST_PATH, MODE)
    const existingCount = Object.keys(manifest.tracks).length
    if (existingCount > 0) {
      const dl = Object.values(manifest.tracks).filter(
        (t) => t.status === "downloaded"
      ).length
      log(`Loaded manifest: ${existingCount} tracks (${dl} downloaded)`)
    }

    // Step 4: Fetch all tracks
    let apiTracks
    if (MODE === "published") {
      apiTracks = await producerApi.fetchAllPublished(page, bearer, userId, DEBUG)
    } else {
      apiTracks = await producerApi.fetchAllFavorites(page, bearer, DEBUG)
    }

    if (apiTracks.length === 0) {
      log(`No ${MODE} tracks found via API.`)
      await browser.close()
      return
    }

    manifest.totalFavorites = apiTracks.length

    // Step 5: Resolve usernames
    const authorIds = [...new Set(
      apiTracks
        .map((g) => g.author_id)
        .filter((id): id is string => !!id && id.length > 0)
    )]
    const usernameMap = await producerApi.resolveUsernames(page, authorIds, DEBUG)
    log(`Resolved ${usernameMap.size} artist usernames`)

    // Step 6: Merge into manifest
    const { newCount } = await producerApi.mergeTracks(manifest, apiTracks, usernameMap, OUTPUT_DIR, DEBUG)
    const totalCount = Object.keys(manifest.tracks).length
    if (newCount > 0) {
      log(`Found ${newCount} new tracks (${totalCount} total in manifest)`)
    } else {
      log(`No new tracks found (${totalCount} total in manifest)`)
    }
    await saveManifest(MANIFEST_PATH, manifest)

    // Count statuses
    const entries = Object.values(manifest.tracks)
    const pendingCount = entries.filter(
      (t) => t.status === "pending" || t.status === "failed"
    ).length
    const downloadedCount = entries.filter(
      (t) => t.status === "downloaded"
    ).length
    const failedCount = entries.filter((t) => t.status === "failed").length
    log(`${downloadedCount} downloaded, ${pendingCount} pending`)

    // Dry run
    if (DRY_RUN) {
      const pendingEntries = entries
        .filter((t) => t.status === "pending" || t.status === "failed")
        .sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return db - da
        })

      console.log("\n" + "═".repeat(60))
      console.log("  DRY RUN — no downloads will be performed")
      console.log("═".repeat(60))
      console.log(`  Total in manifest:     ${totalCount}`)
      console.log(`  Already downloaded:    ${downloadedCount}`)
      console.log(`  Would download:        ${pendingEntries.length}`)
      console.log("═".repeat(60))

      if (pendingEntries.length > 0 && pendingEntries.length <= 30) {
        console.log("\n  PENDING TRACKS:")
        for (const t of pendingEntries) {
          console.log(`    - ${t.artist} — ${t.title} [${t.id}]${t.error ? ` (prev: ${t.error})` : ""}`)
        }
      } else if (pendingEntries.length > 30) {
        console.log("\n  PENDING TRACKS (first 30):")
        for (const t of pendingEntries.slice(0, 30)) {
          console.log(`    - ${t.artist} — ${t.title} [${t.id}]${t.error ? ` (prev: ${t.error})` : ""}`)
        }
        console.log(`    ... and ${pendingEntries.length - 30} more`)
      }
      console.log("")

      await browser.close()
      return
    }

    // Step 7: Download pending tracks
    log(`\nStarting audio downloads...`)
    const { downloaded, failed } = await downloadPendingTracks(
      page,
      context,
      manifest,
      MANIFEST_PATH,
      OUTPUT_DIR,
      BATCH_SIZE,
      DEBUG
    )

    // Save final auth state
    try {
      await context.storageState({ path: AUTH_STATE_PATH })
      log("Saved updated storage state for next run")
    } catch {
      debugLog(DEBUG, "Could not save final storage state")
    }

    printSummary(
      downloaded,
      failed,
      totalCount,
      downloadedCount + downloaded,
      pendingCount - downloaded,
      failedCount
    )

    await browser.close()
  } catch (err) {
    log(`Fatal error: ${err instanceof Error ? err.message : err}`)
    await browser?.close().catch(() => {})
    throw err
  }
}

// Run if executed directly
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("cli.ts") ||
  process.argv[1]?.endsWith("cli.js")

if (isMainModule) {
  main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
  })
}
