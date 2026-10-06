import { AppSettings, ReapMpaPreset } from "../../shared/types";
import { getMpaSettings, normalizeReapSettings, withoutMpaSettings } from "./reap-settings";

export interface ReapMpaExportPdfItem {
  presetId: string;
  fileName: string;
  mimeType: "application/pdf";
  data: string;
}

export interface ReapMpaExportPayload {
  version: 2;
  format: "sigess-reap-mpa-settings";
  exportedAt: string;
  activeReapMpaPresetId: string;
  reapMpaPresets: ReapMpaPreset[];
  settings: Partial<AppSettings>;
  pdfs: ReapMpaExportPdfItem[];
}

export function createReapMpaExportPayload(
  currentSettings: AppSettings,
  pdfCachesByPresetId: Record<string, { b64: string; filename: string } | null | undefined>,
): ReapMpaExportPayload {
  const currentPresets = currentSettings.reapMpaPresets?.length
    ? currentSettings.reapMpaPresets
    : [
        {
          id: currentSettings.activeReapMpaPresetId || `preset-${Date.now()}`,
          name: "Padrão",
          settings: getMpaSettings(currentSettings),
        },
      ];

  const sanitizedPresets: ReapMpaPreset[] = currentPresets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    settings: getMpaSettings(preset.settings as AppSettings),
  }));

  const activeId = currentSettings.activeReapMpaPresetId && sanitizedPresets.some((p) => p.id === currentSettings.activeReapMpaPresetId)
    ? currentSettings.activeReapMpaPresetId
    : sanitizedPresets[0]?.id;

  const pdfs: ReapMpaExportPdfItem[] = [];
  for (const preset of sanitizedPresets) {
    const cache = pdfCachesByPresetId[preset.id];
    if (cache?.b64) {
      const rawB64 = cache.b64.includes(",") ? cache.b64.split(",")[1] : cache.b64;
      pdfs.push({
        presetId: preset.id,
        fileName: cache.filename || "documento.pdf",
        mimeType: "application/pdf",
        data: rawB64,
      });
    }
  }

  return {
    version: 2,
    format: "sigess-reap-mpa-settings",
    exportedAt: new Date().toISOString(),
    activeReapMpaPresetId: activeId,
    reapMpaPresets: sanitizedPresets,
    settings: getMpaSettings(currentSettings),
    pdfs,
  };
}

export interface ParsedReapImportResult {
  normalizedSettings: AppSettings;
  pdfCaches: Record<string, { b64: string; filename: string }>;
  activePresetId: string;
}

export function parseReapMpaImportPayload(
  rawImport: unknown,
  currentStorageSettings: AppSettings,
): ParsedReapImportResult {
  if (!rawImport || typeof rawImport !== "object") {
    throw new Error("Arquivo inválido. Conteúdo não é um objeto JSON.");
  }

  const imported = rawImport as any;

  let importedPresets: ReapMpaPreset[] = [];
  let importedActiveId: string | undefined;
  let importedMpaSettings: Partial<AppSettings> = {};

  const rawPresets = Array.isArray(imported.reapMpaPresets) && imported.reapMpaPresets.length > 0
    ? imported.reapMpaPresets
    : (Array.isArray(imported.settings?.reapMpaPresets) && imported.settings.reapMpaPresets.length > 0
      ? imported.settings.reapMpaPresets
      : null);

  if (rawPresets) {
    importedPresets = rawPresets.map((p: any, idx: number) => ({
      id: typeof p.id === "string" && p.id.trim() ? p.id.trim() : `preset-${idx + 1}`,
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : `Preset ${idx + 1}`,
      settings: getMpaSettings(p.settings && typeof p.settings === "object" ? p.settings : {}),
    }));
    importedActiveId = typeof imported.activeReapMpaPresetId === "string"
      ? imported.activeReapMpaPresetId
      : (typeof imported.settings?.activeReapMpaPresetId === "string" ? imported.settings.activeReapMpaPresetId : undefined);
    const sourceSettings = (imported.settings && typeof imported.settings === "object") ? imported.settings : imported;
    importedMpaSettings = getMpaSettings(sourceSettings);
  } else {
    const sourceForMpa = (imported.settings && typeof imported.settings === "object")
      ? imported.settings
      : imported;
    importedMpaSettings = getMpaSettings(sourceForMpa);
    if (Object.keys(importedMpaSettings).length === 0) {
      throw new Error("Arquivo inválido. Não foram encontradas configurações válidas do REAP MPA.");
    }
    importedPresets = [
      {
        id: `preset-${Date.now()}`,
        name: "Padrão",
        settings: importedMpaSettings,
      },
    ];
  }

  if (importedPresets.length === 0) {
    throw new Error("Arquivo inválido. Nenhum preset do REAP MPA foi encontrado.");
  }

  const validPresetIds = new Set(importedPresets.map((p) => p.id));
  const finalActiveId = (importedActiveId && validPresetIds.has(importedActiveId))
    ? importedActiveId
    : importedPresets[0].id;

  const sanitizedPdfCaches: Record<string, { b64: string; filename: string }> = {};

  if (Array.isArray(imported.pdfs)) {
    for (const item of imported.pdfs) {
      if (!item || typeof item !== "object") continue;
      const pid = typeof item.presetId === "string" && validPresetIds.has(item.presetId) ? item.presetId : null;
      if (!pid) continue;
      const data = typeof item.data === "string" ? item.data : (typeof item.b64 === "string" ? item.b64 : "");
      const fileName = typeof item.fileName === "string" ? item.fileName : (typeof item.filename === "string" ? item.filename : "documento.pdf");
      if (data) {
        sanitizedPdfCaches[pid] = {
          b64: data.includes(",") ? data.split(",")[1] : data,
          filename: fileName,
        };
      }
    }
  } else if (imported.pdfCaches && typeof imported.pdfCaches === "object") {
    for (const [key, cache] of Object.entries(imported.pdfCaches)) {
      if (!cache || typeof cache !== "object") continue;
      const c = cache as any;
      if (typeof c.b64 === "string" && c.b64) {
        const pid = validPresetIds.has(key)
          ? key
          : (key === "sigessReapPdfCache" ? finalActiveId : null);
        if (pid) {
          sanitizedPdfCaches[pid] = {
            b64: c.b64.includes(",") ? c.b64.split(",")[1] : c.b64,
            filename: typeof c.filename === "string" ? c.filename : "documento.pdf",
          };
        }
      }
    }
  }

  const currentWithoutMpa = withoutMpaSettings(currentStorageSettings);
  const activePreset = importedPresets.find((p) => p.id === finalActiveId) ?? importedPresets[0];
  const activePresetMpa = {
    ...importedMpaSettings,
    ...activePreset.settings,
  };

  const normalizedSettings = normalizeReapSettings({
    ...currentWithoutMpa,
    ...activePresetMpa,
    reapMpaPresets: importedPresets,
    activeReapMpaPresetId: finalActiveId,
  });

  return {
    normalizedSettings,
    pdfCaches: sanitizedPdfCaches,
    activePresetId: finalActiveId,
  };
}
