import { AppSettings } from "../../shared/types";
import { getFishingMonthIndexes, getActiveProductionForMonth, isDefesoMonth } from "./monthly-plan";
import { generateMpaProduction } from "./generators/mpa-production";
import { normalizeReapSettings } from "./reap-settings";

export interface ReapSimulationSpecies {
  id: number;
  name: string;
  kg: number;
  price: number;
  value: number;
}

export interface ReapSimulationGenderMonth {
  days?: number;
  total: number;
  species: ReapSimulationSpecies[];
  error?: string;
}

export interface ReapSimulationMonth {
  month: number;
  houvePesca: boolean;
  masculine: ReapSimulationGenderMonth;
  feminine: ReapSimulationGenderMonth;
}

export interface ReapSimulationResult {
  months: ReapSimulationMonth[];
}

function errorMonth(message: string): ReapSimulationGenderMonth {
  return { total: 0, species: [], error: message };
}

function buildGenderMonths(
  settings: AppSettings,
  gender: "MASCULINO" | "FEMININO",
  randomFn: () => number,
): ReapSimulationGenderMonth[] {
  const months = getFishingMonthIndexes(settings);
  try {
    const { daysMap, production } = generateMpaProduction(gender, settings, { randomFn });

    return Array.from({ length: 12 }, (_, month) => {
      if (!months.includes(month)) return { total: 0, species: [] };
      const species = getActiveProductionForMonth(month, production).map((fish) => {
        const kg = fish.monthlyKg[month] || 0;
        const price = fish.monthlyPrices?.[month] || fish.price || 0;
        return {
          id: fish.id,
          name: fish.name,
          kg,
          price,
          value: kg * price,
        };
      });
      return {
        days: daysMap[month],
        total: species.reduce((sum, fish) => sum + fish.value, 0),
        species,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Array.from({ length: 12 }, (_, month) =>
      months.includes(month) ? errorMonth(message) : { total: 0, species: [] },
    );
  }
}

export function simulateReapMpa(
  rawSettings: AppSettings,
  randomFn: () => number = Math.random,
): ReapSimulationResult {
  const settings = normalizeReapSettings(rawSettings);
  const masculine = buildGenderMonths(settings, "MASCULINO", randomFn);
  const feminine = buildGenderMonths(settings, "FEMININO", randomFn);

  return {
    months: Array.from({ length: 12 }, (_, month) => ({
      month,
      houvePesca: !isDefesoMonth(settings, month + 1),
      masculine: masculine[month],
      feminine: feminine[month],
    })),
  };
}
