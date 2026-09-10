# Contributing

Thanks for helping with FNode, created by **Nitin Kanish**. This project is a Tauri 2 desktop app: **Rust** in `src-tauri/`, **React + TypeScript** in `src/`.

## Prerequisites

- macOS 12+
- Node.js 20+
- [pnpm](https://pnpm.io/) 10+
- Rust stable (`rustup`)
- Xcode Command Line Tools

## Setup

```bash
git clone https://github.com/<your-user>/fnode.git
cd fnode
pnpm install
pnpm tauri dev
```

The Vite dev server listens on port **1420**. The native window hot-reloads the UI; Rust changes rebuild the backend.

## Project layout

| Path | Role |
| --- | --- |
| `src/` | React UI (pages, charts, Zustand store) |
| `src-tauri/src/` | Local system agent (IPC commands, scanners, SQLite) |
| `src-tauri/icons/` | App icons (`.icns` / `.png`) |
| `assets/` | Source artwork for the icon |

## Conventions

- Keep process control **fail-closed**: unknown paths, non-loopback URLs, and system binaries must be refused.
- Do not log or return API keys or secret-looking env vars to the renderer.
- Prefer one live snapshot poll over duplicate `sysinfo` / `lsof` scans.
- Match existing UI: dark theme, coral accent (`#F38064`), concise copy.

## Pull requests

1. Branch from `main`
2. Keep the diff focused
3. Note how you tested (`pnpm tauri dev`, which pages, any `cargo test`)
4. Do not commit `node_modules`, `src-tauri/target`, `.env`, or personal SQLite files

## Releases and notarization

Contributors **without** a Developer ID certificate should use:

```bash
pnpm run build:macos:local
```

That ad-hoc DMG runs on any Apple Silicon Mac after right-click → Open. It will still show Apple’s malware dialog after a browser download.

A silent Gatekeeper install requires:

1. **Developer ID Application** (not Apple Development) for the team that owns `com.nitinkanish.fnode`
2. App Store Connect API key **or** Apple ID + app-specific password
3. `pnpm run build:macos:notarized` (see README → Notarized release)

Never put `AuthKey_*.p8`, `APPLE_PASSWORD`, or signing identities in the repo or in GitHub Actions logs.

## License

By contributing you agree that your work is licensed under the MIT License in this repository.
