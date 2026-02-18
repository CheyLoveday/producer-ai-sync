// producer-ai-sync — Personal backup tool for Producer.ai tracks
// MIT License | https://github.com/CheyLoveday/producer-ai-sync
//
// For personal backup of content you own/are authorized to download only.
// Comply with Producer.ai Terms (https://www.producer.ai/terms) and copyright
// permissions. No circumvention, no bulk scraping, no redistribution.
// Use at your own risk. Provided "AS IS", no warranty.

import { chromium as patchrightChromium } from "patchright";
import { writeFile, readFile, mkdir, unlink, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { parseArgs } from "util";

// ─── CLI args ────────────────────────────────────────────────────────────────

const { values: CLI } = parseArgs({
  options: {
    mode:         { type: "string", short: "m", default: "favorites" },
    output:       { type: "string", short: "o" },
    "dry-run":    { type: "boolean", default: false },
    "lyrics-only":{ type: "boolean", default: false },
    verify:       { type: "boolean", default: false },
    debug:        { type: "boolean", short: "d", default: false },
    help:         { type: "boolean", short: "h", default: false },
  },
  strict: false,
});

if (CLI.help) {
  console.log(`Usage: npx tsx sync-favorites.ts [options]

Options:
  --mode MODE, -m    "favorites" (default) or "published" (your own tracks)
  --output DIR, -o   Where to save WAV files (default: ./downloads)
  --dry-run          Show what would be downloaded, don't download
  --lyrics-only      Fetch metadata + lyrics only, skip audio downloads
  --verify           Check output dir for missing files, mark for redownload
  --debug, -d        Enable verbose logging
  --help, -h         Show this help

Examples:
  npx tsx sync-favorites.ts --dry-run
  npx tsx sync-favorites.ts --mode published --output ~/Music/MyTracks
  npx tsx sync-favorites.ts --output ~/Music/ProducerAI
  npx tsx sync-favorites.ts --lyrics-only
  npx tsx sync-favorites.ts --verify
`);
  process.exit(0);
}

// ─── Config ──────────────────────────────────────────────────────────────────

const HOME = process.env.HOME || process.env.USERPROFILE || ".";
const BASE_URL = "https://www.producer.ai";
const AUTH_STATE_PATH = join(HOME, ".producer-ai-auth.json");
const OUTPUT_DIR = resolve("data/output");
// FAVORITES_JSON_ACTUAL defined after MODE is resolved (see MANIFEST_FILENAME below)
const DRIVE_DIR = CLI.output ? resolve(CLI.output as string) : resolve("downloads");

type SyncMode = "favorites" | "published";
const MODE: SyncMode = (CLI.mode as string) === "published" ? "published" : "favorites";
const DRY_RUN = !!CLI["dry-run"];
const LYRICS_ONLY = !!CLI["lyrics-only"];
const VERIFY = !!CLI.verify;
const DEBUG = !!CLI.debug || !!process.env.DEBUG;

// favorites: page-based pagination (page=0,1,2...)
// published: offset-based pagination (offset=0,20,40...)
const API = {
  favorites: (page: number, limit: number) =>
    `${BASE_URL}/__api/v2/generations/favorites?limit=${limit}&page=${page}`,
  published: (userId: string, offset: number, limit: number) =>
    `${BASE_URL}/__api/v2/users/${userId}/generations?offset=${offset}&limit=${limit}&public=true`,
  download: (songId: string) =>
    `${BASE_URL}/__api/${songId}/download?format=wav`,
  usernames: `${BASE_URL}/__api/usernames/get`,
  stats: `${BASE_URL}/__api/users/stats`,
} as const;

const PAGE_SIZE = LYRICS_ONLY ? 100 : 20; // larger pages for metadata-only fetches
const MANIFEST_FILENAME = MODE === "published" ? "published.json" : "favorites.json";
const FAVORITES_JSON_ACTUAL = join(OUTPUT_DIR, MANIFEST_FILENAME);

// ─── Anti-detection browser args ─────────────────────────────────────────────

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
];

// ─── Types ───────────────────────────────────────────────────────────────────

type DownloadStatus = "pending" | "downloaded" | "failed";

interface FavoriteEntry {
  id: string;
  title: string;
  artist: string;
  authorId: string;
  genre: string;
  prompt?: string;
  lyrics?: string;
  model?: string;
  seed?: number | null;
  playCount?: number;
  favoriteCount?: number;
  songUrl: string;
  status: DownloadStatus;
  driveFilename?: string;
  fileSizeMB?: number;
  lastAttempt?: string;
  error?: string;
  createdAt?: string;
}

interface Manifest {
  lastRun: string;
  source: string;
  totalFavorites?: number;
  tracks: Record<string, FavoriteEntry>;
}

interface GenerationData {
  id: string;
  title?: string;
  lyrics?: string;
  created_at?: string;
  author_id?: string;
  sound?: string;
  seed?: number | null;
  model_display_name?: string;
  play_count?: number;
  favorite_count?: number;
  conditions?: Array<{ prompt?: string | null; lyrics?: string }>;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrowserContext = any;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(...args: unknown[]) {
  console.log(`[sync-${MODE}]`, ...args);
}

function debug(...args: unknown[]) {
  if (DEBUG) console.log(`[DEBUG]`, ...args);
}

function randomDelay(min = 300, max = 800): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
}

function b64urlToUtf8(b64url: string): string {
  const b64 =
    b64url.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64").toString("utf8");
}

// ─── Manifest ────────────────────────────────────────────────────────────────

async function loadManifest(): Promise<Manifest> {
  try {
    const raw = await readFile(FAVORITES_JSON_ACTUAL, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { lastRun: "", source: MODE, tracks: {} };
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  manifest.lastRun = new Date().toISOString();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(FAVORITES_JSON_ACTUAL, JSON.stringify(manifest, null, 2));
}

// ─── Verify Drive files ──────────────────────────────────────────────────────

async function verifyDriveFiles(manifest: Manifest): Promise<void> {
  const downloaded = Object.values(manifest.tracks).filter(
    (t) => t.status === "downloaded"
  );

  if (downloaded.length === 0) {
    log("No tracks marked as downloaded — nothing to verify.");
    return;
  }

  let driveFiles: Set<string>;
  try {
    const files = await readdir(DRIVE_DIR);
    driveFiles = new Set(files.filter((f) => f.endsWith(".wav")));
  } catch {
    log(`Drive directory not accessible: ${DRIVE_DIR}`);
    return;
  }

  log(`Verifying ${downloaded.length} favorites marked as downloaded...`);
  let missing = 0;

  for (const track of downloaded) {
    const uuidFilename = `${track.id}.wav`;
    const titleFilename = sanitizeFilename(
      `${track.artist} - ${track.title}.wav`
    );
    const found = driveFiles.has(uuidFilename) || driveFiles.has(titleFilename);

    if (!found) {
      log(`  MISSING: "${track.title}" by ${track.artist} [${track.id}]`);
      track.status = "pending";
      track.driveFilename = undefined;
      track.error = "File missing from Drive (detected by --verify)";
      missing++;
    }
  }

  if (missing > 0) {
    log(`\n${missing} files missing from Drive — marked as pending for redownload.`);
    await saveManifest(manifest);
  } else {
    log("All downloaded favorites verified on Drive.");
  }
}

// ─── Launch browser ──────────────────────────────────────────────────────────

async function launchBrowser(): Promise<{
  browser: any;
  context: BrowserContext;
  page: Page;
}> {
  log("Launching Patchright browser...");

  const browser = await patchrightChromium.launch({
    headless: false,
    args: STEALTH_ARGS,
  });

  const context = await browser.newContext({
    storageState: existsSync(AUTH_STATE_PATH) ? AUTH_STATE_PATH : undefined,
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    colorScheme: "dark",
    acceptDownloads: true,
  });

  const page = await context.newPage();
  await new Promise((r) => setTimeout(r, 1000));

  return { browser, context, page };
}

// ─── Navigate + pass CF challenge ────────────────────────────────────────────

async function navigateWithCF(page: Page, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForFunction(
    () =>
      !document.title.toLowerCase().includes("just a moment") &&
      !document.title.toLowerCase().includes("attention required") &&
      !document.title.toLowerCase().includes("cloudflare"),
    { timeout: 60000 }
  ).catch(() => {
    log("Warning: CF challenge wait timed out");
  });

  await randomDelay(1000, 2000);
}

// ─── Navigate to favorites page (with auth handling) ─────────────────────────

async function navigateToFavorites(
  page: Page,
  context: BrowserContext
): Promise<void> {
  // First navigate to profile to pass CF challenge
  log("Navigating to profile page (CF challenge)...");
  await navigateWithCF(page, BASE_URL);

  try {
    await page.waitForSelector('div[role="button"]', { timeout: 15000 });
  } catch {}

  // Save auth state
  try {
    await context.storageState({ path: AUTH_STATE_PATH });
  } catch {}

  // Now navigate to favorites
  log("Navigating to /library/favorites...");
  await page.goto(`${BASE_URL}/library/favorites`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForFunction(
    () =>
      !document.title.toLowerCase().includes("just a moment") &&
      !document.title.toLowerCase().includes("cloudflare"),
    { timeout: 30000 }
  ).catch(() => {});

  await new Promise((r) => setTimeout(r, 3000));

  // Check if we got redirected to login
  const currentUrl = page.url();
  if (currentUrl.includes("/login") || !currentUrl.includes("/library/favorites")) {
    log("Redirected to login — please log in manually in the browser window...");
    log("Waiting up to 2 minutes for login...");

    try {
      await page.waitForURL((url: URL) => {
        const s = url.toString();
        return s.includes("producer.ai") && !s.includes("/login") && !s.includes("/auth") && !s.includes("discord.com");
      }, { timeout: 120000 });
    } catch {
      throw new Error("Login timed out after 2 minutes");
    }

    await new Promise((r) => setTimeout(r, 3000));
    log(`Logged in! Now at: ${page.url()}`);

    // Save auth state after login
    try {
      await context.storageState({ path: AUTH_STATE_PATH });
      log("Auth state saved after login.");
    } catch {}

    // Navigate to favorites if not already there
    if (!page.url().includes("/library/favorites")) {
      log("Re-navigating to /library/favorites...");
      await page.goto(`${BASE_URL}/library/favorites`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForFunction(
        () =>
          !document.title.toLowerCase().includes("just a moment") &&
          !document.title.toLowerCase().includes("cloudflare"),
        { timeout: 30000 }
      ).catch(() => {});
    }
  }

  // Wait for favorites page to fully load
  await new Promise((r) => setTimeout(r, 5000));
  log(`On favorites page: ${page.url()}`);

  // Save auth state
  try {
    await context.storageState({ path: AUTH_STATE_PATH });
  } catch {}
}

// ─── Browser-native fetch (JSON) ─────────────────────────────────────────────

async function fetchJsonViaPage(
  page: Page,
  url: string,
  options?: { method?: string; body?: string }
): Promise<{ ok: boolean; status: number; data: any }> {
  return page.evaluate(
    async (args: { url: string; method?: string; body?: string }) => {
      try {
        const init: RequestInit = { credentials: "include" };
        if (args.method) init.method = args.method;
        if (args.body) {
          init.body = args.body;
          init.headers = { "Content-Type": "application/json" };
        }
        const resp = await fetch(args.url, init);
        if (!resp.ok) return { ok: false, status: resp.status, data: null };
        const data = await resp.json();
        return { ok: true, status: resp.status, data };
      } catch (err: any) {
        return { ok: false, status: 0, data: err?.message ?? String(err) };
      }
    },
    { url, method: options?.method, body: options?.body }
  );
}

// ─── Verify auth via favorites API ───────────────────────────────────────────

async function verifyAuth(page: Page, bearer: string): Promise<boolean> {
  try {
    const result = await page.evaluate(
      async (args: { url: string; bearer: string }) => {
        try {
          const resp = await fetch(args.url, {
            credentials: "include",
            headers: { Authorization: `Bearer ${args.bearer}` },
          });
          if (!resp.ok) return { ok: false, status: resp.status, data: null };
          const data = await resp.json();
          return { ok: true, status: resp.status, data };
        } catch (err: any) {
          return { ok: false, status: 0, data: err?.message ?? String(err) };
        }
      },
      { url: API.favorites(0, 1), bearer }
    );

    if (!result.ok) {
      log(`Auth check failed: HTTP ${result.status}`);
      return false;
    }
    if (Array.isArray(result.data)) {
      log(`Auth verified — favorites API responding (${result.data.length} items in test)`);
      return true;
    }
    log("Auth check: unexpected response format");
    debug(`Response: ${JSON.stringify(result.data).slice(0, 200)}`);
    return false;
  } catch (err) {
    log(`Auth check error: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

// ─── Fetch all favorites via paginated API ───────────────────────────────────
// GET /__api/v2/generations/favorites?limit=20&page=0,1,2...
// Returns full generation objects directly — no need for riff_id resolution.
// Requires Authorization: Bearer header (cookies alone return empty).

async function fetchAllFavorites(
  page: Page,
  bearer: string
): Promise<GenerationData[]> {
  const allFavorites: GenerationData[] = [];
  const seenIds = new Set<string>();
  let pageNum = 0;

  log("Fetching favorites via API...");

  while (true) {
    debug(`  Fetching page=${pageNum} limit=${PAGE_SIZE}`);

    const url = API.favorites(pageNum, PAGE_SIZE);
    const result = await page.evaluate(
      async (args: { url: string; bearer: string }) => {
        try {
          const resp = await fetch(args.url, {
            credentials: "include",
            headers: { Authorization: `Bearer ${args.bearer}` },
          });
          if (!resp.ok) return { ok: false, status: resp.status, data: null };
          const data = await resp.json();
          return { ok: true, status: resp.status, data };
        } catch (err: any) {
          return { ok: false, status: 0, data: err?.message ?? String(err) };
        }
      },
      { url, bearer }
    );

    if (!result.ok) {
      log(`  API error at page ${pageNum}: HTTP ${result.status}`);
      break;
    }

    // Response is an array of generation objects
    const generations: GenerationData[] = Array.isArray(result.data) ? result.data : [];

    if (generations.length === 0) {
      debug(`  No more favorites at page ${pageNum}`);
      break;
    }

    let newCount = 0;
    for (const gen of generations) {
      if (gen.id && !seenIds.has(gen.id)) {
        seenIds.add(gen.id);
        allFavorites.push(gen);
        newCount++;
      }
    }

    log(`  Fetched ${allFavorites.length} favorites so far... (+${newCount} new from page ${pageNum})`);

    if (generations.length < PAGE_SIZE) {
      break;
    }

    pageNum++;
    if (!LYRICS_ONLY) await randomDelay(200, 500);
  }

  log(`Fetched ${allFavorites.length} favorites total from API`);
  return allFavorites;
}

// ─── Fetch all published tracks (own generations) ────────────────────────────
// GET /__api/v2/users/{userId}/generations?offset=N&limit=20&public=true
// Uses offset-based pagination (different from favorites which uses page-based).

async function fetchAllPublished(
  page: Page,
  _bearer: string,
  userId: string
): Promise<GenerationData[]> {
  const allTracks: GenerationData[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  log(`Fetching published tracks for user ${userId}...`);

  while (true) {
    debug(`  Fetching offset=${offset} limit=${PAGE_SIZE}`);

    const url = API.published(userId, offset, PAGE_SIZE);
    // Published endpoint uses cookies only (no bearer header)
    const result = await page.evaluate(
      async (args: { url: string }) => {
        try {
          const resp = await fetch(args.url, { credentials: "include" });
          if (!resp.ok) return { ok: false, status: resp.status, data: null };
          const data = await resp.json();
          return { ok: true, status: resp.status, data };
        } catch (err: any) {
          return { ok: false, status: 0, data: err?.message ?? String(err) };
        }
      },
      { url }
    );

    if (!result.ok) {
      log(`  API error at offset ${offset}: HTTP ${result.status}`);
      break;
    }

    // Published endpoint wraps data in { generations: [...] }
    const raw = result.data?.generations ?? result.data;
    const generations: GenerationData[] = Array.isArray(raw) ? raw : [];

    if (generations.length === 0) {
      debug(`  No more tracks at offset ${offset}`);
      break;
    }

    let newCount = 0;
    for (const gen of generations) {
      if (gen.id && !seenIds.has(gen.id)) {
        seenIds.add(gen.id);
        allTracks.push(gen);
        newCount++;
      }
    }

    log(`  Fetched ${allTracks.length} published tracks so far... (+${newCount} new from offset ${offset})`);

    if (generations.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
    if (!LYRICS_ONLY) await randomDelay(200, 500);
  }

  log(`Fetched ${allTracks.length} published tracks total from API`);
  return allTracks;
}

// ─── Resolve author_ids to usernames ─────────────────────────────────────────

async function resolveUsernames(
  page: Page,
  authorIds: string[]
): Promise<Map<string, string>> {
  const usernameMap = new Map<string, string>();
  if (authorIds.length === 0) return usernameMap;

  const uniqueIds = [...new Set(authorIds)];
  debug(`Resolving ${uniqueIds.length} unique author IDs to usernames`);

  // Process in batches of 50 to avoid oversized requests
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);

    const result = await fetchJsonViaPage(
      page,
      API.usernames,
      { method: "POST", body: JSON.stringify({ user_ids: batch }) }
    );

    if (result.ok && result.data?.data && Array.isArray(result.data.data)) {
      for (const entry of result.data.data) {
        if (entry.user_id && (entry.username || entry.fallback_name)) {
          usernameMap.set(entry.user_id, entry.username || entry.fallback_name);
        }
      }
    }

    if (!LYRICS_ONLY) await randomDelay(100, 300);
  }

  debug(`Resolved ${usernameMap.size} usernames`);
  return usernameMap;
}

// ─── Merge favorites into manifest ───────────────────────────────────────────

async function mergeFavorites(
  manifest: Manifest,
  generations: GenerationData[],
  usernameMap: Map<string, string>
): Promise<{ newCount: number }> {
  let newCount = 0;

  let driveFiles: Set<string> | null = null;
  const loadDriveFiles = async () => {
    if (driveFiles !== null) return driveFiles;
    try {
      const files = await readdir(DRIVE_DIR);
      driveFiles = new Set(files.filter((f) => f.endsWith(".wav")));
    } catch {
      driveFiles = new Set();
    }
    return driveFiles;
  };

  for (const gen of generations) {
    if (!gen.id) continue;

    const songId = gen.id;
    const title = gen.title ?? "Untitled";
    const authorId = gen.author_id ?? "";
    const artist = usernameMap.get(authorId) ?? "Unknown Artist";
    const genre = gen.sound ?? "Unknown";
    const prompt = gen.conditions?.[0]?.prompt ?? undefined;
    const model = gen.model_display_name ?? undefined;
    const seed = gen.seed ?? undefined;
    const playCount = gen.play_count ?? undefined;
    const favoriteCount = gen.favorite_count ?? undefined;

    if (!manifest.tracks[songId]) {
      const files = await loadDriveFiles();
      const uuidFilename = `${songId}.wav`;
      const titleFilename = sanitizeFilename(`${artist} - ${title}.wav`);
      const alreadyOnDrive = files.has(uuidFilename) || files.has(titleFilename);
      const driveFilename = files.has(uuidFilename)
        ? uuidFilename
        : files.has(titleFilename)
          ? titleFilename
          : undefined;

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
        songUrl: `${BASE_URL}/song/${songId}`,
        status: alreadyOnDrive ? "downloaded" : "pending",
        driveFilename,
        createdAt: gen.created_at,
      };
      newCount++;
      if (alreadyOnDrive) {
        debug(`  [already on Drive] ${title} → ${driveFilename}`);
      }
    } else {
      // Update metadata, preserve status
      const existing = manifest.tracks[songId];
      existing.title = title;
      existing.artist = artist;
      existing.authorId = authorId;
      existing.genre = genre;
      existing.prompt = prompt;
      existing.lyrics = gen.lyrics;
      existing.model = model;
      existing.seed = seed;
      existing.playCount = playCount;
      existing.favoriteCount = favoriteCount;
      existing.createdAt = gen.created_at;
    }
  }

  return { newCount };
}

// ─── Bearer token extraction ─────────────────────────────────────────────────

async function extractAuth(context: BrowserContext): Promise<{ bearer: string; userId: string }> {
  const cookies = await context.cookies("https://www.producer.ai");
  const parts = cookies
    .filter((c: any) => /auth-token(\.\d+)?$/.test(c.name))
    .map((c: any) => {
      const m = c.name.match(/\.(\d+)$/);
      return { idx: m ? Number(m[1]) : 0, val: c.value };
    })
    .sort((a: any, b: any) => a.idx - b.idx)
    .map((p: any) => p.val);

  if (!parts.length) throw new Error("No auth-token cookies found");
  const joined = parts.join("").replace(/^base64-/, "");
  const session = JSON.parse(b64urlToUtf8(joined));
  if (!session.access_token) throw new Error("No access_token in session");

  // Decode JWT payload to get user ID (sub claim)
  const bearer = session.access_token;
  const jwtPayload = JSON.parse(b64urlToUtf8(bearer.split(".")[1]));
  const userId = jwtPayload.sub;
  if (!userId) throw new Error("No sub (user ID) in JWT payload");

  return { bearer, userId };
}

// ─── Download WAV via blob (fast path) ───────────────────────────────────────

async function downloadWavViaBlob(
  page: Page,
  songId: string,
  bearer: string,
  filepath: string
): Promise<{ ok: boolean; error?: string }> {
  const apiPath = `/__api/${songId}/download?format=wav`;
  const filename = filepath.split("/").pop() ?? `${songId}.wav`;

  const check = await page.evaluate(
    async (args: { apiPath: string; bearer: string; filename: string }) => {
      try {
        const r = await fetch(args.apiPath, {
          method: "GET",
          credentials: "include",
          headers: { Authorization: `Bearer ${args.bearer}` },
          cache: "no-store",
        });
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}` };
        }
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("audio") && !ct.includes("octet-stream")) {
          const text = await r.text().catch(() => "");
          return {
            ok: false,
            error: `Not audio (${ct}): ${text.slice(0, 100)}`,
          };
        }
        const blob = await r.blob();
        if (blob.size < 10000) {
          return { ok: false, error: `Response too small (${blob.size} bytes)` };
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = args.filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return { ok: true, size: blob.size };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
      }
    },
    { apiPath, bearer, filename }
  );

  if (!check.ok) {
    return { ok: false, error: check.error };
  }

  const download = await page.waitForEvent("download", { timeout: 15000 });
  await download.saveAs(filepath);
  await download.delete().catch(() => {}); // free temp artifact
  return { ok: true };
}

// ─── Download WAV via UI interaction (fallback) ──────────────────────────────

async function downloadViaUI(
  page: Page,
  track: FavoriteEntry,
  filepath: string
): Promise<boolean> {
  await page.goto(track.songUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await randomDelay(2000, 4000);

  const title = await page.title();
  if (
    title.toLowerCase().includes("just a moment") ||
    title.toLowerCase().includes("attention required") ||
    title.toLowerCase().includes("cloudflare")
  ) {
    await page.waitForFunction(
      () =>
        !document.title.toLowerCase().includes("just a moment") &&
        !document.title.toLowerCase().includes("attention required"),
      { timeout: 30000 }
    ).catch(() => false);
    await randomDelay(2000, 3000);
  }

  // Ellipsis menu → Download → WAV
  const ellipsis = page.locator("button:has(svg.lucide-ellipsis)").first();
  if ((await ellipsis.count()) === 0) {
    debug("  No ellipsis button found");
    return false;
  }
  await ellipsis.click({ force: true, timeout: 5000 });
  await new Promise((r: (v: void) => void) => setTimeout(r, 1500));

  const dlItem = page.getByText("Download", { exact: true });
  if ((await dlItem.count()) === 0) {
    debug("  No 'Download' menu item found");
    return false;
  }
  await dlItem.first().click();
  await new Promise((r: (v: void) => void) => setTimeout(r, 1500));

  const wavOption = page.getByText("WAV", { exact: true });
  if ((await wavOption.count()) === 0) {
    debug("  No 'WAV' option found");
    return false;
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  await wavOption.first().click();
  const download = await downloadPromise;
  await download.saveAs(filepath);
  await download.delete().catch(() => {}); // free temp artifact
  return true;
}

// ─── Print summary ───────────────────────────────────────────────────────────

function printSummary(
  manifest: Manifest,
  downloadedThisRun: number,
  failedThisRun: string[]
): void {
  const entries = Object.values(manifest.tracks);
  const downloaded = entries.filter((t) => t.status === "downloaded");
  const pending = entries.filter((t) => t.status === "pending");
  const failed = entries.filter((t) => t.status === "failed");

  console.log("\n" + "═".repeat(60));
  console.log("  FAVORITES SYNC SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Total favorites in manifest:  ${entries.length}`);
  console.log(`  Downloaded (all time):        ${downloaded.length}`);
  console.log(`  Downloaded this run:          ${downloadedThisRun}`);
  console.log(`  Failed:                       ${failed.length}`);
  console.log(`  Remaining:                    ${pending.length}`);
  console.log("═".repeat(60));

  if (failedThisRun.length > 0) {
    console.log("\n  FAILED THIS RUN:");
    for (const msg of failedThisRun) {
      console.log(`    - ${msg}`);
    }
  }

  if (pending.length > 0) {
    console.log(`\n  Run again to continue downloading remaining favorites.`);
  }
  console.log("");
}

// ─── Download pending favorites in batches ───────────────────────────────────

async function downloadPendingFavorites(
  page: Page,
  context: BrowserContext,
  manifest: Manifest
): Promise<{ downloaded: number; failed: string[] }> {
  await mkdir(DRIVE_DIR, { recursive: true });

  const failedMsgs: string[] = [];
  let downloaded = 0;

  const pending = Object.values(manifest.tracks)
    .filter((t) => t.status === "pending" || t.status === "failed")
    .sort((a, b) => {
      // Pending before failed
      if (a.status !== b.status) {
        return a.status === "pending" ? -1 : 1;
      }
      // Within same status: newest first
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });

  if (pending.length === 0) {
    log("All favorites already downloaded!");
    return { downloaded, failed: failedMsgs };
  }

  log(`${pending.length} favorites to download (saving directly to ${DRIVE_DIR})`);

  // Extract bearer token
  let bearer: string;
  try {
    const auth = await extractAuth(context);
    bearer = auth.bearer;
    debug(`Bearer token extracted (${bearer.length} chars)`);
  } catch (err) {
    log(`Could not extract bearer token: ${err}`);
    log("Falling back to UI download method for all tracks");
    bearer = "";
  }

  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 20;

  for (let i = 0; i < pending.length; i++) {
    const track = pending[i];
    const destPath = join(DRIVE_DIR, `${track.id}.wav`);

    log(`[${i + 1}/${pending.length}] Downloading "${track.title}" by ${track.artist}...`);
    track.lastAttempt = new Date().toISOString();

    try {
      let success = false;

      // Try fast blob download first
      if (bearer) {
        try {
          const result = await downloadWavViaBlob(page, track.id, bearer, destPath);
          if (result.ok) {
            success = true;
          } else {
            debug(`  Blob download failed: ${result.error}`);
            if (result.error?.includes("401") || result.error?.includes("403")) {
              try {
                const refreshed = await extractAuth(context);
                bearer = refreshed.bearer;
                debug(`  Refreshed bearer token`);
                const retry = await downloadWavViaBlob(page, track.id, bearer, destPath);
                if (retry.ok) success = true;
              } catch {
                debug(`  Retry with refreshed token also failed`);
              }
            }
          }
        } catch (blobErr) {
          const msg = blobErr instanceof Error ? blobErr.message : String(blobErr);
          debug(`  Blob download error: ${msg}`);
        }
      }

      // Fallback to UI download
      if (!success) {
        debug(`  Falling back to UI download...`);
        success = await downloadViaUI(page, track, destPath);
      }

      if (success && existsSync(destPath)) {
        const fileStats = await stat(destPath);
        if (fileStats.size > 10000) {
          const sizeMB = fileStats.size / 1024 / 1024;
          log(`  Downloaded: ${sizeMB.toFixed(1)} MB → ${destPath}`);
          track.status = "downloaded";
          track.fileSizeMB = Math.round(sizeMB * 10) / 10;
          track.driveFilename = `${track.id}.wav`;
          track.error = undefined;
          downloaded++;
          consecutiveFailures = 0;
        } else {
          track.status = "failed";
          track.error = `File too small (${fileStats.size} bytes)`;
          log(`  ${track.error}`);
          failedMsgs.push(`${track.title} [${track.id}] — ${track.error}`);
          consecutiveFailures++;
          try { await unlink(destPath); } catch { /* ignore */ }
        }
      } else {
        track.status = "failed";
        track.error = "Both blob and UI download failed";
        log(`  ${track.error}`);
        failedMsgs.push(`${track.title} [${track.id}] — ${track.error}`);
        consecutiveFailures++;
      }

      await saveManifest(manifest);

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log(`\nStopping: ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Session may be expired.`);
        break;
      }

      await randomDelay(300, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      track.status = "failed";
      track.error = msg;
      log(`  Error: ${msg}`);
      failedMsgs.push(`${track.title} [${track.id}] — ${msg}`);
      await saveManifest(manifest);
      consecutiveFailures++;

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log(`\nStopping: ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`);
        break;
      }
    }
  }

  return { downloaded, failed: failedMsgs };
}

// ─── Main orchestrator ───────────────────────────────────────────────────────

export async function syncFavorites(): Promise<void> {
  log(`Mode: ${MODE}`);
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Verify-only mode
  if (VERIFY) {
    const manifest = await loadManifest();
    const trackCount = Object.keys(manifest.tracks).length;
    if (trackCount === 0) {
      log("Manifest is empty. Run without --verify first to populate it.");
      return;
    }
    log(`Loaded manifest with ${trackCount} tracks`);
    await verifyDriveFiles(manifest);
    return;
  }

  const { browser, context, page } = await launchBrowser();

  try {
    // Step 1: Navigate to favorites page (handles CF + auth)
    await navigateToFavorites(page, context);

    // Step 2: Extract bearer token + user ID
    let bearer: string;
    let userId: string;
    try {
      const auth = await extractAuth(context);
      bearer = auth.bearer;
      userId = auth.userId;
      debug(`Bearer token extracted (${bearer.length} chars), userId: ${userId}`);
    } catch (err) {
      log(`ERROR: Could not extract auth: ${err}`);
      log(`Try deleting ${AUTH_STATE_PATH} and running again to re-authenticate.`);
      await browser.close();
      process.exit(1);
    }

    // Step 3: Verify auth via favorites API
    const authed = await verifyAuth(page, bearer);
    if (!authed) {
      log("ERROR: Authentication failed. API not responding.");
      log(`Try deleting ${AUTH_STATE_PATH} and running again to re-authenticate.`);
      await browser.close();
      process.exit(1);
    }

    // Load existing manifest
    const manifest = await loadManifest();
    const existingCount = Object.keys(manifest.tracks).length;
    if (existingCount > 0) {
      const dl = Object.values(manifest.tracks).filter(
        (t) => t.status === "downloaded"
      ).length;
      log(`Loaded manifest: ${existingCount} tracks (${dl} downloaded)`);
    }

    // Step 4: Fetch all tracks via paginated API
    let apiTracks: GenerationData[];
    if (MODE === "published") {
      apiTracks = await fetchAllPublished(page, bearer, userId);
    } else {
      apiTracks = await fetchAllFavorites(page, bearer);
    }

    if (apiTracks.length === 0) {
      log(`No ${MODE} tracks found via API.`);
      await browser.close();
      return;
    }

    manifest.totalFavorites = apiTracks.length;

    // Step 5: Resolve author usernames
    const authorIds = [...new Set(
      apiTracks
        .map((g) => g.author_id)
        .filter((id): id is string => !!id && id.length > 0)
    )];
    const usernameMap = await resolveUsernames(page, authorIds);
    log(`Resolved ${usernameMap.size} artist usernames`);

    // Step 6: Merge into manifest
    const { newCount } = await mergeFavorites(manifest, apiTracks, usernameMap);
    const totalCount = Object.keys(manifest.tracks).length;
    if (newCount > 0) {
      log(`Found ${newCount} new tracks (${totalCount} total in manifest)`);
    } else {
      log(`No new tracks found (${totalCount} total in manifest)`);
    }
    await saveManifest(manifest);

    // Count statuses
    const entries = Object.values(manifest.tracks);
    const pendingCount = entries.filter(
      (t) => t.status === "pending" || t.status === "failed"
    ).length;
    const downloadedCount = entries.filter(
      (t) => t.status === "downloaded"
    ).length;
    log(`${downloadedCount} downloaded, ${pendingCount} pending`);

    // Dry run
    if (DRY_RUN) {
      const pendingEntries = entries
        .filter((t) => t.status === "pending" || t.status === "failed")
        .sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return db - da;
        });

      console.log("\n" + "═".repeat(60));
      console.log("  DRY RUN — no downloads will be performed");
      console.log("═".repeat(60));
      console.log(`  Total in manifest:     ${totalCount}`);
      console.log(`  Already downloaded:    ${downloadedCount}`);
      console.log(`  Would download:        ${pendingEntries.length}`);
      console.log("═".repeat(60));

      if (pendingEntries.length > 0 && pendingEntries.length <= 30) {
        console.log("\n  PENDING FAVORITES:");
        for (const t of pendingEntries) {
          console.log(`    - ${t.artist} — ${t.title} [${t.id}]${t.error ? ` (prev: ${t.error})` : ""}`);
        }
      } else if (pendingEntries.length > 30) {
        console.log("\n  PENDING FAVORITES (first 30):");
        for (const t of pendingEntries.slice(0, 30)) {
          console.log(`    - ${t.artist} — ${t.title} [${t.id}]${t.error ? ` (prev: ${t.error})` : ""}`);
        }
        console.log(`    ... and ${pendingEntries.length - 30} more`);
      }
      console.log("");

      await browser.close();
      return;
    }

    // Lyrics-only mode: export metadata + lyrics, skip audio
    if (LYRICS_ONLY) {
      const lyricsOut = join(OUTPUT_DIR, MODE === "published" ? "published-lyrics.json" : "favorites-lyrics.json");
      const lyricsExport = entries
        .sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return db - da;
        })
        .map((t) => ({
          title: t.title,
          artist: t.artist,
          lyrics: t.lyrics ?? "",
          genre: t.genre,
          prompt: t.prompt,
          model: t.model,
          seed: t.seed,
          playCount: t.playCount,
          favoriteCount: t.favoriteCount,
          songUrl: t.songUrl,
          createdAt: t.createdAt,
        }));
      await writeFile(lyricsOut, JSON.stringify(lyricsExport, null, 2));
      const withLyrics = lyricsExport.filter((t) => t.lyrics.length > 0).length;
      log(`Exported ${lyricsExport.length} tracks (${withLyrics} with lyrics) → ${lyricsOut}`);
      await browser.close();
      return;
    }

    // Step 7: Download pending favorites
    log(`\nStarting WAV downloads...`);
    const { downloaded, failed } = await downloadPendingFavorites(
      page,
      context,
      manifest
    );

    // Persist storage state
    try {
      await context.storageState({ path: AUTH_STATE_PATH });
      log("Saved updated storage state for next run");
    } catch {
      debug("Could not save final storage state");
    }

    printSummary(manifest, downloaded, failed);

    await browser.close();
  } catch (err) {
    log(`Fatal error: ${err instanceof Error ? err.message : err}`);
    await browser?.close().catch(() => {});
    throw err;
  }
}

// Run if executed directly
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("sync-favorites.ts") ||
  process.argv[1]?.endsWith("sync-favorites.js");

if (isMainModule) {
  syncFavorites().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
