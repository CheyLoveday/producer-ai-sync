# Producer.ai Track Downloader (Backup)

![CI](https://github.com/CheyLoveday/producer-ai-sync/actions/workflows/ci.yml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)

Downloads your **published** (your own tracks) or **favorites** (liked songs) from [Producer.ai](https://www.producer.ai) as WAV files with full metadata.

Use this only to download content you own or are allowed to download.

## Project Status

🚀 **Active Development** — This project is actively maintained. Issues, pull requests, and feature suggestions are welcome!

## Requirements

- **Node.js 18+** — [download here](https://nodejs.org)
- **A Producer.ai account** (Discord login)
- **Disk Space** — Each track is ~30-40 MB as WAV. Examples:
  - 50 tracks = ~1.5-2 GB
  - 100 tracks = ~3-4 GB
  - 500 tracks = ~15-20 GB

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

1. A browser window opens and navigates to Producer.ai (~5-10 seconds)
2. If you're not logged in, **log in manually via Discord** in the browser window (you have 2 minutes)
3. The script fetches all tracks via the API (~1-5 seconds per batch of tracks)
4. Downloads each track as a WAV file (~30-40 MB each, ~10-30 seconds per track depending on connection)
5. Saves progress + metadata to a manifest file — if it stops, just re-run to resume

**Time estimates:**
- 10 tracks: ~5-10 minutes
- 50 tracks: ~20-40 minutes
- 100 tracks: ~40-80 minutes

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
| `--dry-run` | List tracks without downloading |
| `--lyrics-only` | Fetch metadata + lyrics only, skip audio downloads |
| `--verify` | Check output dir for missing files |
| `--debug, -d` | Verbose logging |

## Resuming

The script tracks progress in `data/output/favorites.json` (or `published.json` for published mode). If it stops for any reason, just re-run — it skips already-downloaded files.

## Screenshots

_Screenshots coming soon — showing the sync process, manifest output, and downloaded tracks._

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting and Type Checking

```bash
# Run ESLint
npm run lint

# Fix ESLint issues automatically
npm run lint:fix

# Run TypeScript type checking
npm run typecheck
```

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Troubleshooting

### Common Issues

- **"Login timed out"** — Complete the Discord login in the browser window within 2 minutes
- **"Could not extract bearer token"** — Delete `~/.producer-ai-auth.json` and run again
- **Downloads failing** — Some tracks may be unavailable. The script continues past failures (stops after 5 consecutive failures)

### TypeScript Errors

If you encounter TypeScript compilation errors:

```bash
# Ensure you have the latest dependencies
npm install

# Run type checking to see all errors
npm run typecheck
```

### Permission Issues

If you encounter permission errors when running scripts:

```bash
# On macOS/Linux, you may need to make the script executable
chmod +x sync-favorites.ts

# Or use npx tsx directly
npx tsx sync-favorites.ts
```

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
