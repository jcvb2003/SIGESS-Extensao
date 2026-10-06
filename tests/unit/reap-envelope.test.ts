import { describe, it, expect } from "vitest";
import {
  calculateSafeProductionEnvelope,
  normalizeProductionRange,
} from "../../src/modules/reap-mpa/reap-settings";
import { AppSettings } from "../../src/shared/types";

describe("REAP MPA Safe Envelope (Bússola)", () => {
  const analyzedConfig: Partial<AppSettings> = {
    mpaDefesoMonths: [1, 2, 3, 11, 12], // 5 meses de defeso -> 7 meses produtivos
    mpaSpeciesCount: 4,
    mpaSpecies: [
      // 3 espécies maiores: 20kg x R$ 11 = 220 mín; 50kg x R$ 15 = 750 máx
      { id: 10, nome: "Tucunaré", kgMin: "20", kgMax: "50", priceMin: "11.00", priceMax: "15.00" },
      { id: 20, nome: "Tambaqui", kgMin: "20", kgMax: "50", priceMin: "11.00", priceMax: "15.00" },
      { id: 30, nome: "Pirarucu", kgMin: "20", kgMax: "50", priceMin: "11.00", priceMax: "15.00" },
      // 4 espécies menores: 15kg x R$ 11 = 165 mín; 25kg x R$ 15 = 375 máx
      { id: 40, nome: "Curimatã", kgMin: "15", kgMax: "25", priceMin: "11.00", priceMax: "15.00" },
      { id: 50, nome: "Pacu", kgMin: "15", kgMax: "25", priceMin: "11.00", priceMax: "15.00" },
      { id: 60, nome: "Jaraqui", kgMin: "15", kgMax: "25", priceMin: "11.00", priceMax: "15.00" },
      { id: 70, nome: "Sarda", kgMin: "15", kgMax: "25", priceMin: "11.00", priceMax: "15.00" },
    ],
    mpaFemProductionAnnualMin: 5673.5,
    mpaFemProductionAnnualMax: 5673.5,
  };

  it("calculates the safe monthly floor as R$ 825,00 and safe annual floor as R$ 5.775,00 for 7 productive months", () => {
    const envelope = calculateSafeProductionEnvelope(analyzedConfig as AppSettings, "FEMININO");

    expect(envelope.productiveMonths).toBe(7);
    expect(envelope.usableCount).toBe(7);
    // Pior caso de piso mínimo com 4 espécies: 3 maiores (220*3) + 1 menor (165) = 825
    expect(envelope.safeMonthlyMin).toBe(825);
    expect(envelope.monthlyMin).toBe(825);

    // Consequente piso anual: 825 * 7 = 5.775,00
    expect(envelope.min).toBe(5775);
    expect(envelope.isReady).toBe(true);
    expect(envelope.hasMonthlyAnnualConflict).toBe(false);
  });

  it("recalculates the saved female annual value (R$ 5.673,50) to the safe floor (R$ 5.775,00)", () => {
    const envelope = calculateSafeProductionEnvelope(analyzedConfig as AppSettings, "FEMININO");

    const [normalizedMin, normalizedMax] = normalizeProductionRange(
      analyzedConfig.mpaFemProductionAnnualMin,
      analyzedConfig.mpaFemProductionAnnualMax,
      envelope.min,
      envelope.max,
      300,
    );

    // O valor antigo de 5.673,50 estava abaixo de 5.775,00 e é ajustado
    expect(normalizedMin).toBe(5775);
    expect(normalizedMax).toBeGreaterThanOrEqual(5775);
  });

  it("dynamically recalculates the annual floor when defeso months change", () => {
    // Se mudar para 4 meses de defeso -> 8 meses produtivos
    const configWith4MonthsDefeso: Partial<AppSettings> = {
      ...analyzedConfig,
      mpaDefesoMonths: [1, 2, 11, 12],
    };

    const envelope = calculateSafeProductionEnvelope(configWith4MonthsDefeso as AppSettings, "MASCULINO");

    expect(envelope.productiveMonths).toBe(8);
    // Piso mensal permanece 825, mas piso anual passa a ser 825 * 8 = 6.600,00
    expect(envelope.min).toBe(6600);
  });

  it("normalizes monthly bounds below safe floor without collapsing and preserves minimum span", () => {
    const configWithMonthlyLimits: Partial<AppSettings> = {
      ...analyzedConfig,
      mpaFemProductionMonthlyMin: "705",
      mpaFemProductionMonthlyMax: "810.5",
    };

    const envelope = calculateSafeProductionEnvelope(configWithMonthlyLimits as AppSettings, "FEMININO");

    // O piso seguro é 825. O limite mensal inferior é promovido para 825 e o superior para 885 (span de R$ 60)
    // O envelope anual consequente NÃO colapsa para 5775..5775: vira 5775 a 6195 (885 * 7)
    expect(envelope.min).toBe(5775);
    expect(envelope.max).toBe(6195);
    expect(envelope.max - envelope.min).toBe(420);
    expect(envelope.isReady).toBe(true);
    expect(envelope.hasMonthlyAnnualConflict).toBe(false);
  });
});
