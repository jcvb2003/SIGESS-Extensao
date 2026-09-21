import { describe, expect, it } from "vitest";
import { ProductionGenerator } from "./fish-production";
import { buildMonthPlan } from "../monthly-plan";

const species = [12, 21, 26, 25, 15].map((id) => ({
  id,
  kgMin: "5",
  kgMax: "9",
  priceMin: "10",
  priceMax: "13",
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

  it("preserves the shuffled calendar order in the monthly payload", () => {
    const result = ProductionGenerator.generate(daysMap, "MASCULINO", settings, {
      mode: "mpa",
      randomFn: () => 0.5,
    });
    const monthPlan = buildMonthPlan(settings, 4, daysMap, result);
    const expected = result
      .filter((fish) => fish.monthlyKg[4] > 0)
      .sort((a, b) => (a.monthlyOrder?.[4] ?? Number.MAX_SAFE_INTEGER) - (b.monthlyOrder?.[4] ?? Number.MAX_SAFE_INTEGER))
      .map((fish) => fish.id);

    expect(monthPlan.especies?.map((species) => species.especiePescado)).toEqual(expected);
  });

  it("derives kg from configured days without flattening the monthly values", () => {
    const singleSpeciesSettings = {
       mpaSpecies: [{ id: 10, kgMin: "30", kgMax: "35", priceMin: "10", priceMax: "13" }],
      mpaSpeciesCount: 1,
      mpaDefesoMonths: [1, 2, 3, 4, 5, 6, 7],
      mpaMascDaysMin: "21",
      mpaMascDaysMax: "25",
      mpaMascProductionAnnualMin: 1500,
      mpaMascProductionAnnualMax: 1760,
    };
    const daysMap = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0,
      7: 21, 8: 22, 9: 23, 10: 24, 11: 25,
    };

    const result = ProductionGenerator.generate(daysMap, "MASCULINO", singleSpeciesSettings, {
      mode: "mpa",
      randomFn: () => 0.5,
    });

    expect([7, 8, 9, 10, 11].map((month) => result[0].monthlyKg[month])).toEqual([30, 31, 33, 34, 35]);
    expect(Object.values(result[0].monthlyKg).every((kg) => Number.isInteger(kg))).toBe(true);
  });
});
