import finalhandler from "finalhandler";
import http from "http";
import serveStatic from "serve-static";
import path from "path";
import fs from "fs";
import { AddressInfo } from "net";
import { net } from "electron";
import {
  isKeyboardDefinition,
  readCatalog,
  readLocalJson,
  refreshKeyboardDefinition,
} from "./definitions";
import log from "electron-log/node";

const defsFileDir = process.argv[2];
const VIA_BASE_URL = process.argv[3];
const onlyLocalDefinitions = process.argv[4] === "true";

let viaPublicPath = path.join(process.resourcesPath, "public");
// In development mode, the resourcesPath does not exist, so we want the public folder from the project directory
if (!fs.existsSync(viaPublicPath)) {
  log.info("Using development public folder");
  viaPublicPath = path.join(__dirname, "../..", "public");
}

const serveApplication = serveStatic(viaPublicPath, {
  index: ["index.html"],
});
const bundledDefinitions = path.join(viaPublicPath, "definitions");
// Keep the index, hash and device allowlist consistent for this window.
const catalog = readCatalog(defsFileDir, bundledDefinitions);
const bundledHash = readLocalJson(
  path.join(bundledDefinitions, "hash.json"),
)?.value;
const definitionRefreshes = new Map<string, Promise<unknown>>();

function refreshDefinition(relativePath: string, id: number) {
  const pending = definitionRefreshes.get(relativePath);
  if (pending) return pending;

  const refresh = refreshKeyboardDefinition(
    path.join(defsFileDir, relativePath),
    new URL(`definitions/${relativePath}`, VIA_BASE_URL),
    id,
    net.fetch,
  )
    .catch((error) => {
      log.warn("Keyboard definition refresh failed", relativePath, error);
      return undefined;
    })
    .finally(() => definitionRefreshes.delete(relativePath));
  definitionRefreshes.set(relativePath, refresh);
  return refresh;
}

async function getDefinition(relativePath: string, id: number) {
  const local = readLocalJson(path.join(defsFileDir, relativePath));
  if (local && isKeyboardDefinition(local.value, id)) {
    if (
      !onlyLocalDefinitions &&
      local.modifiedAt <= catalog.index.generatedAt
    ) {
      void refreshDefinition(relativePath, id);
    }
    return local.value;
  }

  const bundled = readLocalJson(path.join(bundledDefinitions, relativePath));
  if (bundled && isKeyboardDefinition(bundled.value, id)) {
    if (!onlyLocalDefinitions && catalog.hash !== bundledHash) {
      void refreshDefinition(relativePath, id);
    }
    return bundled.value;
  }

  if (!onlyLocalDefinitions) return refreshDefinition(relativePath, id);
}
const serveDesktopFonts = serveStatic(
  path.join(viaPublicPath, "..", "desktop-fonts"),
);
const indexHtml = fs
  .readFileSync(path.join(viaPublicPath, "index.html"), "utf8")
  .replace(
    /<link\b[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/g,
    "",
  )
  .replace(
    "</head>",
    `<link rel="stylesheet" href="/desktop-fonts/fonts.css">
     <script>document.fonts.load('700 16px "Fira Sans"').catch(() => {});</script>
     <script>
       // Read downloaded definitions from the desktop cache on each launch,
       // so updates take effect even when VIA's catalog hash stays the same.
       try {
         const storeKey = "via-app-store";
         const store = JSON.parse(localStorage.getItem(storeKey));
         if (store && Object.keys(store.definitions || {}).length) {
           store.definitions = {};
           localStorage.setItem(storeKey, JSON.stringify(store));
         }
       } catch {}
     </script>
     </head>`,
  );

const requestHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => {
  const requestPath = req.url.split("?")[0];
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (requestPath === "/" || requestPath === "/index.html")
  ) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(req.method === "GET" ? indexHtml : undefined);
    return;
  }
  if (requestPath.startsWith("/desktop-fonts/")) {
    req.url = req.url.slice("/desktop-fonts".length);
    serveDesktopFonts(req, res, finalhandler(req, res));
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    if (/^\/assets\/[\w.-]+\.css$/.test(requestPath)) {
      // VIA's stylesheet also imports Google Fonts, which can block rendering offline.
      const css = await fs.promises
        .readFile(path.join(viaPublicPath, requestPath), "utf8")
        .catch(() => undefined);
      if (css !== undefined) {
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.end(
          req.method === "GET"
            ? css.replace(
                /@import\s*(?:"https:\/\/fonts\.googleapis\.com\/[^"]*"|'https:\/\/fonts\.googleapis\.com\/[^']*');/g,
                "",
              )
            : undefined,
        );
        return;
      }
    }
    const keyboard = /^\/definitions\/(v[23]\/([0-9]+)\.json)$/.exec(
      requestPath,
    );
    let value: unknown;
    if (requestPath === "/definitions/supported_kbs.json") {
      value = catalog.index;
    } else if (requestPath === "/definitions/hash.json") {
      value = catalog.hash;
    } else if (keyboard) {
      value = await getDefinition(keyboard[1], Number(keyboard[2]));
    }
    if (value !== undefined) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(req.method === "GET" ? JSON.stringify(value) : undefined);
      return;
    }
    if (keyboard) {
      res.writeHead(404).end();
      return;
    }
  }

  serveApplication(req, res, finalhandler(req, res));
};

const server = http.createServer(requestHandler);

server.listen(0, "127.0.0.1", function () {
  const serverPort = (server.address() as AddressInfo).port;
  log.info("Server started", serverPort);
  if (process.parentPort) {
    process.parentPort.postMessage({
      port: serverPort,
      supportedIds: [
        ...catalog.index.vendorProductIds.v2,
        ...catalog.index.vendorProductIds.v3,
      ],
    });
  }
});
