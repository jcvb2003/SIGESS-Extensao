import { FishData, FishProduction, InfeasibleProductionTargetError, ProductionGeneratorOptions } from "../types";
import { getFishingMonthIndexes } from "../monthly-plan";
import { assertValidSpeciesPool, getValidSpeciesPool, normalizeProductionRange } from "../reap-settings";

const PRICE_STEP = 0.5;
const MAX_ATTEMPTS = 50;

type MonthlyCalendar = Record<number, FishData[]>;

function randomInt(min: number, max: number, randomFn: () => number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.max(0, Math.min(0.999999999, randomFn())) * (max - min + 1));
}

function shuffle<T>(items: T[], randomFn: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i, randomFn);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function selectUnique(pool: FishData[], count: number, randomFn: () => number): FishData[] {
  return shuffle(pool, randomFn).slice(0, count);
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function getPriceUnits(fish: FishData): { min: number; max: number } {
  return { min: Math.ceil(fish.priceMin * 2), max: Math.floor(fish.priceMax * 2) };
}

function getTargetRange(gender: string, settings?: any): { min: number; max: number } {
  const prefix = gender === "MASCULINO" ? "mpaMascProductionAnnual" : "mpaFemProductionAnnual";
  const legacyPrefix = gender === "MASCULINO" ? "mpaMascProd" : "mpaFemProd";
  return {
    min: Number(settings?.[`${prefix}Min`] ?? settings?.[`${legacyPrefix}Min`]) || 0,
    max: Number(settings?.[`${prefix}Max`] ?? settings?.[`${legacyPrefix}Max`]) || 0,
  };
}

function clampStep(val: number, ref: number, maxStep: number): number {
  if (val - ref > maxStep) return ref + maxStep;
  if (ref - val > maxStep) return ref - maxStep;
  return val;
}

function smoothPass(arr: number[], maxStep: number): void {
  for (let i = 1; i < arr.length; i += 1) {
    arr[i] = clampStep(arr[i], arr[i - 1], maxStep);
  }
  for (let i = arr.length - 2; i >= 0; i -= 1) {
    arr[i] = clampStep(arr[i], arr[i + 1], maxStep);
  }
}

function getDayIntensities(
  fishingMonths: number[],
  daysMap: Record<number, number>,
  configuredMin?: number,
  configuredMax?: number,
): Record<number, number> {
  const values = fishingMonths.map((item) => daysMap[item] || 0);
  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const min = Number.isFinite(configuredMin) ? configuredMin! : observedMin;
  const max = Number.isFinite(configuredMax) ? configuredMax! : observedMax;
  const intensityList = fishingMonths.map((m) =>
    max === min ? 0.5 : Math.max(0, Math.min(1, ((daysMap[m] || 0) - min) / (max - min)))
  );

  const smoothed: Record<number, number> = {};
  fishingMonths.forEach((m, idx) => {
    smoothed[m] = intensityList[idx];
  });
  return smoothed;
}

function buildCalendar(pool: FishData[], count: number, months: number[], rotate: boolean, randomFn: () => number): MonthlyCalendar {
  const calendar: MonthlyCalendar = {};
  const fixed = selectUnique(pool, count, randomFn);
  for (const month of months) calendar[month] = rotate ? selectUnique(pool, count, randomFn) : [...fixed];
  return calendar;
}

function buildProduction(
  calendar: MonthlyCalendar,
  pool: FishData[],
  months: number[],
  daysMap: Record<number, number>,
  configuredDayMin?: number,
  configuredDayMax?: number,
  randomFn: () => number = Math.random,
): FishProduction[] {
  const usedIds = new Set(Object.values(calendar).flat().map((fish) => fish.id));
  const intensities = getDayIntensities(months, daysMap, configuredDayMin, configuredDayMax);
  const production = pool.filter((fish) => usedIds.has(fish.id)).map((fish) => {
    const monthlyKg: Record<number, number> = {};
    const monthlyPrices: Record<number, number> = {};
    const monthlyOrder: Record<number, number> = {};
    for (let month = 0; month < 12; month += 1) {
      monthlyKg[month] = 0;
      monthlyPrices[month] = 0;
    }
    for (const month of months) {
      const order = calendar[month].findIndex((item) => item.id === fish.id);
      if (order < 0) continue;
      monthlyOrder[month] = order;
      const intensity = intensities[month] ?? 0.5;
       const baseKg = fish.kgMin + intensity * (fish.kgMax - fish.kgMin);
       const jitterAmplitude = Math.min(0.4, (fish.kgMax - fish.kgMin) * 0.1);
       const jitter = (Math.max(0, Math.min(0.999999999, randomFn())) * 2 - 1) * jitterAmplitude;
       monthlyKg[month] = Math.max(
         fish.kgMin,
         Math.min(fish.kgMax, Math.round(baseKg + jitter)),
       );
    }
    return { id: fish.id, name: fish.name, totalKg: 0, price: 0, monthlyKg, monthlyPrices, monthlyOrder };
  });
  return production;
}

function activeMonthsForFish(fish: FishProduction): number[] {
  return Object.keys(fish.monthlyKg).map(Number).filter((month) => fish.monthlyKg[month] > 0).sort((a, b) => a - b);
}

function assignInitialPrices(production: FishProduction[], pool: FishData[], randomFn: () => number): void {
  for (const fish of production) {
    const source = pool.find((item) => item.id === fish.id);
    if (!source) continue;
    const bounds = getPriceUnits(source);
    const baseUnits = randomInt(bounds.min, bounds.max, randomFn);
    let previousUnits = baseUnits;
    for (const month of activeMonthsForFish(fish)) {
      const min = Math.max(bounds.min, previousUnits - 1);
      const max = Math.min(bounds.max, previousUnits + 1);
      const units = randomInt(min, max, randomFn);
      fish.monthlyPrices![month] = units * PRICE_STEP;
      previousUnits = units;
    }
  }
}

function monthlyTotals(production: FishProduction[], months: number[]): Record<number, number> {
  return Object.fromEntries(months.map((month) => [month, production.reduce((sum, fish) => sum + fish.monthlyKg[month] * (fish.monthlyPrices?.[month] || 0), 0)]));
}

function buildMonthlyTargets(target: number, months: number[], daysMap: Record<number, number>): Record<number, number> {
  const totalDays = months.reduce((sum, month) => sum + (daysMap[month] || 0), 0);
  const targets: Record<number, number> = {};
  for (const month of months) {
    targets[month] = totalDays > 0 ? target * (daysMap[month] || 0) / totalDays : target / Math.max(1, months.length);
  }

  const targetList = months.map((m) => targets[m]);
  for (let pass = 0; pass < 5; pass += 1) {
    smoothPass(targetList, 240);
  }
  months.forEach((m, idx) => {
    targets[m] = targetList[idx];
  });

  const sumTargets = months.reduce((sum, m) => sum + targets[m], 0);
  if (sumTargets > 0) {
    const factor = target / sumTargets;
    for (const m of months) targets[m] *= factor;
  }
  return targets;
}

function isPriceTransitionSmooth(fish: FishProduction, month: number, nextPrice: number): boolean {
  const active = activeMonthsForFish(fish);
  const index = active.indexOf(month);
  const previous = index > 0 ? fish.monthlyPrices?.[active[index - 1]] : undefined;
  const next = index >= 0 && index < active.length - 1 ? fish.monthlyPrices?.[active[index + 1]] : undefined;
  if (previous !== undefined && Math.abs(nextPrice - previous) > 1.5) return false;
  if (next !== undefined && Math.abs(next - nextPrice) > 1.5) return false;
  return true;
}

function isNeighborhoodTotalValid(
  month: number,
  priceDelta: number,
  fishKg: number,
  months: number[],
  production: FishProduction[]
): boolean {
  const currentMonthTotal = production.reduce((sum, f) => sum + f.monthlyKg[month] * (f.monthlyPrices?.[month] || 0), 0);
  const newMonthTotal = currentMonthTotal + fishKg * priceDelta;

  const mIdx = months.indexOf(month);
  if (mIdx > 0) {
    const prevMonth = months[mIdx - 1];
    const prevTotal = production.reduce((sum, f) => sum + f.monthlyKg[prevMonth] * (f.monthlyPrices?.[prevMonth] || 0), 0);
    if (Math.abs(newMonthTotal - prevTotal) > 300) return false;
  }
  if (mIdx < months.length - 1) {
    const nextMonth = months[mIdx + 1];
    const nextTotal = production.reduce((sum, f) => sum + f.monthlyKg[nextMonth] * (f.monthlyPrices?.[nextMonth] || 0), 0);
    if (Math.abs(nextTotal - newMonthTotal) > 300) return false;
  }
  return true;
}

function canSetPrice(
  fish: FishProduction,
  month: number,
  nextPrice: number,
  source: FishData,
  months: number[],
  production: FishProduction[]
): boolean {
  if (nextPrice < source.priceMin || nextPrice > source.priceMax) return false;
  if (!isPriceTransitionSmooth(fish, month, nextPrice)) return false;
  const currentPrice = fish.monthlyPrices?.[month] || 0;
  return isNeighborhoodTotalValid(month, nextPrice - currentPrice, fish.monthlyKg[month], months, production);
}

function findBestPriceStepForMonth(
  month: number,
  delta: number,
  production: FishProduction[],
  pool: FishData[],
  months: number[]
): { fish: FishProduction; month: number; price: number; improvement: number } | undefined {
  const direction = delta > 0 ? 1 : -1;
  let best: { fish: FishProduction; month: number; price: number; improvement: number } | undefined;

  for (const fish of production) {
    if (fish.monthlyKg[month] <= 0) continue;
    const source = pool.find((item) => item.id === fish.id);
    if (!source) continue;
    const current = fish.monthlyPrices?.[month] || 0;
    const nextPrice = roundToHalf(current + direction * PRICE_STEP);
    if (!canSetPrice(fish, month, nextPrice, source, months, production)) continue;

    const currentDist = Math.abs(delta);
    const newDist = Math.abs(delta - fish.monthlyKg[month] * direction * PRICE_STEP);
    const improvement = currentDist - newDist;
    if (improvement > 0 && (!best || improvement > best.improvement)) {
      best = { fish, month, price: nextPrice, improvement };
    }
  }
  return best;
}

function adjustTowardMonthlyTargets(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  targets: Record<number, number>
): void {
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const totals = monthlyTotals(production, months);
    let bestGlobal: { fish: FishProduction; month: number; price: number; improvement: number } | undefined;

    for (const month of months) {
      const delta = targets[month] - totals[month];
      if (Math.abs(delta) < 0.25) continue;
      const best = findBestPriceStepForMonth(month, delta, production, pool, months);
      if (best && (!bestGlobal || best.improvement > bestGlobal.improvement)) {
        bestGlobal = best;
      }
    }
    if (!bestGlobal) break;
    bestGlobal.fish.monthlyPrices![bestGlobal.month] = bestGlobal.price;
  }
}

function tryStepAnnualPrice(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  direction: 1 | -1
): boolean {
  for (const month of months) {
    for (const fish of production) {
      if (fish.monthlyKg[month] <= 0) continue;
      const source = pool.find((item) => item.id === fish.id);
      if (!source) continue;
      const current = fish.monthlyPrices?.[month] || 0;
      const nextPrice = roundToHalf(current + direction * PRICE_STEP);
      if (!canSetPrice(fish, month, nextPrice, source, months, production)) continue;

      fish.monthlyPrices![month] = nextPrice;
      return true;
    }
  }
  return false;
}

function adjustTowardAnnualBounds(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  targetMin: number,
  targetMax: number
): void {
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const totals = monthlyTotals(production, months);
    const annual = months.reduce((sum, m) => sum + totals[m], 0);
    if (annual >= targetMin && annual <= targetMax) break;

    const direction = annual < targetMin ? 1 : -1;
    const applied = tryStepAnnualPrice(production, pool, months, direction);
    if (!applied) break;
  }
}

function tryAdjustMonthPairPrice(
  monthToAdjust: number,
  direction: 1 | -1,
  production: FishProduction[],
  pool: FishData[],
  months: number[]
): boolean {
  for (const fish of production) {
    if (fish.monthlyKg[monthToAdjust] <= 0) continue;
    const source = pool.find((item) => item.id === fish.id);
    if (!source) continue;
    const nextPrice = roundToHalf((fish.monthlyPrices?.[monthToAdjust] || 0) + direction * PRICE_STEP);
    if (canSetPrice(fish, monthToAdjust, nextPrice, source, months, production)) {
      fish.monthlyPrices![monthToAdjust] = nextPrice;
      return true;
    }
  }
  return false;
}

function smoothMonthPair(
  prev: number,
  curr: number,
  diff: number,
  production: FishProduction[],
  pool: FishData[],
  months: number[]
): void {
  if (diff > 300) {
    const loweredCurr = tryAdjustMonthPairPrice(curr, -1, production, pool, months);
    if (!loweredCurr) tryAdjustMonthPairPrice(prev, 1, production, pool, months);
  } else {
    const loweredPrev = tryAdjustMonthPairPrice(prev, -1, production, pool, months);
    if (!loweredPrev) tryAdjustMonthPairPrice(curr, 1, production, pool, months);
  }
}

function smoothDiffPass(
  production: FishProduction[],
  pool: FishData[],
  months: number[]
): boolean {
  let violationFound = false;
  for (let i = 1; i < months.length; i += 1) {
    const prev = months[i - 1];
    const curr = months[i];
    const totals = monthlyTotals(production, months);
    const diff = totals[curr] - totals[prev];
    if (Math.abs(diff) <= 300) continue;

    violationFound = true;
    smoothMonthPair(prev, curr, diff, production, pool, months);
  }
  return violationFound;
}

function smoothConsecutiveMonthDiffs(
  production: FishProduction[],
  pool: FishData[],
  months: number[]
): void {
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const hasViolation = smoothDiffPass(production, pool, months);
    if (!hasViolation) break;
  }
}

function adjustPrices(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  daysMap: Record<number, number>,
  target: number,
  targetMin: number,
  targetMax: number
): void {
  const targets = buildMonthlyTargets(target, months, daysMap);
  adjustTowardMonthlyTargets(production, pool, months, targets);
  adjustTowardAnnualBounds(production, pool, months, targetMin, targetMax);
  smoothConsecutiveMonthDiffs(production, pool, months);
}

function finalizeAverages(production: FishProduction[]): void {
  for (const fish of production) {
    let totalKg = 0;
    let totalValue = 0;
    for (const month of Object.keys(fish.monthlyKg).map(Number)) {
      const kg = fish.monthlyKg[month] || 0;
      totalKg += kg;
      totalValue += kg * (fish.monthlyPrices?.[month] || 0);
    }
    fish.totalKg = totalKg;
    fish.price = totalKg > 0 ? totalValue / totalKg : 0;
  }
}

function validateTotals(
  totals: Record<number, number>,
  months: number[],
  targetMin: number,
  targetMax: number
): boolean {
  const annual = months.reduce((sum, month) => sum + totals[month], 0);
  if (annual < targetMin || annual > targetMax) return false;
  for (let index = 1; index < months.length; index += 1) {
    if (Math.abs(totals[months[index]] - totals[months[index - 1]]) > 300) return false;
  }
  return true;
}

function validateCalendarActiveCounts(
  production: FishProduction[],
  calendar: MonthlyCalendar,
  months: number[],
  count: number
): boolean {
  for (const month of months) {
    const active = production.filter((fish) => fish.monthlyKg[month] > 0);
    if (active.length !== count || new Set(active.map((fish) => fish.id)).size !== count) return false;
    if (active.some((fish) => !calendar[month].some((item) => item.id === fish.id))) return false;
  }
  return true;
}

function validateFishProperties(production: FishProduction[], pool: FishData[]): boolean {
  for (const fish of production) {
    const source = pool.find((item) => item.id === fish.id);
    if (!source) return false;
    const active = activeMonthsForFish(fish);
    for (const month of active) {
      const kg = fish.monthlyKg[month];
      const price = fish.monthlyPrices?.[month] || 0;
      if (kg < source.kgMin || kg > source.kgMax || price < source.priceMin || price > source.priceMax || Math.round(price * 2) !== price * 2) return false;
    }
    for (let index = 1; index < active.length; index += 1) {
      if (Math.abs((fish.monthlyPrices?.[active[index]] || 0) - (fish.monthlyPrices?.[active[index - 1]] || 0)) > 1.5) return false;
    }
  }
  return true;
}

function validatePayload(
  production: FishProduction[],
  pool: FishData[],
  calendar: MonthlyCalendar,
  months: number[],
  targetMin: number,
  targetMax: number,
  count: number
): boolean {
  const totals = monthlyTotals(production, months);
  if (!validateTotals(totals, months, targetMin, targetMax)) return false;
  if (!validateCalendarActiveCounts(production, calendar, months, count)) return false;
  return validateFishProperties(production, pool);
}

export const ProductionGenerator = {
  generate(daysMap: Record<number, number>, gender: "MASCULINO" | "FEMININO", settings?: any, options: ProductionGeneratorOptions = {}): FishProduction[] {
    const mode = options.mode || "mpa";
    const randomFn = options.randomFn || Math.random;
    const months = getFishingMonthIndexes(settings || {});
    const pool = getValidSpeciesPool(settings?.mpaSpecies);
    const count = Number(settings?.mpaSpeciesCount);
    assertValidSpeciesPool(pool, count);
    if (months.length === 0) return this.generateFallback(pool.slice(0, count), months);

    const rotate = mode === "mpa" && Boolean(settings?.mpaRotateMonthlySpecies);
    const saved = getTargetRange(gender, settings);
    let lastError = "Não foi possível gerar uma produção compatível com as configurações.";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const calendar = buildCalendar(pool, count, months, rotate, randomFn);
      const dayPrefix = gender === "MASCULINO" ? "mpaMascDays" : "mpaFemDays";
      const configuredDayMin = Number(settings?.[`${dayPrefix}Min`]);
      const configuredDayMax = Number(settings?.[`${dayPrefix}Max`]);
      const production = buildProduction(calendar, pool, months, daysMap, configuredDayMin, configuredDayMax, randomFn);
      assignInitialPrices(production, pool, randomFn);
      const capacity = this.calculateCapacity(production, pool, months);
      let range: [number, number];
      try {
        range = normalizeProductionRange(saved.min, saved.max, capacity.min, capacity.max, 300);
      } catch (error: any) {
        lastError = error.message;
        continue;
      }
      const target = roundToHalf(range[0] + randomFn() * (range[1] - range[0]));
      adjustPrices(production, pool, months, daysMap, target, range[0], range[1]);
      finalizeAverages(production);
      if (validatePayload(production, pool, calendar, months, range[0], range[1], count)) return production;
      lastError = `A meta anual efetiva (${range[0]}–${range[1]}) não convergiu com as restrições mensais.`;
    }
    throw new InfeasibleProductionTargetError(lastError);
  },

  calculateCapacity(production: FishProduction[], pool: FishData[], months: number[]) {
    let min = 0;
    let max = 0;
    for (const month of months) {
      for (const fish of production) {
        const kg = fish.monthlyKg[month] || 0;
        const source = pool.find((item) => item.id === fish.id);
        if (!source || kg <= 0) continue;
        min += kg * source.priceMin;
        max += kg * source.priceMax;
      }
    }
    return { min, max };
  },

  generateFallback(pool: FishData[], months: number[]): FishProduction[] {
    return pool.map((fish) => {
      const price = roundToHalf((fish.priceMin + fish.priceMax) / 2);
      const monthlyKg: Record<number, number> = {};
      const monthlyPrices: Record<number, number> = {};
      for (let month = 0; month < 12; month += 1) {
        monthlyKg[month] = 0;
        monthlyPrices[month] = 0;
      }
      const kg = Math.round((fish.kgMin + fish.kgMax) / 2);
      for (const month of months) {
        monthlyKg[month] = kg;
        monthlyPrices[month] = price;
      }
      return { id: fish.id, name: fish.name, totalKg: kg * months.length, price, monthlyKg, monthlyPrices };
    });
  },

  logFinalProduction(production: FishProduction[], gender: string) {
    const total = production.reduce((sum, fish) => sum + fish.totalKg * fish.price, 0);
    console.log(`Produção Gerada (${gender}): Total R$ ${total.toFixed(2)}`);
  },
};
