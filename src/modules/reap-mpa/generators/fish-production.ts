import { FishProduction, FishData } from "../types";
import { FISH_TABLE } from "../config";
import { FULL_PORTAL_SPECIES } from "../../../shared/data/species";
import { getFishingMonthIndexes } from "../monthly-plan";

export const ProductionGenerator: any = {
  generate(
    daysMap: Record<number, number>,
    gender: "MASCULINO" | "FEMININO",
    settings?: any
  ): FishProduction[] {
    const fishingMonths = getFishingMonthIndexes(settings || {});
    const productiveMonths = fishingMonths.length;
    const currentFishTable = this.selectSpecies(settings);
    const { targetMin, targetMax } = this.getTargetRange(gender, settings);

    if (productiveMonths === 0 || currentFishTable.length === 0) {
      return this.generateFallback(currentFishTable, fishingMonths);
    }

    const result = this.resolve(currentFishTable, daysMap, fishingMonths, productiveMonths, targetMin, targetMax);
    this.logFinalProduction(result, gender);
    return result;
  },

  selectSpecies(settings?: any): FishData[] {
    const count = Math.min(settings?.mpaSpeciesCount ?? 5, 10);
    const pool = this.mapSpeciesFromSettings(settings?.mpaSpecies)
      .filter((s: FishData) => s.id && s.kgMin != null && s.kgMax != null);

    if (pool.length <= count) return pool;
    return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
  },

  mapSpeciesFromSettings(settingsSpecies?: any[]): FishData[] {
    if (!settingsSpecies || settingsSpecies.length === 0) return FISH_TABLE;

    const mapped = settingsSpecies
      .filter((s) => s.id)
      .map((s) => {
        const meta = FULL_PORTAL_SPECIES.find((f) => f.id === s.id);
        return {
          id: Number(s.id),
          name: meta?.nome || "Desconhecido",
          kgMin: Number(s.kgMin || 0),
          kgMax: Number(s.kgMax || 0),
          priceMin: Number(s.priceMin || 0),
          priceMax: Number(s.priceMax || 0),
        } as FishData;
      });
    return mapped.length > 0 ? mapped : FISH_TABLE;
  },

  getTargetRange(gender: string, settings?: any): { targetMin: number; targetMax: number } {
    if (!settings) {
      return { targetMin: 0, targetMax: 0 };
    }

    const prefix = gender === "MASCULINO" ? "mpaMascProductionAnnual" : "mpaFemProductionAnnual";
    const targetMin = Number(settings[`${prefix}Min`]) || 0;
    const targetMax = Number(settings[`${prefix}Max`]) || 0;

    return { targetMin, targetMax };
  },

  resolve(
    table: FishData[],
    daysMap: Record<number, number>,
    fishingMonths: number[],
    productiveMonths: number,
    targetMin: number,
    targetMax: number
  ): FishProduction[] {
    const minDias = Math.min(...fishingMonths.map((m) => daysMap[m] || 0));
    const maxDias = Math.max(...fishingMonths.map((m) => daysMap[m] || 0));

    const speciesMinAnnual = table.map((fish) => fish.kgMin * fish.priceMin * productiveMonths);
    const speciesMaxAnnual = table.map((fish) => fish.kgMax * fish.priceMax * productiveMonths);
    const totalMin = speciesMinAnnual.reduce((s, v) => s + v, 0);
    const totalMax = speciesMaxAnnual.reduce((s, v) => s + v, 0);

    const effectiveMin = Math.max(targetMin, totalMin);
    const effectiveMax = Math.min(targetMax, totalMax);
    const target = effectiveMin + Math.random() * (effectiveMax - effectiveMin);

    const contributions = this.distributeTarget(table, productiveMonths, speciesMinAnnual, speciesMaxAnnual, totalMin, totalMax, target);

    const monthlyKgMap = this.generateAllMonthlyKg(table, daysMap, fishingMonths, minDias, maxDias);

    const result: FishProduction[] = table.map((fish, i) => {
      const monthlyKg = monthlyKgMap[i];
      const annualKg = (Object.values(monthlyKg) as number[]).reduce((s, v) => s + v, 0);
      return {
        id: fish.id,
        name: fish.name,
        totalKg: annualKg,
        price: 0,
        monthlyKg,
      };
    });

    this.resolvePrices(result, table, contributions);

    const totalValue = result.reduce((s, p) => s + p.totalKg * p.price, 0);
    if (totalValue < effectiveMin || totalValue > effectiveMax) {
      this.adjustToTarget(result, table, contributions, effectiveMin, effectiveMax);
    }

    return result;
  },

  distributeTarget(
    table: FishData[],
    _productiveMonths: number,
    speciesMinAnnual: number[],
    speciesMaxAnnual: number[],
    totalMin: number,
    _totalMax: number,
    target: number
  ): number[] {
    const excess = target - totalMin;
    const totalCapacity = speciesMaxAnnual.reduce((s, v, i) => s + (v - speciesMinAnnual[i]), 0);

    if (totalCapacity <= 0) {
      return [...speciesMinAnnual];
    }

    return table.map((_, i) => {
      const capacity = speciesMaxAnnual[i] - speciesMinAnnual[i];
      return speciesMinAnnual[i] + excess * (capacity / totalCapacity);
    });
  },

  generateAllMonthlyKg(
    table: FishData[],
    daysMap: Record<number, number>,
    fishingMonths: number[],
    minDias: number,
    maxDias: number
  ): Record<number, number>[] {
    const sumMin = table.reduce((s, f) => s + f.kgMin, 0);
    const sumMax = table.reduce((s, f) => s + f.kgMax, 0);

    const monthlyConsolidated: Record<number, number> = {};
    for (const m of fishingMonths) {
      const dias = daysMap[m] || 0;
      if (maxDias === minDias) {
        monthlyConsolidated[m] = Math.round((sumMin + sumMax) / 2);
      } else {
        const intensity = (dias - minDias) / (maxDias - minDias);
        monthlyConsolidated[m] = Math.round(sumMin + intensity * (sumMax - sumMin));
      }
    }

    const results: Record<number, number>[] = table.map(() => {
      const kg: Record<number, number> = {};
      for (let i = 0; i < 12; i++) kg[i] = 0;
      return kg;
    });

    for (const m of fishingMonths) {
      const target = monthlyConsolidated[m];
      const allocated: number[] = table.map((f) => f.kgMin);
      let leftover = target - sumMin;

      for (let i = 0; i < table.length; i++) {
        const fish = table[i];
        const capacity = fish.kgMax - fish.kgMin;
        const totalCapacity = table.reduce((s, f) => s + (f.kgMax - f.kgMin), 0);

        if (leftover > 0 && totalCapacity > 0) {
          const share = Math.round((capacity / totalCapacity) * leftover);
          const added = Math.min(share, capacity, leftover);
          allocated[i] += added;
          leftover -= added;
        }

        results[i][m] = allocated[i];
      }

      if (leftover > 0) {
        for (let i = 0; i < table.length && leftover > 0; i++) {
          const fish = table[i];
          const canAdd = fish.kgMax - results[i][m];
          const add = Math.min(canAdd, leftover);
          results[i][m] += add;
          leftover -= add;
        }
      }
    }

    return results;
  },

  resolvePrices(
    productions: FishProduction[],
    table: FishData[],
    contributions: number[]
  ) {
    productions.forEach((prod, i) => {
      const fish = table.find((f) => f.name === prod.name);
      if (!fish || prod.totalKg === 0) return;

      const price = contributions[i] / prod.totalKg;
      prod.price = Math.max(fish.priceMin, Math.min(fish.priceMax, Math.round(price * 2) / 2));
    });
  },

  adjustToTarget(
    productions: FishProduction[],
    table: FishData[],
    _contributions: number[],
    targetMin: number,
    targetMax: number
  ) {
    for (let iteration = 0; iteration < 10; iteration++) {
      const total = productions.reduce((s, p) => s + p.totalKg * p.price, 0);
      if (total >= targetMin && total <= targetMax) return;

      const isUnder = total < targetMin;
      for (const prod of productions) {
        const fish = table.find((f) => f.name === prod.name);
        if (!fish) continue;

        if (isUnder && prod.price < fish.priceMax) {
          prod.price = Math.min(fish.priceMax, prod.price + 0.5);
        } else if (!isUnder && prod.price > fish.priceMin) {
          prod.price = Math.max(fish.priceMin, prod.price - 0.5);
        }
      }
    }

    const total = productions.reduce((s, p) => s + p.totalKg * p.price, 0);
    if (total < targetMin || total > targetMax) {
      for (const prod of productions) {
        const fish = table.find((f) => f.name === prod.name);
        if (!fish) continue;

        for (const m of Object.keys(prod.monthlyKg).map(Number)) {
          if (prod.monthlyKg[m] <= 0) continue;

          if (total < targetMin && prod.monthlyKg[m] < fish.kgMax) {
            prod.monthlyKg[m] = Math.min(fish.kgMax, prod.monthlyKg[m] + 1);
            prod.totalKg += 1;
            break;
          } else if (total > targetMax && prod.monthlyKg[m] > fish.kgMin) {
            prod.monthlyKg[m] = Math.max(fish.kgMin, prod.monthlyKg[m] - 1);
            prod.totalKg -= 1;
            break;
          }
        }
      }
    }
  },

  generateFallback(table: FishData[], fishingMonths: number[]): FishProduction[] {
    return table.map((fish) => {
      const totalKg = Math.floor((fish.kgMin + fish.kgMax) / 2);
      const price = (fish.priceMin + fish.priceMax) / 2;
      const monthlyKg: Record<number, number> = {};

      for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        monthlyKg[monthIndex] = 0;
      }

      const divisor = fishingMonths.length || 1;
      fishingMonths.forEach((m) => (monthlyKg[m] = Math.round(totalKg / divisor)));
      return { id: fish.id, name: fish.name, totalKg, price, monthlyKg };
    });
  },

  logFinalProduction(bestResult: FishProduction[], gender: string) {
    const finalTotal = bestResult.reduce((s, p) => s + p.totalKg * p.price, 0);
    console.log(`Produção Gerada (${gender}): Total R$ ${finalTotal.toFixed(2)}`);
    bestResult.forEach((p) =>
      console.log(`  ${p.name}: ${p.totalKg}kg x R$${p.price.toFixed(2)} = R$${(p.totalKg * p.price).toFixed(2)}`)
    );
  }
};
