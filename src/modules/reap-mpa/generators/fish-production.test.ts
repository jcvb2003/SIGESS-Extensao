import { describe, expect, it } from "vitest";
import { ProductionGenerator } from "./fish-production";

const species = [12, 21, 26, 25, 15].map((id) => ({
  id,
  kgMin: "5",
  kgMax: "5",
  priceMin: "10",
  priceMax: "11",
}));

const settings = {
  mpaSpecies: species,
  mpaSpeciesCount: 4,
  mpaDefesoMonths: [1, 2, 3, 4],
  mpaMascDaysMin: "21",
  mpaMascDaysMax: "21",
  mpaMascProductionAnnualMin: 1600,
  mpaMascProductionAnnualMax: 1760,
};

const daysMap = Object.fromEntries(Array.from({ length: 12 }, (_, month) => [month, month < 4 ? 0 : 21]));

describe("ProductionGenerator", () => {
  it("generates a classic MPA plan with discrete monthly prices", () => {
    const result = ProductionGenerator.generate(daysMap, "MASCULINO", settings, {
      mode: "mpa",
      randomFn: () => 0.5,
    });
    const activeCounts = Array.from({ length: 8 }, (_, offset) => {
      const month = offset + 4;
      return result.filter((fish) => fish.monthlyKg[month] > 0).length;
    });

    expect(activeCounts.every((count) => count === 4)).toBe(true);
    expect(result.every((fish) => Object.values(fish.monthlyPrices || {}).every((price) => price === 0 || price * 2 === Math.round(price * 2)))).toBe(true);
    expect(result.every((fish) => Math.abs(fish.price * fish.totalKg - Object.keys(fish.monthlyKg).reduce((sum, month) => sum + fish.monthlyKg[Number(month)] * (fish.monthlyPrices?.[Number(month)] || 0), 0)) < 0.01)).toBe(true);
  });

  it("keeps exactly N unique species in each rotated month", () => {
    const result = ProductionGenerator.generate(daysMap, "MASCULINO", {
      ...settings,
      mpaRotateMonthlySpecies: true,
    }, { mode: "mpa", randomFn: () => 0.5 });

    for (let month = 4; month < 12; month += 1) {
      const active = result.filter((fish) => fish.monthlyKg[month] > 0);
      expect(active).toHaveLength(4);
      expect(new Set(active.map((fish) => fish.id)).size).toBe(4);
    }
  });
});
