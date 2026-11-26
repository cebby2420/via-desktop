import fs from "fs";
import path from "path";
import { defineConfig, type Plugin } from "vite";

const FONT_BUNDLES = [
  { pkg: "@fontsource/fira-sans", weights: [300, 400, 500, 700] },
  { pkg: "@fontsource/fira-sans-condensed", weights: [300, 400, 500] },
];

function bundleFontsPlugin(): Plugin {
  return {
    name: "bundle-fontsource-fonts",
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;

      const fontsDir = path.join(outDir, "fonts");
      const filesDir = path.join(fontsDir, "files");
      fs.mkdirSync(filesDir, { recursive: true });

      const cssChunks: string[] = [];
      let copiedLicense = false;

      for (const { pkg, weights } of FONT_BUNDLES) {
        const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));

        if (!copiedLicense) {
          fs.copyFileSync(
            path.join(pkgDir, "LICENSE"),
            path.join(fontsDir, "LICENSE"),
          );
          copiedLicense = true;
        }

        for (const weight of weights) {
          const rawCss = fs.readFileSync(
            path.join(pkgDir, `${weight}.css`),
            "utf8",
          );
          const woff2OnlyCss = rawCss.replace(
            /,\s*url\(\.\/files\/[^)]+\.woff\)\s*format\(['"]woff['"]\)/g,
            "",
          );
          cssChunks.push(woff2OnlyCss);

          for (const match of woff2OnlyCss.matchAll(
            /url\(\.\/files\/([^)]+\.woff2)\)/g,
          )) {
            const fileName = match[1];
            fs.copyFileSync(
              path.join(pkgDir, "files", fileName),
              path.join(filesDir, fileName),
            );
          }
        }
      }

      fs.writeFileSync(path.join(fontsDir, "fonts.css"), cssChunks.join("\n"));
    },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [bundleFontsPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: "src/main.ts",
        server: "src/server.ts",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
