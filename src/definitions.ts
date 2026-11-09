import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const maxCatalogAge = 24 * 60 * 60 * 1000;
const downloadTimeout = 5000;

type CatalogIndex = {
  generatedAt: number;
  version: string;
  vendorProductIds: { v2: number[]; v3: number[] };
};

type Catalog = { index: CatalogIndex; hash: string };

type LocalJson = { value: unknown; modifiedAt: number };

export function readLocalJson(file: string): LocalJson | undefined {
  try {
    return {
      value: JSON.parse(fs.readFileSync(file, "utf8")),
      modifiedAt: fs.statSync(file).mtimeMs,
    };
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCatalog(value: unknown): value is Catalog {
  if (
    !isObject(value) ||
    typeof value.hash !== "string" ||
    !/^[0-9a-f]{64}$/i.test(value.hash) ||
    !isObject(value.index)
  ) {
    return false;
  }
  const { generatedAt, version, vendorProductIds } = value.index;
  return (
    Number.isFinite(generatedAt) &&
    typeof version === "string" &&
    isObject(vendorProductIds) &&
    [vendorProductIds.v2, vendorProductIds.v3].every(
      (ids) => Array.isArray(ids) && ids.every(Number.isSafeInteger),
    )
  );
}

function readCatalogPair(dir: string) {
  const index = readLocalJson(path.join(dir, "supported_kbs.json"));
  const hash = readLocalJson(path.join(dir, "hash.json"));
  const catalog = { index: index?.value, hash: hash?.value };
  if (isCatalog(catalog)) {
    return { catalog, modifiedAt: Math.min(index.modifiedAt, hash.modifiedAt) };
  }
}

function readCachedCatalog(dir: string) {
  const snapshot = readLocalJson(path.join(dir, "catalog-cache.json"));
  if (snapshot && isCatalog(snapshot.value)) {
    return { catalog: snapshot.value, modifiedAt: snapshot.modifiedAt };
  }
  return readCatalogPair(dir);
}

export function readCatalog(cacheDir: string, bundledDir: string) {
  const local = readCachedCatalog(cacheDir) ?? readCatalogPair(bundledDir);
  if (!local) {
    throw new Error("VIA Desktop has no usable local definition catalog.");
  }
  return local.catalog;
}

async function fetchJson(
  fetcher: typeof fetch,
  url: URL,
  signal = AbortSignal.timeout(downloadTimeout),
): Promise<unknown> {
  const response = await fetcher(url.href, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url.pathname}`);
  }
  return response.json();
}

async function saveJson(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(value));
    await fs.promises.rename(temporary, file);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

export async function refreshCatalog(
  cacheDir: string,
  baseUrl: string,
  force = false,
  fetcher = fetch,
) {
  const cached = readCachedCatalog(cacheDir);
  if (!force && cached && Date.now() - cached.modifiedAt < maxCatalogAge) {
    return false;
  }

  const signal = AbortSignal.timeout(downloadTimeout);
  const hashUrl = new URL("definitions/hash.json", baseUrl);
  const hash = await fetchJson(fetcher, hashUrl, signal);
  const index = await fetchJson(
    fetcher,
    new URL("definitions/supported_kbs.json", baseUrl),
    signal,
  );
  const catalog = { index, hash };
  // The website publishes these separately. Keep the old pair if it changes mid-refresh.
  if (
    !isCatalog(catalog) ||
    hash !== (await fetchJson(fetcher, hashUrl, signal))
  ) {
    throw new Error(
      "The downloaded definition catalog was invalid or changed during refresh.",
    );
  }

  await saveJson(path.join(cacheDir, "catalog-cache.json"), catalog);
  return true;
}

export function isKeyboardDefinition(value: unknown, id: number) {
  return (
    isObject(value) &&
    value.vendorProductId === id &&
    isObject(value.matrix) &&
    isObject(value.layouts)
  );
}

export async function refreshKeyboardDefinition(
  file: string,
  url: URL,
  id: number,
  fetcher = fetch,
) {
  const value = await fetchJson(fetcher, url);
  if (!isKeyboardDefinition(value, id)) {
    throw new Error(`Invalid keyboard definition for ${id}`);
  }
  await saveJson(file, value);
  return value;
}
