// Authentication utilities for GenVault

import type { BrowserContext } from "./types"
import { b64urlToUtf8 } from "./utils"

export interface AuthCredentials {
  bearer: string
  userId: string
}

export async function extractAuthFromCookies(
  context: BrowserContext,
  domain: string
): Promise<AuthCredentials> {
  const cookies = await context.cookies(domain)
  const parts = cookies
    .filter((c: any) => /auth-token(\.\d+)?$/.test(c.name))
    .map((c: any) => {
      const m = c.name.match(/\.(\d+)$/)
      return { idx: m ? Number(m[1]) : 0, val: c.value }
    })
    .sort((a: any, b: any) => a.idx - b.idx)
    .map((p: any) => p.val)

  if (!parts.length) throw new Error("No auth-token cookies found")
  const joined = parts.join("").replace(/^base64-/, "")
  const session = JSON.parse(b64urlToUtf8(joined))
  if (!session.access_token) throw new Error("No access_token in session")

  // Decode JWT payload to get user ID (sub claim)
  const bearer = session.access_token
  const jwtPayload = JSON.parse(b64urlToUtf8(bearer.split(".")[1]))
  const userId = jwtPayload.sub
  if (!userId) throw new Error("No sub (user ID) in JWT payload")

  return { bearer, userId }
}
