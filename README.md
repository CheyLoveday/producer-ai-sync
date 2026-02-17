# Producer.ai Track Downloader (Backup)

Downloads your **published** (your own tracks) or **favorites** (liked songs) from [Producer.ai](https://www.producer.ai) as WAV files with full metadata.

Use this only to download content you own or are allowed to download.

## Requirements

- **Node.js 18+** — [download here](https://nodejs.org)
- **A Producer.ai account** (Discord login)

## Setup

```bash
npm install
```

This installs Patchright (browser automation) and TypeScript tooling. First run will also download a Chromium browser (~200 MB one-time).

## Usage

```bash
# Back up your own published tracks
npx tsx sync-favorites.ts --mode published

# Download all your favorites (optional)
npx tsx sync-favorites.ts

# Preview without downloading
npx tsx sync-favorites.ts --dry-run
npx tsx sync-favorites.ts --mode published --dry-run

# Download to a specific folder
npx tsx sync-favorites.ts --output ~/Music/Favorites
npx tsx sync-favorites.ts --mode published --output ~/Music/MyTracks

# Download to Google Drive
npx tsx sync-favorites.ts --output ~/Library/CloudStorage/GoogleDrive-you@gmail.com/My\ Drive/Music
```

## What happens

1. A browser window opens and navigates to Producer.ai
2. If you're not logged in, **log in manually via Discord** in the browser window (you have 2 minutes)
3. The script fetches all tracks via the API (favorites or published, depending on mode)
4. Downloads each track as a WAV file (~30-40 MB each)
5. Saves progress + metadata to a manifest file — if it stops, just re-run to resume

## Metadata collected

Each track in the manifest includes:

| Field | Description |
|-------|-------------|
| `title` | Track title |
| `artist` | Artist username |
| `genre` | Sound/style description |
| `prompt` | The generation prompt used to create the track |
| `lyrics` | Full lyrics |
| `model` | AI model used (e.g. "FUZZ-2.0") |
| `seed` | Generation seed |
| `playCount` | Number of plays |
| `favoriteCount` | Number of favorites/likes |
| `createdAt` | When the track was created |

## Options

| Flag | Description |
|------|-------------|
| `--mode MODE, -m` | `favorites` (default) or `published` |
| `--output DIR, -o` | Where to save WAV files (default: `./downloads`) |
| `--batch N, -b N` | Tracks per batch (default: 10) |
| `--dry-run` | List tracks without downloading |
| `--verify` | Check output dir for missing files |
| `--debug, -d` | Verbose logging |

## Resuming

The script tracks progress in `data/output/favorites.json` (or `published.json` for published mode). If it stops for any reason, just re-run — it skips already-downloaded files.

## Troubleshooting

- **"Login timed out"** — Complete the Discord login in the browser window within 2 minutes
- **"Could not extract bearer token"** — Delete `~/.producer-ai-auth.json` and run again
- **Downloads failing** — Some tracks may be unavailable. The script continues past failures (stops after 5 consecutive failures)

## How it works

This tool uses Producer.ai's internal API endpoints to fetch track listings and download WAV files, with a web UI fallback (automated browser interaction) when API downloads fail. It authenticates using your own session credentials via a real browser — no credentials are stored or transmitted outside of Producer.ai. You must comply with Producer.ai's API and platform usage terms.

## Disclaimer & Acceptable Use

**Purpose.**
This tool is intended **solely** for personal backup/archival of content you own or are authorized to download from Producer.ai (e.g., your own published tracks).

**By using this tool, you agree to these terms and accept all associated risks.**

**Compliance.**
You are **solely responsible** for complying with [Producer.ai's Terms of Service](https://www.producer.ai/terms) and all applicable laws/rights (copyright, licenses, contracts, etc.). See also: [Producer.ai Copyright Policy](https://www.producer.ai/docs/plans-and-policies/copyright)

**Prohibited Use.**
Do not use this tool to:
- Bypass access controls or access unauthorized content.
- Scrape at scale, overload services, or evade rate limits.
- Redistribute, re-upload, or commercially exploit content you lack rights to.

**Copyright & Permissions.**
Do not use/download third-party copyrighted material without permission from the rightsholder.

**Risk Warning.**
Automation may trigger account actions (rate limits, suspension, termination). **Use at your own risk.**

**No Affiliation.**
Independent project; not affiliated with or endorsed by Producer.ai.

**No Legal Advice.**
Nothing here constitutes legal advice.

**License.**
See [LICENSE](LICENSE) for full terms (software provided "AS IS", no warranty of any kind).
