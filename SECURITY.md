# Security

FNode is a **local-first** macOS app. Scanning, process control, Docker, and SQLite stay on the machine that runs it.

## What FNode can do

- Read system metrics, listening ports (`lsof`), and process metadata
- Stop or restart **non-system** processes after a confirmation dialog
- Open folders, Terminal, and Cursor only for paths under your home directory (or FNode’s own data dir)
- Open `http(s)` URLs only on loopback (`localhost` / `127.0.0.1`)
- Talk to the local Docker engine socket when Docker Desktop is running
- Optionally call OpenAI if you paste an API key in Settings (off by default)

## What FNode will not do

- Kill PID 0/1, itself, or protected macOS processes (`kernel_task`, `launchd`, `WindowServer`, …)
- Restart binaries under `/System`, `/usr/sbin`, `/sbin`, or `/usr/libexec`
- Return stored API keys to the UI after save
- Show environment variables that look like secrets
- Upload telemetry

Data lives at `~/Library/Application Support/com.nitinkanish.fnode/` (`fnode.db` + captured restart logs). Older installs under `com.fnode.app` are copied on first launch.

## Distribution signing

GitHub / browser downloads are checked by macOS Gatekeeper. A production DMG must be signed with a **Developer ID Application** certificate and **notarized** by Apple. An `Apple Development` signature is only valid for local debugging; it will show “Apple could not verify this is free of malware” after download.

Build a notarized installer with `pnpm run build:macos:notarized` once the Developer ID certificate and notary credentials are on the build machine. See the README.

## Reporting a vulnerability

Please **do not** open a public issue for security bugs.

Contact **Nitin Kanish** through this GitHub repository (private vulnerability reporting if enabled, otherwise a private message).

Include:

- FNode version / commit
- macOS version
- Steps to reproduce
- Impact (e.g. path escape, unexpected network call, privilege issue)
