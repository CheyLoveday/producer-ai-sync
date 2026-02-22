// Browser automation utilities for GenVault

import { chromium as patchrightChromium } from "patchright"
import { existsSync } from "fs"
import type { BrowserContext, Page } from "./types"
import { log, randomDelay } from "./utils"

// Anti-detection browser args
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-infobars",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--window-size=1920,1080",
]

export async function launchBrowser(authStatePath?: string): Promise<{
  browser: any
  context: BrowserContext
  page: Page
}> {
  log("Launching Patchright browser...")

  const browser = await patchrightChromium.launch({
    headless: false,
    args: STEALTH_ARGS,
  })

  const context = await browser.newContext({
    storageState: authStatePath && existsSync(authStatePath) ? authStatePath : undefined,
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    colorScheme: "dark",
    acceptDownloads: true,
  })

  const page = await context.newPage()
  await new Promise((r) => setTimeout(r, 1000))

  return { browser, context, page }
}

export async function navigateWithCF(page: Page, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })

  await page.waitForFunction(
    () =>
      !document.title.toLowerCase().includes("just a moment") &&
      !document.title.toLowerCase().includes("attention required") &&
      !document.title.toLowerCase().includes("cloudflare"),
    { timeout: 60000 }
  ).catch(() => {
    log("Warning: CF challenge wait timed out")
  })

  await randomDelay(1000, 2000)
}
