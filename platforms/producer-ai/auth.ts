// Producer.ai authentication and navigation

import type { Page, BrowserContext } from "../../core/types"
import { log, randomDelay } from "../../core/utils"
import { navigateWithCF } from "../../core/browser"
import { config } from "./config"

export async function navigateAndLogin(
  page: Page,
  context: BrowserContext,
  authStatePath: string
): Promise<void> {
  log("Navigating to profile page (CF challenge)...")
  await navigateWithCF(page, config.baseUrl)

  try {
    await page.waitForSelector('div[role="button"]', { timeout: 15000 })
  } catch {}

  try {
    await context.storageState({ path: authStatePath })
  } catch {}

  log("Navigating to /library/favorites...")
  await page.goto(`${config.baseUrl}/library/favorites`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })

  await page.waitForFunction(
    () =>
      !document.title.toLowerCase().includes("just a moment") &&
      !document.title.toLowerCase().includes("cloudflare"),
    { timeout: 30000 }
  ).catch(() => {})

  await new Promise((r) => setTimeout(r, 3000))

  const currentUrl = page.url()
  if (currentUrl.includes("/login") || !currentUrl.includes("/library/favorites")) {
    log("Redirected to login — please log in manually in the browser window...")
    log("Waiting up to 2 minutes for login...")

    try {
      await page.waitForURL((url: URL) => {
        const s = url.toString()
        return s.includes("producer.ai") && !s.includes("/login") && !s.includes("/auth") && !s.includes("discord.com")
      }, { timeout: 120000 })
    } catch {
      throw new Error("Login timed out after 2 minutes")
    }

    await new Promise((r) => setTimeout(r, 3000))
    log(`Logged in! Now at: ${page.url()}`)

    try {
      await context.storageState({ path: authStatePath })
      log("Auth state saved after login.")
    } catch {}

    if (!page.url().includes("/library/favorites")) {
      log("Re-navigating to /library/favorites...")
      await page.goto(`${config.baseUrl}/library/favorites`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })
      await page.waitForFunction(
        () =>
          !document.title.toLowerCase().includes("just a moment") &&
          !document.title.toLowerCase().includes("cloudflare"),
        { timeout: 30000 }
      ).catch(() => {})
    }
  }

  await new Promise((r) => setTimeout(r, 5000))
  log(`On favorites page: ${page.url()}`)

  try {
    await context.storageState({ path: authStatePath })
  } catch {}
}
