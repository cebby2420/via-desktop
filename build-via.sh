declare VIA_DIR="${VIA_DIR:-via-app}"

[ -d "$VIA_DIR" ] || git clone https://github.com/the-via/app "$VIA_DIR"
cd "$VIA_DIR"
bun i
bun run refresh-kbs
sed -i 's|^\(\s*\)//\(.*fetch.*\)|\1\2|; s|^\(\s*\)\(const hash = document.getElementById.*\)|\1//\2|' src/utils/device-store.ts
bun run build

cp -R dist/ ../public
cd ..
rm -rf "$VIA_DIR"
