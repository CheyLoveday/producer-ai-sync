// Producer.ai platform-specific API calls and data transformations

import { readdir } from "fs/promises"
import type { Page } from "../../core/types"
import type { TrackMetadata, Manifest } from "../../core/types"
import { log, debug as debugLog, randomDelay, sanitizeFilename } from "../../core/utils"
import { API, type GenerationData, type SyncMode, config } from "./config"

export async function fetchJsonViaPage(
  page: Page,
  url: string,
  options?: { method?: string; body?: string }
): Promise<{ ok: boolean; status: number; data: any }> {
  return page.evaluate(
    async (args: { url: string; method?: string; body?: string }) => {
      try {
        const init: RequestInit = { credentials: "include" }
        if (args.method) init.method = args.method
        if (args.body) {
          init.body = args.body
          init.headers = { "Content-Type": "application/json" }
        }
        const resp = await fetch(args.url, init)
        if (!resp.ok) return { ok: false, status: resp.status, data: null }
        const data = await resp.json()
        return { ok: true, status: resp.status, data }
      } catch (err: any) {
        return { ok: false, status: 0, data: err?.message ?? String(err) }
      }
    },
    { url, method: options?.method, body: options?.body }
  )
}

export async function verifyAuth(
  page: Page,
  bearer: string,
  isDebug: boolean
): Promise<boolean> {
  try {
    const result = await page.evaluate(
      async (args: { url: string; bearer: string }) => {
        try {
          const resp = await fetch(args.url, {
            credentials: "include",
            headers: { Authorization: `Bearer ${args.bearer}` },
          })
          if (!resp.ok) return { ok: false, status: resp.status, data: null }
          const data = await resp.json()
          return { ok: true, status: resp.status, data }
        } catch (err: any) {
          return { ok: false, status: 0, data: err?.message ?? String(err) }
        }
      },
      { url: API.favorites(0, 1), bearer }
    )

    if (!result.ok) {
      log(`Auth check failed: HTTP ${result.status}`)
      return false
    }
    if (Array.isArray(result.data)) {
      log(`Auth verified — favorites API responding (${result.data.length} items in test)`)
      return true
    }
    log("Auth check: unexpected response format")
    debugLog(isDebug, `Response: ${JSON.stringify(result.data).slice(0, 200)}`)
    return false
  } catch (err) {
    log(`Auth check error: ${err instanceof Error ? err.message : err}`)
    return false
  }
}

export async function fetchAllFavorites(
  page: Page,
  bearer: string,
  isDebug: boolean
): Promise<GenerationData[]> {
  const allFavorites: GenerationData[] = []
  const seenIds = new Set<string>()
  let pageNum = 0

  log("Fetching favorites via API...")

  while (true) {
    debugLog(isDebug, `  Fetching page=${pageNum} limit=${config.pageSize}`)

    const url = API.favorites(pageNum, config.pageSize)
    const result = await page.evaluate(
      async (args: { url: string; bearer: string }) => {
        try {
          const resp = await fetch(args.url, {
            credentials: "include",
            headers: { Authorization: `Bearer ${args.bearer}` },
          })
          if (!resp.ok) return { ok: false, status: resp.status, data: null }
          const data = await resp.json()
          return { ok: true, status: resp.status, data }
        } catch (err: any) {
          return { ok: false, status: 0, data: err?.message ?? String(err) }
        }
      },
      { url, bearer }
    )

    if (!result.ok) {
      log(`  API error at page ${pageNum}: HTTP ${result.status}`)
      break
    }

    const generations: GenerationData[] = Array.isArray(result.data) ? result.data : []

    if (generations.length === 0) {
      debugLog(isDebug, `  No more favorites at page ${pageNum}`)
      break
    }

    let newCount = 0
    for (const gen of generations) {
      if (gen.id && !seenIds.has(gen.id)) {
        seenIds.add(gen.id)
        allFavorites.push(gen)
        newCount++
      }
    }

    log(`  Fetched ${allFavorites.length} favorites so far... (+${newCount} new from page ${pageNum})`)

    if (generations.length < config.pageSize) {
      break
    }

    pageNum++
    await randomDelay(200, 500)
  }

  log(`Fetched ${allFavorites.length} favorites total from API`)
  return allFavorites
}

export async function fetchAllPublished(
  page: Page,
  _bearer: string,
  userId: string,
  isDebug: boolean
): Promise<GenerationData[]> {
  const allTracks: GenerationData[] = []
  const seenIds = new Set<string>()
  let offset = 0

  log(`Fetching published tracks for user ${userId}...`)

  while (true) {
    debugLog(isDebug, `  Fetching offset=${offset} limit=${config.pageSize}`)

    const url = API.published(userId, offset, config.pageSize)
    const result = await page.evaluate(
      async (args: { url: string }) => {
        try {
          const resp = await fetch(args.url, { credentials: "include" })
          if (!resp.ok) return { ok: false, status: resp.status, data: null }
          const data = await resp.json()
          return { ok: true, status: resp.status, data }
        } catch (err: any) {
          return { ok: false, status: 0, data: err?.message ?? String(err) }
        }
      },
      { url }
    )

    if (!result.ok) {
      log(`  API error at offset ${offset}: HTTP ${result.status}`)
      break
    }

    const raw = result.data?.generations ?? result.data
    const generations: GenerationData[] = Array.isArray(raw) ? raw : []

    if (generations.length === 0) {
      debugLog(isDebug, `  No more tracks at offset ${offset}`)
      break
    }

    let newCount = 0
    for (const gen of generations) {
      if (gen.id && !seenIds.has(gen.id)) {
        seenIds.add(gen.id)
        allTracks.push(gen)
        newCount++
      }
    }

    log(`  Fetched ${allTracks.length} published tracks so far... (+${newCount} new from offset ${offset})`)

    if (generations.length < config.pageSize) {
      break
    }

    offset += config.pageSize
    await randomDelay(200, 500)
  }

  log(`Fetched ${allTracks.length} published tracks total from API`)
  return allTracks
}

export async function resolveUsernames(
  page: Page,
  authorIds: string[],
  isDebug: boolean
): Promise<Map<string, string>> {
  const usernameMap = new Map<string, string>()
  if (authorIds.length === 0) return usernameMap

  const uniqueIds = [...new Set(authorIds)]
  debugLog(isDebug, `Resolving ${uniqueIds.length} unique author IDs to usernames`)

  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50)

    const result = await fetchJsonViaPage(
      page,
      API.usernames,
      { method: "POST", body: JSON.stringify({ user_ids: batch }) }
    )

    if (result.ok && result.data?.data && Array.isArray(result.data.data)) {
      for (const entry of result.data.data) {
        if (entry.user_id && (entry.username || entry.fallback_name)) {
          usernameMap.set(entry.user_id, entry.username || entry.fallback_name)
        }
      }
    }

    await randomDelay(100, 300)
  }

  debugLog(isDebug, `Resolved ${usernameMap.size} usernames`)
  return usernameMap
}

export async function mergeTracks(
  manifest: Manifest,
  generations: GenerationData[],
  usernameMap: Map<string, string>,
  outputDir: string,
  isDebug: boolean
): Promise<{ newCount: number }> {
  let newCount = 0

  let driveFiles: Set<string> | null = null
  const loadDriveFiles = async () => {
    if (driveFiles !== null) return driveFiles
    try {
      const files = await readdir(outputDir)
      driveFiles = new Set(files.filter((f) => f.endsWith(config.fileExtension)))
    } catch {
      driveFiles = new Set()
    }
    return driveFiles
  }

  for (const gen of generations) {
    if (!gen.id) continue

    const songId = gen.id
    const title = gen.title ?? "Untitled"
    const authorId = gen.author_id ?? ""
    const artist = usernameMap.get(authorId) ?? "Unknown Artist"
    const genre = gen.sound ?? "Unknown"
    const prompt = gen.conditions?.[0]?.prompt ?? undefined
    const model = gen.model_display_name ?? undefined
    const seed = gen.seed ?? undefined
    const playCount = gen.play_count ?? undefined
    const favoriteCount = gen.favorite_count ?? undefined

    if (!manifest.tracks[songId]) {
      const files = await loadDriveFiles()
      const uuidFilename = `${songId}${config.fileExtension}`
      const titleFilename = sanitizeFilename(`${artist} - ${title}${config.fileExtension}`)
      const alreadyOnDrive = files.has(uuidFilename) || files.has(titleFilename)
      const driveFilename = files.has(uuidFilename)
        ? uuidFilename
        : files.has(titleFilename)
          ? titleFilename
          : undefined

      manifest.tracks[songId] = {
        id: songId,
        title,
        artist,
        authorId,
        genre,
        prompt,
        lyrics: gen.lyrics,
        model,
        seed,
        playCount,
        favoriteCount,
        songUrl: `${config.baseUrl}/song/${songId}`,
        status: alreadyOnDrive ? "downloaded" : "pending",
        driveFilename,
        createdAt: gen.created_at,
      }
      newCount++
      if (alreadyOnDrive) {
        debugLog(isDebug, `  [already on Drive] ${title} → ${driveFilename}`)
      }
    } else {
      // Update metadata, preserve status
      const existing = manifest.tracks[songId]
      existing.title = title
      existing.artist = artist
      existing.authorId = authorId
      existing.genre = genre
      existing.prompt = prompt
      existing.lyrics = gen.lyrics
      existing.model = model
      existing.seed = seed
      existing.playCount = playCount
      existing.favoriteCount = favoriteCount
      existing.createdAt = gen.created_at
    }
  }

  return { newCount }
}
