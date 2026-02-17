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
- **Downloads failing** — Some tracks may be unavailable. The script continues past failures (stops after 5 consecutive)

## Disclaimer

This tool is intended for personal backup of content you own or are otherwise authorised to download from Producer.ai (e.g. your own published tracks).

- You are solely responsible for ensuring your use complies with Producer.ai's Terms of Service and all applicable laws
- Do not use this tool to bypass access controls, scrape at scale, redistribute, or commercially exploit content you do not own or have rights to
- Downloaded tracks may be subject to copyright and licensing restrictions — respect the rights of other creators
- Use of this tool may result in account action (rate limits, suspension, etc.); use at your own risk
- This project is not affiliated with, endorsed by, or associated with Producer.ai or Riffusion Inc.
- This is not legal advice
- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. USE AT YOUR OWN RISK
