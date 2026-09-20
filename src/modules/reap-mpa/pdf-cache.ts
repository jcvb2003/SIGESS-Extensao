import { ReapMpaPdfCache, ReapMpaPdfCaches } from "../../shared/types";

export const REAP_PDF_CACHES_STORAGE_KEY = "sigessReapPdfCaches";
const LEGACY_REAP_PDF_CACHE_STORAGE_KEY = "sigessReapPdfCache";

function getLocalStorage() {
  if (typeof browser !== "undefined" && browser?.storage?.local) {
    return browser.storage.local;
  }
  if (typeof chrome !== "undefined" && (chrome as any)?.storage?.local) {
    return (chrome as any).storage.local;
  }
  return null;
}

function isPdfCache(value: unknown): value is ReapMpaPdfCache {
  if (!value || typeof value !== "object") return false;
  const cache = value as Partial<ReapMpaPdfCache>;
  return typeof cache.b64 === "string" && typeof cache.filename === "string";
}

function readCaches(value: unknown): ReapMpaPdfCaches {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value).filter(([, cache]) => isPdfCache(cache)),
  ) as ReapMpaPdfCaches;
}

export async function getReapPdfCacheForPreset(presetId?: string): Promise<ReapMpaPdfCache | null> {
  const storage = getLocalStorage();
  if (!storage) return null;

  const result = await storage.get([
    REAP_PDF_CACHES_STORAGE_KEY,
    LEGACY_REAP_PDF_CACHE_STORAGE_KEY,
  ]);
  const caches = readCaches(result[REAP_PDF_CACHES_STORAGE_KEY]);

  if (presetId && caches[presetId]) return caches[presetId];

  const legacyCache = isPdfCache(result[LEGACY_REAP_PDF_CACHE_STORAGE_KEY])
    ? result[LEGACY_REAP_PDF_CACHE_STORAGE_KEY]
    : null;
  if (!legacyCache) return null;

  if (!presetId) return legacyCache;
  if (Object.keys(caches).length > 0) return null;

  const migratedCaches = { ...caches, [presetId]: legacyCache };
  await storage.set({
    [REAP_PDF_CACHES_STORAGE_KEY]: migratedCaches,
  });
  await storage.remove(LEGACY_REAP_PDF_CACHE_STORAGE_KEY);
  return legacyCache;
}

export async function saveReapPdfCacheForPreset(
  presetId: string | undefined,
  cache: ReapMpaPdfCache,
): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) return;

  if (!presetId) {
    await storage.set({ [LEGACY_REAP_PDF_CACHE_STORAGE_KEY]: cache });
    return;
  }

  const result = await storage.get(REAP_PDF_CACHES_STORAGE_KEY);
  const caches = readCaches(result[REAP_PDF_CACHES_STORAGE_KEY]);
  await storage.set({
    [REAP_PDF_CACHES_STORAGE_KEY]: { ...caches, [presetId]: cache },
  });
  await storage.remove(LEGACY_REAP_PDF_CACHE_STORAGE_KEY);
}

export async function copyReapPdfCache(
  sourcePresetId: string,
  targetPresetId: string,
): Promise<void> {
  const cache = await getReapPdfCacheForPreset(sourcePresetId);
  if (cache) await saveReapPdfCacheForPreset(targetPresetId, cache);
}

export async function removeReapPdfCacheForPreset(presetId?: string): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) return;

  const result = await storage.get([
    REAP_PDF_CACHES_STORAGE_KEY,
    LEGACY_REAP_PDF_CACHE_STORAGE_KEY,
  ]);
  const caches = readCaches(result[REAP_PDF_CACHES_STORAGE_KEY]);

  if (presetId) {
    delete caches[presetId];
  } else {
    for (const key of Object.keys(caches)) {
      delete caches[key];
    }
  }

  // Remove SEMPRE a chave legada para evitar que o PDF ressuscite em ambientes de produção
  await storage.remove(LEGACY_REAP_PDF_CACHE_STORAGE_KEY);
  await storage.set({ [REAP_PDF_CACHES_STORAGE_KEY]: caches });
}
