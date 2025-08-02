declare VIA_DIR="${VIA_DIR:-via-app}"

[ -d "$VIA_DIR" ] || git clone https://github.com/the-via/app "$VIA_DIR"
cd "$VIA_DIR"
bun i
bun run refresh-kbs
sed -i 's|^\(\s*\)//\(.*fetch.*\)|\1\2|; s|^\(\s*\)\(const hash = document.getElementById.*\)|\1//\2|' src/utils/device-store.ts
# Fixes permanent loading issue - https://github.com/cebby2420/via-desktop/issues/13#issuecomment-3146391508
sed -i 's/dispatch(loadStoredCustomDefinitions/await dispatch(loadStoredCustomDefinitions/' src/store/devicesThunks.ts
bun run build

cp -R dist/ ../public
cd ..
rm -rf "$VIA_DIR"
