# GenVault

> **GenVault — Because platforms rug-pull your art with 48 hours notice.**  
> One ethical escape hatch for any music-gen platform.

**Creating Infrastructure from Crisis** — When platforms shut down or delete your work, you need more than hope. GenVault is your defensive shield: a clean, ethical, resumable backup tool that works in the real world.

Currently supports [Producer.ai](https://www.producer.ai), with more platforms coming soon (Suno, Udio, etc.).

Downloads your **published** (your own tracks) or **favorites** (liked songs) as WAV files with full metadata.

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

### New Modular CLI (Recommended)

```bash
# Back up your own published tracks
npx tsx src/cli.ts --mode published

# Download all your favorites
npx tsx src/cli.ts

# Or use npm scripts
npm start  # Same as above
npm run sync  # Same as above

# Preview without downloading
npx tsx src/cli.ts --dry-run
npx tsx src/cli.ts --mode published --dry-run

# Download to a specific folder
npx tsx src/cli.ts --output ~/Music/Favorites
npx tsx src/cli.ts --mode published --output ~/Music/MyTracks

# Download to Google Drive
npx tsx src/cli.ts --output ~/Library/CloudStorage/GoogleDrive-you@gmail.com/My\ Drive/Music
```

### Legacy CLI (Still Supported)

The original single-file CLI is still available:

```bash
npx tsx sync-favorites.ts --mode published
npm run legacy  # Use the legacy CLI
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

## The Vision: Multi-Platform Support

GenVault is being evolved from a Producer.ai-specific tool into a **general-purpose backup solution** for multiple music generation platforms. The architecture is being refactored to support:
- **Producer.ai** (current, fully working)
- **Suno** (planned)
- **Udio** (planned)
- More platforms as they emerge (or disappear)

The goal: One tool. Manual login only. Zero cloud dependencies. Runs on your machine forever.

## Architecture

GenVault has been refactored into a modular architecture to support multiple platforms:

```
genvault/
├── core/                     # Shared functionality across all platforms
│   ├── browser.ts            # Patchright browser automation
│   ├── auth.ts               # Authentication token extraction
│   ├── manifest.ts           # Download manifest and file verification
│   ├── utils.ts              # Utility functions
│   └── types.ts              # TypeScript types
├── platforms/                # Platform-specific implementations
│   ├── producer-ai/          # Producer.ai support (fully working)
│   │   ├── config.ts         # API endpoints and configuration
│   │   ├── api.ts            # API calls and data transformations
│   │   ├── auth.ts           # Navigation and login flow
│   │   └── downloader.ts     # Download implementation
│   └── index.ts              # Platform registry
├── src/
│   └── cli.ts                # Main CLI entry point
├── sync-favorites.ts         # Legacy single-file CLI (still works)
└── package.json
```

This modular structure makes it easy to add new platforms in the future.

## How it works

This tool uses music platform internal API endpoints to fetch track listings and download audio files, with a web UI fallback (automated browser interaction) when API downloads fail. It authenticates using your own session credentials via a real browser — no credentials are stored or transmitted outside of the platform you're backing up from. You must comply with each platform's API and usage terms.

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
