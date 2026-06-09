import { AppSettings, TurboEspecieConfig, TurboMesConfig } from "../../shared/types";
import { FishProduction } from "./types";

const DEFESO_JUSTIFICATIVA = 1;
const ALL_MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index);

function sanitizeDefesoMonths(months?: number[]) {
  if (!Array.isArray(months)) return [];

  return Array.from(
    new Set(
      months
        .map((month) => Number(month))
        .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
    ),
  ).sort((a, b) => a - b);
}

export function getConfiguredDefesoMonths(settings: Partial<AppSettings>) {
  return sanitizeDefesoMonths(settings.mpaDefesoMonths);
}

export function hasConfiguredDefesoMonths(settings: Partial<AppSettings>) {
  return getConfiguredDefesoMonths(settings).length > 0;
}

export function isDefesoMonth(settings: Partial<AppSettings>, monthNumber: number) {
  return getConfiguredDefesoMonths(settings).includes(monthNumber);
}

export function getFishingMonthIndexes(settings: Partial<AppSettings>) {
  return ALL_MONTH_INDEXES.filter((monthIndex) => !isDefesoMonth(settings, monthIndex + 1));
}

export function getFishingMonthNumbers(settings: Partial<AppSettings>) {
  return getFishingMonthIndexes(settings).map((monthIndex) => monthIndex + 1);
}

export function getPeakMonthIndexes(defesoMonths: number[]): Set<number> {
  const peaks = new Set<number>();
  const defesoSet = new Set(defesoMonths);
  for (const defMonth of defesoMonths) {
    const defIndex = defMonth - 1;
    const before = defIndex - 1;
    if (before >= 0 && !defesoSet.has(before + 1)) peaks.add(before);
    const after = (defIndex + 1) % 12;
    if (!defesoSet.has(after + 1)) peaks.add(after);
  }
  return peaks;
}

function buildSpeciesForMonth(monthIndex: number, production: FishProduction[]): TurboEspecieConfig[] {
  return production
    .map((fish) => {
      const monthlyKg = fish.monthlyKg[monthIndex] || 0;
      if (monthlyKg <= 0) return null;

      return {
        especiePescado: fish.id,
        unidadeMedida: 1,
        quantidade: monthlyKg,
        valorMedioQuilo: fish.price,
      };
    })
    .filter((item): item is TurboEspecieConfig => item !== null);
}

export function buildMonthPlan(
  settings: Partial<AppSettings>,
  monthIndex: number,
  daysMap: Record<number, number>,
  production: FishProduction[],
): TurboMesConfig {
  const monthNumber = monthIndex + 1;

  if (isDefesoMonth(settings, monthNumber)) {
    return {
      mes: monthNumber,
      houvePesca: false,
      justificativa: DEFESO_JUSTIFICATIVA,
    };
  }

  return {
    mes: monthNumber,
    houvePesca: true,
    diasTrabalhados: daysMap[monthIndex],
    especies: buildSpeciesForMonth(monthIndex, production),
  };
}
