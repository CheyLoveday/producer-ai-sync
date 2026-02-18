// Platform registry for GenVault

export interface PlatformAdapter {
  name: string
  // Future: methods for authentication, fetching, downloading, etc.
}

// Currently supported platforms
export const platforms = {
  "producer-ai": {
    name: "Producer.ai",
    // More platform-specific adapters will be added here
  },
  // Future platforms:
  // "suno": { ... },
  // "udio": { ... },
}

export type PlatformName = keyof typeof platforms

export function isPlatformSupported(name: string): name is PlatformName {
  return name in platforms
}

export function getSupportedPlatforms(): PlatformName[] {
  return Object.keys(platforms) as PlatformName[]
}
