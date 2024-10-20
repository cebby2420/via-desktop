git clone git@github.com:the-via/app via-app
cd via-app
npm install
sed -i 's|^\(\s*\)//\(.*fetch.*\)|\1\2|; s|^\(\s*\)\(const hash = document.getElementById.*\)|\1//\2|' src/utils/device-store.ts
npm run build

cp -R dist/ ../public
cd ..
rm -rf via-app