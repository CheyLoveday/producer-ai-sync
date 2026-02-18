// Manifest management and file verification for GenVault

import { writeFile, readFile, mkdir, readdir } from "fs/promises"
import { join } from "path"
import type { Manifest, TrackMetadata } from "./types"
import { log, sanitizeFilename } from "./utils"

export async function loadManifest(manifestPath: string, source: string): Promise<Manifest> {
  try {
    const raw = await readFile(manifestPath, "utf-8")
    return JSON.parse(raw)
  } catch {
    return { lastRun: "", source, tracks: {} }
  }
}

export async function saveManifest(manifestPath: string, manifest: Manifest): Promise<void> {
  manifest.lastRun = new Date().toISOString()
  const outputDir = join(manifestPath, "..")
  await mkdir(outputDir, { recursive: true })
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
}

export async function verifyDownloadedFiles(
  manifest: Manifest,
  outputDir: string,
  fileExtension: string = ".wav"
): Promise<{ missing: number; verified: number }> {
  const downloaded = Object.values(manifest.tracks).filter(
    (t) => t.status === "downloaded"
  )

  if (downloaded.length === 0) {
    log("No tracks marked as downloaded — nothing to verify.")
    return { missing: 0, verified: 0 }
  }

  let driveFiles: Set<string>
  try {
    const files = await readdir(outputDir)
    driveFiles = new Set(files.filter((f) => f.endsWith(fileExtension)))
  } catch {
    log(`Output directory not accessible: ${outputDir}`)
    return { missing: 0, verified: 0 }
  }

  log(`Verifying ${downloaded.length} tracks marked as downloaded...`)
  let missing = 0

  for (const track of downloaded) {
    const uuidFilename = `${track.id}${fileExtension}`
    const titleFilename = sanitizeFilename(
      `${track.artist} - ${track.title}${fileExtension}`
    )
    const found = driveFiles.has(uuidFilename) || driveFiles.has(titleFilename)

    if (!found) {
      log(`  MISSING: "${track.title}" by ${track.artist} [${track.id}]`)
      track.status = "pending"
      track.driveFilename = undefined
      track.error = "File missing from output directory (detected by --verify)"
      missing++
    }
  }

  const verified = downloaded.length - missing

  if (missing > 0) {
    log(`\n${missing} files missing — marked as pending for redownload.`)
  } else {
    log("All downloaded tracks verified in output directory.")
  }

  return { missing, verified }
}
