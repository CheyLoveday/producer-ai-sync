// Producer.ai platform configuration

export interface ProducerAiConfig {
  name: string
  baseUrl: string
  defaultMode: "favorites" | "published"
  pageSize: number
  fileExtension: string
  authStateName: string
}

export const config: ProducerAiConfig = {
  name: "producer-ai",
  baseUrl: "https://www.producer.ai",
  defaultMode: "favorites",
  pageSize: 20,
  fileExtension: ".wav",
  authStateName: ".producer-ai-auth.json",
}

export type SyncMode = "favorites" | "published"

export const API = {
  favorites: (page: number, limit: number) =>
    `${config.baseUrl}/__api/v2/generations/favorites?limit=${limit}&page=${page}`,
  published: (userId: string, offset: number, limit: number) =>
    `${config.baseUrl}/__api/v2/users/${userId}/generations?offset=${offset}&limit=${limit}&public=true`,
  download: (songId: string) =>
    `${config.baseUrl}/__api/${songId}/download?format=wav`,
  usernames: `${config.baseUrl}/__api/usernames/get`,
  stats: `${config.baseUrl}/__api/users/stats`,
} as const

export interface GenerationData {
  id: string
  title?: string
  lyrics?: string
  created_at?: string
  author_id?: string
  sound?: string
  seed?: number | null
  model_display_name?: string
  play_count?: number
  favorite_count?: number
  conditions?: Array<{ prompt?: string | null; lyrics?: string }>
  [key: string]: unknown
}
