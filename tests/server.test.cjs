const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

process.env.VIA_SERVER_TEST = "1";
require.cache[require.resolve("electron")] = { exports: { net: { fetch } } };
const { createViaRequestHandler } = require("../src/server.ts");

const catalog = {
  index: {
    generatedAt: 10,
    version: "1",
    vendorProductIds: { v2: [], v3: [123] },
  },
  hash: "a".repeat(64),
};

const bundledDef = {
  vendorProductId: 123,
  matrix: { rows: 1, cols: 1 },
  layouts: { keymap: [["0,0"]] },
};

async function startTestServer(t, { onlyLocalDefinitions = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "via-server-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const defsFileDir = path.join(root, "cache");
  const viaPublicPath = path.join(root, "public");
  const fontsDir = path.join(root, "fonts");
  fs.mkdirSync(defsFileDir, { recursive: true });
  fs.mkdirSync(path.join(viaPublicPath, "definitions", "v3"), {
    recursive: true,
  });
  fs.mkdirSync(fontsDir, { recursive: true });

  fs.writeFileSync(
    path.join(viaPublicPath, "index.html"),
    "<!doctype html><html><body>VIA</body></html>",
  );
  fs.writeFileSync(
    path.join(viaPublicPath, "definitions", "supported_kbs.json"),
    JSON.stringify(catalog.index),
  );
  fs.writeFileSync(
    path.join(viaPublicPath, "definitions", "hash.json"),
    JSON.stringify(catalog.hash),
  );
  fs.writeFileSync(
    path.join(viaPublicPath, "definitions", "v3", "123.json"),
    JSON.stringify(bundledDef),
  );
  fs.writeFileSync(path.join(fontsDir, "fonts.css"), "/* fira */");

  const { requestHandler } = createViaRequestHandler({
    defsFileDir,
    viaBaseUrl: "https://example.test/",
    onlyLocalDefinitions,
    viaPublicPath,
    fontsDir,
    fetcher: async () => {
      throw new Error("offline");
    },
  });

  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test("serves SPA fallback index.html for client-side routes", async (t) => {
  const baseUrl = await startTestServer(t);
  for (const route of ["/", "/design", "/settings", "/test"]) {
    const res = await fetch(`${baseUrl}${route}`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<body>VIA<\/body>/);
  }
});

test("serves bundled desktop fonts under /desktop-fonts/", async (t) => {
  const baseUrl = await startTestServer(t);
  const res = await fetch(`${baseUrl}/desktop-fonts/fonts.css`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "/* fira */");
});

test("serves catalog and bundled definitions and rejects traversal or unknown paths", async (t) => {
  const baseUrl = await startTestServer(t);

  const hashRes = await fetch(`${baseUrl}/definitions/hash.json`);
  assert.equal(hashRes.status, 200);
  assert.equal(await hashRes.json(), catalog.hash);

  const defRes = await fetch(`${baseUrl}/definitions/v3/123.json`);
  assert.equal(defRes.status, 200);
  assert.deepEqual(await defRes.json(), bundledDef);

  const missingRes = await fetch(`${baseUrl}/definitions/v3/999.json`);
  assert.equal(missingRes.status, 404);

  const traversalRes = await fetch(`${baseUrl}/definitions/..%2Findex.html`);
  assert.equal(traversalRes.status, 404);
});
