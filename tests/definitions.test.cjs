const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  readCatalog,
  refreshCatalog,
  refreshKeyboardDefinition,
} = require("../src/definitions.ts");

const baseUrl = "https://example.test/";
const oldCatalog = {
  index: {
    generatedAt: 1,
    version: "1",
    vendorProductIds: { v2: [], v3: [123] },
  },
  hash: "a".repeat(64),
};
const newCatalog = {
  index: {
    generatedAt: 2,
    version: "1",
    vendorProductIds: { v2: [], v3: [123, 456] },
  },
  hash: "b".repeat(64),
};

function profile(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "via-definitions-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = path.join(root, "cache");
  const bundled = path.join(root, "bundled");
  fs.mkdirSync(cache);
  fs.mkdirSync(bundled);
  writePair(bundled, oldCatalog);
  return { cache, bundled };
}

function writePair(dir, catalog, timestamp = new Date()) {
  for (const [file, value] of [
    ["supported_kbs.json", catalog.index],
    ["hash.json", catalog.hash],
  ]) {
    const target = path.join(dir, file);
    fs.writeFileSync(target, JSON.stringify(value));
    fs.utimesSync(target, timestamp, timestamp);
  }
}

test("starts with bundled definitions when the cache is empty or damaged", (t) => {
  const { cache, bundled } = profile(t);
  assert.deepEqual(readCatalog(cache, bundled), oldCatalog);
  fs.writeFileSync(path.join(cache, "catalog-cache.json"), "{");
  fs.writeFileSync(
    path.join(cache, "hash.json"),
    JSON.stringify(newCatalog.hash),
  );
  assert.deepEqual(readCatalog(cache, bundled), oldCatalog);
});

test("keeps the stale catalog and keyboard definition when offline", async (t) => {
  const { cache, bundled } = profile(t);
  writePair(cache, newCatalog, new Date("2001-01-01"));
  const file = path.join(cache, "v3", "456.json");
  const url = new URL("definitions/v3/456.json", baseUrl);
  const saved = JSON.stringify({
    vendorProductId: 456,
    matrix: { rows: 1, cols: 1 },
    layouts: { keymap: [["0,0"]] },
  });
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, saved);
  const offline = async () => {
    throw new Error("offline");
  };

  assert.deepEqual(readCatalog(cache, bundled), newCatalog);
  await assert.rejects(
    refreshCatalog(cache, baseUrl, false, offline),
    /offline/,
  );
  await assert.rejects(
    refreshKeyboardDefinition(file, url, 456, offline),
    /offline/,
  );
  assert.deepEqual(readCatalog(cache, bundled), newCatalog);
  assert.equal(fs.readFileSync(file, "utf8"), saved);
  assert.deepEqual(fs.readdirSync(cache).sort(), [
    "hash.json",
    "supported_kbs.json",
    "v3",
  ]);
});

test("publishes a complete refresh and skips another download while fresh", async (t) => {
  const { cache, bundled } = profile(t);
  let releaseIndex;
  const pendingIndex = new Promise((resolve) => (releaseIndex = resolve));
  const fetcher = async (url) =>
    url.endsWith("/hash.json") ? Response.json(newCatalog.hash) : pendingIndex;
  const refreshing = refreshCatalog(cache, baseUrl, false, fetcher);
  assert.deepEqual(readCatalog(cache, bundled), oldCatalog);
  releaseIndex(Response.json(newCatalog.index));
  assert.equal(await refreshing, true);
  assert.deepEqual(readCatalog(cache, bundled), newCatalog);
  assert.equal(
    await refreshCatalog(cache, baseUrl, false, () =>
      assert.fail("Unexpected request"),
    ),
    false,
  );
});

test("rejects a changed hash, failed status and invalid keyboard body", async (t) => {
  const { cache, bundled } = profile(t);
  let hash = oldCatalog.hash;
  const changing = async (url) => {
    if (!url.endsWith("/hash.json")) return Response.json(newCatalog.index);
    const response = Response.json(hash);
    hash = newCatalog.hash;
    return response;
  };
  await assert.rejects(
    refreshCatalog(cache, baseUrl, true, changing),
    /changed/,
  );
  await assert.rejects(
    refreshCatalog(
      cache,
      baseUrl,
      true,
      async () => new Response(null, { status: 503 }),
    ),
    /503/,
  );
  assert.deepEqual(readCatalog(cache, bundled), oldCatalog);
  await assert.rejects(
    refreshKeyboardDefinition(
      path.join(cache, "v3", "123.json"),
      new URL("definitions/v3/123.json", baseUrl),
      123,
      async () => Response.json({ vendorProductId: 456 }),
    ),
    /Invalid keyboard definition/,
  );
  assert.deepEqual(fs.readdirSync(cache), []);
});
