import { FishProduction, FishData } from "../types";
import { FISH_TABLE, MONTHS } from "../config";
import { FULL_PORTAL_SPECIES } from "../../../shared/data/species";

export const ProductionGenerator: any = {
  generate(
    daysMap: Record<number, number>,
    gender: "MASCULINO" | "FEMININO",
    settings?: any
  ): FishProduction[] {
    const currentFishTable = this.selectSpecies(settings);
    const { targetMin, targetMax } = this.getTargetRange(gender, settings);
    const totalDays = MONTHS.reduce((s, m) => s + (daysMap[m] || 16), 0);

    let bestResult = this.tryGenerateIdeal(currentFishTable, daysMap, totalDays, targetMin, targetMax);

    if (!bestResult) {
      console.warn("Não foi possível gerar produção ideal, usando fallback.");
      bestResult = this.generateFallback(currentFishTable);
    }

    this.logFinalProduction(bestResult, gender);
    return bestResult;
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

  getTargetRange(gender: string, settings?: any) {
    let targetMin = gender === "MASCULINO" ? 2850 : 2550;
    let targetMax = gender === "MASCULINO" ? 3075 : 2850;

    if (!settings) return { targetMin, targetMax };

    const prefix = gender === "MASCULINO" ? "mpaMascProd" : "mpaFemProd";
    if (settings[`${prefix}Min`]) targetMin = Number(settings[`${prefix}Min`]);
    if (settings[`${prefix}Max`]) targetMax = Number(settings[`${prefix}Max`]);

    return { targetMin, targetMax };
  },

  tryGenerateIdeal(table: FishData[], daysMap: Record<number, number>, totalDays: number, min: number, max: number) {
    let attempts = 0;
    while (attempts < 300) {
      const result = this.generateInitialProduction(table, daysMap, totalDays);
      const totalValue = result.reduce((s: number, p: FishProduction) => s + p.totalKg * p.price, 0);

      if (totalValue >= min && totalValue <= max) return result;

      this.adjustPricesToTarget(result, table, totalValue, min, max);
      
      const adjustedTotal = result.reduce((s: number, p: FishProduction) => s + p.totalKg * p.price, 0);
      if (adjustedTotal >= min && adjustedTotal <= max) return result;

      attempts++;
    }
    return null;
  },

  generateInitialProduction(table: FishData[], daysMap: Record<number, number>, totalDays: number): FishProduction[] {
    const result: FishProduction[] = table.map(fish => ({
      id: fish.id,
      name: fish.name,
      totalKg: Math.floor(Math.random() * (fish.kgMax - fish.kgMin + 1)) + fish.kgMin,
      price: 0,
      monthlyKg: {},
    }));

    result.sort((a, b) => b.totalKg - a.totalKg);
    this.assignPrices(result, table);
    this.distributeMonthlyKg(result, daysMap, totalDays);
    
    return result;
  },

  assignPrices(productions: FishProduction[], table: FishData[]) {
    productions.forEach((prod, i) => {
      const fish = table.find((f) => f.name === prod.name);
      if (!fish) return;
      
      const range = fish.priceMax - fish.priceMin;
      const factor = productions.length > 1 ? i / (productions.length - 1) : 0.5;
      const price = fish.priceMin + (range * factor * 0.7) + (Math.random() * range * 0.3);
      prod.price = Math.round(price);
    });
  },

  distributeMonthlyKg(productions: FishProduction[], daysMap: Record<number, number>, totalDays: number) {
    for (const prod of productions) {
      let remaining = prod.totalKg;
      const monthlyRaw: Record<number, number> = {};
      
      for (const m of MONTHS) {
        const daysProportion = (daysMap[m] || 16) / totalDays;
        const kgForMonth = Math.round(prod.totalKg * daysProportion);
        monthlyRaw[m] = kgForMonth;
        remaining -= kgForMonth;
      }
      
      const lastMonth = MONTHS.at(-1);
      if (lastMonth !== undefined) {
          monthlyRaw[lastMonth] += remaining;
      }
      prod.monthlyKg = monthlyRaw;
    }
  },

  adjustPricesToTarget(productions: FishProduction[], table: FishData[], totalValue: number, min: number, max: number) {
    const isUnder = totalValue < min;
    for (const prod of productions) {
      const fish = table.find((f) => f.name === prod.name);
      if (!fish) continue;

      if (isUnder) {
        prod.price = Math.min(fish.priceMax, prod.price + 0.5);
      } else if (totalValue > max) {
        prod.price = Math.max(fish.priceMin, prod.price - 0.5);
      }
    }
  },

  generateFallback(table: FishData[]): FishProduction[] {
    return table.map((fish) => {
      const totalKg = Math.floor((fish.kgMin + fish.kgMax) / 2);
      const price = (fish.priceMin + fish.priceMax) / 2;
      const monthlyKg: Record<number, number> = {};
      MONTHS.forEach((m) => (monthlyKg[m] = Math.round(totalKg / 8)));
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
