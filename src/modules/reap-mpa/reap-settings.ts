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

export const ALLOWED_REAP_MPA_SETTING_KEYS = new Set([
  "mpaReferenceYear",
  "mpaResidenceUF",
  "mpaResidenceMunicipio",
  "mpaWorkRelation",
  "mpaCommercializationStates",
  "mpaDefesoMonths",
  "mpaMunicipio",
  "mpaUF",
  "mpaLocalPesca",
  "mpaNomeLocalPesca",
  "mpaMetodoPesca",
  "mpaPetrecho",
  "mpaAmbiente",
  "mpaDocumentoMode",
  "mpaSpecies",
  "mpaSpeciesCount",
  "mpaRotateMonthlySpecies",
  "mpaEsocialMonthlyValue",
  "mpaMascProdMin",
  "mpaMascProdMax",
  "mpaMascProductionAnnualMin",
  "mpaMascProductionAnnualMax",
  "mpaMascProductionMonthlyMin",
  "mpaMascProductionMonthlyMax",
  "mpaMascDaysMin",
  "mpaMascDaysMax",
  "mpaMascAnnualMin",
  "mpaMascAnnualMax",
  "mpaFemProdMin",
  "mpaFemProdMax",
  "mpaFemProductionAnnualMin",
  "mpaFemProductionAnnualMax",
  "mpaFemProductionMonthlyMin",
  "mpaFemProductionMonthlyMax",
  "mpaFemDaysMin",
  "mpaFemDaysMax",
  "mpaFemAnnualMin",
  "mpaFemAnnualMax",
]);

export function getMpaSettings(settings: Partial<AppSettings> | Record<string, unknown>): Partial<AppSettings> {
  if (!settings || typeof settings !== "object") return {};
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => ALLOWED_REAP_MPA_SETTING_KEYS.has(key)),
  ) as Partial<AppSettings>;
}

export function withoutMpaSettings(settings: Partial<AppSettings> | Record<string, unknown>): AppSettings {
  if (!settings || typeof settings !== "object") return {} as AppSettings;
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !ALLOWED_REAP_MPA_SETTING_KEYS.has(key)),
  ) as unknown as AppSettings;
}

export function parseMoneyValue(value?: string | number): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
  const normalized = String(value).trim().replace(/[^0-9,.-]/g, "");
  const withDot = normalized.includes(",")
    ? normalized.replaceAll(".", "").replace(",", ".")
    : normalized;
  const numberValue = Number(withDot);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

export function normalizeMonthlyProductionRange(
  savedMin: string | number | undefined,
  savedMax: string | number | undefined,
  safeMonthlyMin: number,
  safeMonthlyMax: number,
  minSpan = MIN_MONTHLY_PRODUCTION_SPAN,
): [number, number] | null {
  const minVal = parseMoneyValue(savedMin);
  const maxVal = parseMoneyValue(savedMax);
  if (minVal <= 0 && maxVal <= 0) return null;

  return normalizeProductionRange(
    minVal > 0 ? minVal : safeMonthlyMin,
    maxVal > 0 ? maxVal : safeMonthlyMax,
    safeMonthlyMin,
    safeMonthlyMax,
    minSpan,
    MPA_MONEY_STEP,
  );
}

export interface SafeProductionEnvelope {
  safeMonthlyMin: number;
  safeMonthlyMax: number;
  monthlyMin: number;
  monthlyMax: number;
  min: number;
  max: number;
  usableCount: number;
  productiveMonths: number;
  isReady: boolean;
  hasMonthlyAnnualConflict: boolean;
}

export function calculateSafeProductionEnvelope(
  settings: AppSettings,
  gender?: "MASCULINO" | "FEMININO",
): SafeProductionEnvelope {
  const defesoSet = new Set(
    (settings.mpaDefesoMonths || []).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
  );
  const productiveMonths = 12 - defesoSet.size;

  const species = getValidSpeciesPool(settings.mpaSpecies);
  const requestedCount = Number(settings.mpaSpeciesCount);
  const usableCount = species.length;
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || usableCount < requestedCount || productiveMonths <= 0) {
    return {
      safeMonthlyMin: 0,
      safeMonthlyMax: 0,
      monthlyMin: 0,
      monthlyMax: 0,
      min: 0,
      max: 0,
      usableCount,
      productiveMonths,
      isReady: false,
      hasMonthlyAnnualConflict: false,
    };
  }

  // PISO SEGURO: maior piso mínimo entre as combinações de requestedCount espécies
  // (Pior caso de piso mínimo: pegar as requestedCount espécies de maior piso)
  const safeMonthlyMin = species
    .map((item) => item.kgMin * item.priceMin)
    .sort((a, b) => b - a)
    .slice(0, requestedCount)
    .reduce((sum, value) => sum + value, 0);

  // TETO SEGURO: menor teto máximo entre as combinações de requestedCount espécies
  // (Pior caso de teto máximo: pegar as requestedCount espécies de menor teto)
  const safeMonthlyMax = species
    .map((item) => item.kgMax * item.priceMax)
    .sort((a, b) => a - b)
    .slice(0, requestedCount)
    .reduce((sum, value) => sum + value, 0);

  const theoreticalAnnualMin = safeMonthlyMin * productiveMonths;
  const theoreticalAnnualMax = safeMonthlyMax * productiveMonths;

  const prefix = gender === "FEMININO" ? "mpaFemProductionMonthly" : "mpaMascProductionMonthly";
  const monthlyNormalized = gender
    ? normalizeMonthlyProductionRange(
        settings[`${prefix}Min` as keyof AppSettings] as string,
        settings[`${prefix}Max` as keyof AppSettings] as string,
        safeMonthlyMin,
        safeMonthlyMax,
      )
    : null;

  const annualMin = Math.max(
    theoreticalAnnualMin,
    monthlyNormalized ? monthlyNormalized[0] * productiveMonths : 0,
  );
  const annualMax = Math.min(
    theoreticalAnnualMax,
    monthlyNormalized ? monthlyNormalized[1] * productiveMonths : Number.POSITIVE_INFINITY,
  );
  const theoreticalMinOnGrid = Math.ceil(theoreticalAnnualMin / MPA_MONEY_STEP) * MPA_MONEY_STEP;
  const theoreticalMaxOnGrid = Math.floor(theoreticalAnnualMax / MPA_MONEY_STEP) * MPA_MONEY_STEP;
  const hasMonthlyAnnualConflict = annualMin > annualMax || safeMonthlyMin > safeMonthlyMax;

  return {
    safeMonthlyMin,
    safeMonthlyMax,
    monthlyMin: Math.ceil(safeMonthlyMin / MPA_MONEY_STEP) * MPA_MONEY_STEP,
    monthlyMax: Math.floor(safeMonthlyMax / MPA_MONEY_STEP) * MPA_MONEY_STEP,
    min: hasMonthlyAnnualConflict ? theoreticalMinOnGrid : Math.ceil(annualMin / MPA_MONEY_STEP) * MPA_MONEY_STEP,
    max: hasMonthlyAnnualConflict ? theoreticalMaxOnGrid : Math.floor(annualMax / MPA_MONEY_STEP) * MPA_MONEY_STEP,
    usableCount,
    productiveMonths,
    isReady: !hasMonthlyAnnualConflict,
    hasMonthlyAnnualConflict,
  };
}

export function activateReapMpaPreset(settings: AppSettings, presetId: string): AppSettings | null {
  const presets = settings.reapMpaPresets || [];
  const preset = presets.find((item: ReapMpaPreset) => item.id === presetId);
  if (!preset) return null;

  return normalizeReapSettings({
    ...withoutMpaSettings(settings),
    ...preset.settings,
    reapMpaPresets: presets,
    activeReapMpaPresetId: presetId,
  });
}
