#!/usr/bin/env bash
set -e

declare VIA_DIR="${VIA_DIR:-via-app}"

[ -d "$VIA_DIR" ] || git clone https://github.com/the-via/app "$VIA_DIR"
cd "$VIA_DIR"
bun i
bun run refresh-kbs
sed -i.bak 's|^\([[:space:]]*\)//\(.*fetch.*\)|\1\2|; s|^\([[:space:]]*\)\(const hash = document.getElementById.*\)|\1//\2|' src/utils/device-store.ts
# Fixes permanent loading issue - https://github.com/cebby2420/via-desktop/issues/13#issuecomment-3146391508
sed -i.bak 's/dispatch(loadStoredCustomDefinitions/await dispatch(loadStoredCustomDefinitions/' src/store/devicesThunks.ts
# Keep auto-reconnect working on USB replug without requiring a user click
sed -i.bak 's/dispatch(setForceAuthorize(true))/dispatch(setForceAuthorize(false))/' src/store/devicesThunks.ts
rm -f src/utils/device-store.ts.bak src/store/devicesThunks.ts.bak
bun run build

cp -R dist/ ../public
cd ..
rm -rf "$VIA_DIR"
