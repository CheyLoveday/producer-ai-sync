// Core utilities for GenVault

export function log(...args: unknown[]) {
  console.log("[genvault]", ...args)
}

export function debug(isDebug: boolean, ...args: unknown[]) {
  if (isDebug) console.log("[DEBUG]", ...args)
}

export function randomDelay(min = 300, max = 800): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min
  return new Promise((r) => setTimeout(r, ms))
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim()
}

export function b64urlToUtf8(b64url: string): string {
  const b64 =
    b64url.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((b64url.length + 3) % 4)
  return Buffer.from(b64, "base64").toString("utf8")
}
