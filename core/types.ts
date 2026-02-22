// Core types for GenVault - shared across all platforms

export type DownloadStatus = "pending" | "downloaded" | "failed"

export interface TrackMetadata {
  id: string
  title: string
  artist: string
  authorId: string
  genre: string
  prompt?: string
  lyrics?: string
  model?: string
  seed?: number | null
  playCount?: number
  favoriteCount?: number
  songUrl: string
  status: DownloadStatus
  driveFilename?: string
  fileSizeMB?: number
  lastAttempt?: string
  error?: string
  createdAt?: string
}

export interface Manifest {
  lastRun: string
  source: string
  totalFavorites?: number
  tracks: Record<string, TrackMetadata>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Page = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BrowserContext = any
