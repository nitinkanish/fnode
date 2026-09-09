#!/usr/bin/env bash
# Build a Gatekeeper-ready Apple Silicon DMG: Developer ID sign, notarize, staple.
# Apple Development certificates cannot be notarized and will show
# "Apple could not verify this is free of malware" when downloaded.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEAM_ID="${APPLE_TEAM_ID:-YLKU69SJ9T}"
DEFAULT_IDENTITY="Developer ID Application: DEBUGGED PRO PRIVATE LIMITED (${TEAM_ID})"
IDENTITY="${APPLE_SIGNING_IDENTITY:-$DEFAULT_IDENTITY}"

if ! security find-identity -v -p codesigning | grep -F "$IDENTITY" >/dev/null; then
  echo "No Developer ID Application certificate in the keychain." >&2
  echo "Gatekeeper will block GitHub/browser downloads until this exists." >&2
  echo >&2
  echo "Have the Account Holder or Admin for team ${TEAM_ID} (DEBUGGED PRO PRIVATE LIMITED):" >&2
  echo "  1. Open https://developer.apple.com/account/resources/certificates/add" >&2
  echo "  2. Create 'Developer ID Application'" >&2
  echo "  3. Install the .cer on this Mac (and keep the private key in the keychain)" >&2
  echo "  4. Create an App Store Connect API key (Developer → Users and Access → Integrations)" >&2
  echo "     or an Apple ID app-specific password for notarytool" >&2
  echo >&2
  echo "Then re-run:" >&2
  echo "  APPLE_SIGNING_IDENTITY=\"${DEFAULT_IDENTITY}\" \\" >&2
  echo "  APPLE_API_KEY=... APPLE_API_ISSUER=... APPLE_API_KEY_PATH=/path/to/AuthKey.p8 \\" >&2
  echo "  APPLE_TEAM_ID=${TEAM_ID} pnpm run build:macos:notarized" >&2
  exit 1
fi

if [[ -z "${APPLE_API_KEY:-}" && -z "${APPLE_ID:-}" ]]; then
  echo "Notarization credentials missing." >&2
  echo "Set either:" >&2
  echo "  APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH + APPLE_TEAM_ID" >&2
  echo "or:" >&2
  echo "  APPLE_ID + APPLE_PASSWORD (app-specific password) + APPLE_TEAM_ID" >&2
  exit 1
fi

export APPLE_SIGNING_IDENTITY="$IDENTITY"
export APPLE_TEAM_ID="$TEAM_ID"

echo "Signing identity: $APPLE_SIGNING_IDENTITY"
echo "Team: $APPLE_TEAM_ID"

pnpm tauri build --bundles app,dmg

APP_SRC="$ROOT/src-tauri/target/release/bundle/macos/FNode.app"
DMG_SRC="$(ls -1 "$ROOT"/src-tauri/target/release/bundle/dmg/FNode_*_aarch64.dmg 2>/dev/null | tail -1 || true)"

if [[ -z "$DMG_SRC" || ! -f "$DMG_SRC" ]]; then
  echo "Expected DMG not found under src-tauri/target/release/bundle/dmg/" >&2
  exit 1
fi

# Tauri notarizes when Apple credentials are set. Staple anyway so Gatekeeper
# works offline after download.
xcrun stapler staple "$APP_SRC" || true
xcrun stapler staple "$DMG_SRC"

cp -f "$DMG_SRC" "$ROOT/public/FNode.dmg"
echo "Stapled installer copied to public/FNode.dmg"
spctl --assess --type open --verbose=2 --ignore-cache --no-cache "$ROOT/public/FNode.dmg" || true
xcrun stapler validate "$ROOT/public/FNode.dmg"
