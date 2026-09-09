#!/usr/bin/env bash
# Ad-hoc signed Apple Silicon DMG for local / teammate installs.
# Any Mac user can run it after the first-launch Gatekeeper bypass
# (right-click → Open). This is not Apple-notarized.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Do not pick up a machine-local Apple Development identity — that signature
# only works on this Mac. Ad-hoc works on any Mac after Open Anyway.
unset APPLE_SIGNING_IDENTITY APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID

VERSION="$(node -p "require('./package.json').version")"
APP_SRC="$ROOT/src-tauri/target/release/bundle/macos/FNode.app"
ENTITLEMENTS="$ROOT/src-tauri/Entitlements.plist"
OUT_DMG="$ROOT/public/FNode.dmg"

echo "Building FNode ${VERSION} (ad-hoc signed, local distribution)"
pnpm tauri build --bundles app

if [[ ! -d "$APP_SRC" ]]; then
  echo "Expected app not found at $APP_SRC" >&2
  exit 1
fi

echo "Re-signing ad-hoc so other Macs are not locked to this machine's cert…"
codesign --force --deep --sign - \
  --options runtime \
  --entitlements "$ENTITLEMENTS" \
  "$APP_SRC"

codesign --verify --deep --strict "$APP_SRC"
echo "Signature:"
codesign -dv --verbose=2 "$APP_SRC" 2>&1 | grep -E 'Identifier|Signature|Authority|TeamIdentifier|Runtime' || true

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP_SRC" "$STAGE/FNode.app"
ln -s /Applications "$STAGE/Applications"
cat > "$STAGE/How to open.txt" <<EOF
FNode ${VERSION} — local development build (Apple Silicon)

1. Drag FNode into Applications.
2. First launch on another Mac (this build is not notarized by Apple):
   • Finder: right-click FNode → Open → Open
   • or System Settings → Privacy & Security → Open Anyway
   • or Terminal:
       xattr -cr /Applications/FNode.app && open /Applications/FNode.app

Intel Macs: build from source on that machine (pnpm tauri build).
EOF

echo "Creating $OUT_DMG"
rm -f "$OUT_DMG"
hdiutil create \
  -volname "FNode ${VERSION}" \
  -srcfolder "$STAGE" \
  -ov -format UDZO \
  -fs HFS+ \
  "$OUT_DMG"

ls -lh "$OUT_DMG"
echo "Local DMG ready: $OUT_DMG"
echo "Share that file. Recipients: drag to Applications, then right-click → Open."
