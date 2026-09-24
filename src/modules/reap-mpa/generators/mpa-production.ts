import { AppSettings } from "../../../shared/types";
import { DaysGenerator } from "./days-schedule";
import { ProductionGenerator } from "./fish-production";
import type { FishProduction, ProductionGeneratorOptions } from "../types";

const MAX_FULL_DRAW_ATTEMPTS = 30;

export interface MpaProductionResult {
  daysMap: Record<number, number>;
  production: FishProduction[];
}

/**
 * Gera um sorteio MPA completo. Dias e produção pertencem à mesma tentativa:
 * se a escala de dias tornar a produção inviável, uma nova escala também é sorteada.
 */
export function generateMpaProduction(
  gender: "MASCULINO" | "FEMININO",
  settings: Partial<AppSettings>,
  options: Omit<ProductionGeneratorOptions, "mode"> = {},
): MpaProductionResult {
  let lastError = "Não foi possível gerar uma produção compatível com as configurações.";

  for (let attempt = 0; attempt < MAX_FULL_DRAW_ATTEMPTS; attempt += 1) {
    try {
      const daysMap = DaysGenerator.generate(gender, settings, options.randomFn);
      const production = ProductionGenerator.generate(daysMap, gender, settings, {
        ...options,
        mode: "mpa",
      });
      return { daysMap, production };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}
