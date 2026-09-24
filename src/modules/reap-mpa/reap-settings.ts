import { AppSettings, ReapMpaPreset } from "../../shared/types";
import { getConfiguredDefesoMonths } from "./monthly-plan";
import { FULL_PORTAL_SPECIES } from "../../shared/data/species";
import type { FishData } from "./types";
import { InvalidSpeciesPoolError } from "./types";

const REAP_STATE_LABELS: Record<number, string> = {
  1: "RONDONIA",
  2: "ACRE",
  3: "AMAZONAS",
  4: "RORAIMA",
  5: "PARA",
  6: "AMAPA",
  7: "TOCANTINS",
  8: "MARANHAO",
  9: "PIAUI",
  10: "CEARA",
  11: "RIO GRANDE DO NORTE",
  12: "PARAIBA",
  13: "PERNAMBUCO",
  14: "ALAGOAS",
  15: "SERGIPE",
  16: "BAHIA",
  17: "MINAS GERAIS",
  18: "ESPIRITO SANTO",
  19: "RIO DE JANEIRO",
  20: "SAO PAULO",
  21: "PARANA",
  22: "SANTA CATARINA",
  23: "RIO GRANDE DO SUL",
  24: "MATO GROSSO DO SUL",
  25: "MATO GROSSO",
  26: "GOIAS",
  27: "DISTRITO FEDERAL",
  28: "EX",
};

export const MIN_KG_SPAN = 4;
export const MIN_DAYS_SPAN = 4;
export const MIN_DAYS_VALUE = 7;
export const MAX_DAYS_VALUE = 28;
export const MIN_PRICE_SPAN = 3;
export const MPA_MONEY_STEP = 0.25;
export const MIN_MONTHLY_PRODUCTION_SPAN = 60;

const REAP_FISHING_LOCATION_LABELS: Record<number, string> = {
  1: "Açude",
  2: "Estuário",
  3: "Mar",
  4: "Lago",
  5: "Lagoa",
  6: "Rio",
  7: "Represa",
  8: "Reservatório",
  9: "Laguna",
};

const REAP_FISHING_METHOD_LABELS: Record<number, string> = {
  1: "Arrasto",
  2: "Cerco",
  3: "Covos",
  4: "Emalhe",
  5: "Espinhel",
  6: "Linha de Mao",
  7: "Linha e Anzol",
  8: "Mariscagem",
  9: "Matapi",
  10: "Pesca Subaquatica",
  11: "Tarrafa",
  12: "Vara",
  13: "Outro",
};

export function getReapStateLabel(stateCode?: number) {
  if (!stateCode) return "";
  return REAP_STATE_LABELS[stateCode] || "";
}

export function getReapFishingLocationLabel(locationCode?: number) {
  if (!locationCode) return "";
  return REAP_FISHING_LOCATION_LABELS[locationCode] || "";
}

export function getReapFishingMethodLabel(methodCode?: number) {
  if (!methodCode) return "";
  return REAP_FISHING_METHOD_LABELS[methodCode] || "";
}

export function getEffectiveFishingMethod(settings: Partial<AppSettings>): number | undefined {
  return settings.mpaMetodoPesca ?? settings.mpaPetrecho;
}

export function getDefesoMonthsNormalizationNotice(months?: number[]) {
  if (!Array.isArray(months)) return "Selecione os meses do defeso antes de usar o REAP.";

  if (months.length === 0) {
    return "Selecione pelo menos um mes de defeso antes de continuar.";
  }

  const normalized = getConfiguredDefesoMonths({ mpaDefesoMonths: months });
  if (normalized.length === 0 || normalized.length !== months.length) {
    return "Selecao de meses de defeso invalida. Revise os meses marcados antes de continuar.";
  }

  return null;
}

function normalizeDaysPerMonth(value?: string) {
  if (value === undefined || value === "") return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return String(Math.min(MAX_DAYS_VALUE, Math.max(MIN_DAYS_VALUE, Math.trunc(parsed))));
}

export function normalizePriceBounds(priceMin: number, priceMax: number): [number, number] | null {
  const min = Math.ceil(priceMin / MPA_MONEY_STEP) * MPA_MONEY_STEP;
  const max = Math.floor(priceMax / MPA_MONEY_STEP) * MPA_MONEY_STEP;
  return min <= max ? [min, max] : null;
}

export function getValidSpeciesPool(settingsSpecies?: unknown[]): FishData[] {
  if (!Array.isArray(settingsSpecies)) return [];
  const pool = settingsSpecies.flatMap((species: any) => {
    if (!species?.id) return [];

    const kgMin = Number(String(species.kgMin ?? "").replace(",", "."));
    const kgMax = Number(String(species.kgMax ?? "").replace(",", "."));
    const priceMin = Number(String(species.priceMin ?? "").replace(",", "."));
    const priceMax = Number(String(species.priceMax ?? "").replace(",", "."));
    if (![kgMin, kgMax, priceMin, priceMax].every(Number.isFinite)) return [];
    if (
      kgMin <= 0 || kgMax <= 0 || priceMin <= 0 || priceMax <= 0 ||
      kgMin > kgMax || kgMax - kgMin < MIN_KG_SPAN || priceMin > priceMax
    ) return [];

    const normalizedPrices = normalizePriceBounds(priceMin, priceMax);
    if (!normalizedPrices || normalizedPrices[1] - normalizedPrices[0] < MIN_PRICE_SPAN) return [];

    const meta = FULL_PORTAL_SPECIES.find((item) => item.id === Number(species.id));
    return [{
      id: Number(species.id),
      name: meta?.nome || "Desconhecido",
      kgMin,
      kgMax,
      priceMin: normalizedPrices[0],
      priceMax: normalizedPrices[1],
    }];
  });

  return Array.from(new Map(pool.map((species) => [species.id, species])).values());
}

export function assertValidSpeciesPool(pool: FishData[], requestedCount: number): void {
  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    throw new InvalidSpeciesPoolError("A quantidade de espécies deve ser um número inteiro maior que zero.");
  }
  if (pool.length < requestedCount) {
    throw new InvalidSpeciesPoolError(
      `A pool válida possui ${pool.length} espécie(s), mas são necessárias ${requestedCount}.`,
    );
  }
}

export function normalizeProductionRange(
  savedMin: number | undefined,
  savedMax: number | undefined,
  absMin: number,
  absMax: number,
  minSpan = 300,
  step = MPA_MONEY_STEP,
): [number, number] {
  if (!Number.isFinite(absMin) || !Number.isFinite(absMax) || absMax < absMin) {
    throw new RangeError(`Envelope de produção inválido: absMin (${absMin}) não pode ser maior que absMax (${absMax}).`);
  }

  const safeStep = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : MPA_MONEY_STEP;
  const absMinOnGrid = Math.ceil(absMin / safeStep) * safeStep;
  const absMaxOnGrid = Math.floor(absMax / safeStep) * safeStep;
  if (absMinOnGrid > absMaxOnGrid) {
    throw new RangeError(`Envelope não contém nenhum valor viável na granularidade de ${safeStep}: [${absMin}, ${absMax}].`);
  }

  const parsedSpan = Number(minSpan);
  const safeSpan = Number.isFinite(parsedSpan) && parsedSpan >= 0 ? parsedSpan : 300;
  const effectiveSpan = Math.min(safeSpan, absMaxOnGrid - absMinOnGrid);
  let lo = Number.isFinite(Number(savedMin)) ? Math.round(Number(savedMin) / safeStep) * safeStep : absMinOnGrid;
  let hi = Number.isFinite(Number(savedMax)) ? Math.round(Number(savedMax) / safeStep) * safeStep : absMaxOnGrid;

  if (lo > hi) [lo, hi] = [hi, lo];
  if (hi > absMaxOnGrid) {
    hi = absMaxOnGrid;
    lo = Math.min(lo, hi - effectiveSpan);
  }
  if (lo < absMinOnGrid) {
    lo = absMinOnGrid;
    hi = Math.max(hi, lo + effectiveSpan);
  }
  if (hi > absMaxOnGrid) hi = absMaxOnGrid;
  if (hi - lo < effectiveSpan) {
    if (absMaxOnGrid - lo >= effectiveSpan) hi = lo + effectiveSpan;
    else {
      lo = Math.max(absMinOnGrid, absMaxOnGrid - effectiveSpan);
      hi = absMaxOnGrid;
    }
  }

  lo = Math.round(Math.max(absMinOnGrid, Math.min(lo, absMaxOnGrid)) / safeStep) * safeStep;
  hi = Math.round(Math.max(absMinOnGrid, Math.min(hi, absMaxOnGrid)) / safeStep) * safeStep;
  if (lo > hi) lo = hi;
  return [lo, hi];
}

export function normalizeReapSettings(settings: AppSettings): AppSettings {
  const residenceUF = settings.mpaResidenceUF ?? settings.mpaUF;
  const residenceMunicipio = settings.mpaResidenceMunicipio ?? settings.mpaMunicipio;
  let commercializationStates = settings.mpaCommercializationStates;
  if (!commercializationStates || commercializationStates.length === 0) {
    commercializationStates = residenceUF !== undefined ? [residenceUF] : undefined;
  }
  const defesoMonths = Array.isArray(settings.mpaDefesoMonths)
    ? getConfiguredDefesoMonths(settings)
    : undefined;
  const documentoMode = settings.mpaDocumentoMode === "local" || settings.mpaDocumentoMode === "manual"
    ? settings.mpaDocumentoMode
    : undefined;
  const metodoPesca = settings.mpaMetodoPesca ?? settings.mpaPetrecho;

  return {
    ...settings,
    ...(residenceUF === undefined ? {} : { mpaResidenceUF: residenceUF }),
    ...(residenceMunicipio === undefined ? {} : { mpaResidenceMunicipio: residenceMunicipio }),
    ...(commercializationStates === undefined ? {} : { mpaCommercializationStates: commercializationStates }),
    ...(defesoMonths === undefined ? {} : { mpaDefesoMonths: defesoMonths }),
    ...(metodoPesca === undefined ? {} : { mpaMetodoPesca: metodoPesca }),
    ...(documentoMode === undefined ? {} : { mpaDocumentoMode: documentoMode }),
    mpaMascDaysMin: normalizeDaysPerMonth(settings.mpaMascDaysMin ?? "21"),
    mpaMascDaysMax: normalizeDaysPerMonth(settings.mpaMascDaysMax ?? "25"),
    mpaFemDaysMin: normalizeDaysPerMonth(settings.mpaFemDaysMin ?? "21"),
    mpaFemDaysMax: normalizeDaysPerMonth(settings.mpaFemDaysMax ?? "25"),
  };
}

export function activateReapMpaPreset(settings: AppSettings, presetId: string): AppSettings | null {
  const presets = settings.reapMpaPresets || [];
  const preset = presets.find((item: ReapMpaPreset) => item.id === presetId);
  if (!preset) return null;

  const withoutMpaSettings = Object.fromEntries(
    Object.entries(settings).filter(([key]) => !key.startsWith("mpa")),
  ) as AppSettings;

  return normalizeReapSettings({
    ...withoutMpaSettings,
    ...preset.settings,
    reapMpaPresets: presets,
    activeReapMpaPresetId: presetId,
  });
}
