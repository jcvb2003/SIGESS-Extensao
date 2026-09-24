import { FishData, FishProduction, InfeasibleProductionTargetError, ProductionGeneratorOptions } from "../types";
import { getFishingMonthIndexes } from "../monthly-plan";
import { assertValidSpeciesPool, getValidSpeciesPool, MPA_MONEY_STEP, normalizeProductionRange } from "../reap-settings";

const PRICE_STEP = MPA_MONEY_STEP;
const MAX_PRICE_DELTA = 1.5;
const MAX_ATTEMPTS = 200;

type MonthlyCalendar = Record<number, FishData[]>;
type MonthlyProductionBounds = Record<number, { min: number; max: number }>;

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

function roundToPriceStep(value: number): number {
  return Math.round(value / PRICE_STEP) * PRICE_STEP;
}

function getPriceUnits(fish: FishData): { min: number; max: number } {
  return { min: Math.ceil(fish.priceMin / PRICE_STEP), max: Math.floor(fish.priceMax / PRICE_STEP) };
}

function getTargetRange(gender: string, settings?: any): { min: number; max: number } {
  const prefix = gender === "MASCULINO" ? "mpaMascProductionAnnual" : "mpaFemProductionAnnual";
  const legacyPrefix = gender === "MASCULINO" ? "mpaMascProd" : "mpaFemProd";
  return {
    min: Number(settings?.[`${prefix}Min`] ?? settings?.[`${legacyPrefix}Min`]) || 0,
    max: Number(settings?.[`${prefix}Max`] ?? settings?.[`${legacyPrefix}Max`]) || 0,
  };
}

function parseOptionalMoney(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const raw = String(value).trim().replace(/[^0-9,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replaceAll(".", "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function getMonthlyProductionRange(gender: string, settings?: any): { min?: number; max?: number } {
  const prefix = gender === "MASCULINO" ? "mpaMascProductionMonthly" : "mpaFemProductionMonthly";
  const min = parseOptionalMoney(settings?.[`${prefix}Min`]);
  const max = parseOptionalMoney(settings?.[`${prefix}Max`]);
  if (min !== undefined && max !== undefined && min > max) {
    throw new InfeasibleProductionTargetError("A produção mensal mínima não pode ser maior que a máxima.");
  }
  return { min, max };
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
       const randomValue = Math.max(0, Math.min(0.999999999, randomFn()));
       // Os dias inclinam a distribuição, mas não eliminam nenhum kg inteiro do intervalo válido.
       const biasExponent = 1.8 - intensity * 1.2;
       const randomLevel = Math.pow(randomValue, biasExponent);
       const kg = fish.kgMin + randomLevel * (fish.kgMax - fish.kgMin);
       monthlyKg[month] = Math.max(
         fish.kgMin,
         Math.min(fish.kgMax, Math.round(kg)),
       );
    }
    return { id: fish.id, name: fish.name, totalKg: 0, price: 0, monthlyKg, monthlyPrices, monthlyOrder };
  });
  return production;
}

function monthlyKgTotal(production: FishProduction[], month: number): number {
  return production.reduce((sum, fish) => sum + (fish.monthlyKg[month] || 0), 0);
}

function getKgOrder(months: number[], daysMap: Record<number, number>, production: FishProduction[]) {
  return months
    .map((month) => ({ month, days: daysMap[month] || 0, totalKg: monthlyKgTotal(production, month) }))
    .sort((a, b) => a.days - b.days || a.totalKg - b.totalKg || a.month - b.month);
}

function isMonotonicKgOrder(
  production: FishProduction[],
  months: number[],
  daysMap: Record<number, number>,
): boolean {
  const ordered = getKgOrder(months, daysMap, production);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (current.days > previous.days && current.totalKg <= previous.totalKg) return false;
  }
  return true;
}

function getMonthlyKgLimits(month: number, production: FishProduction[], pool: FishData[]): { min: number; max: number } {
  return production.reduce((limits, fish) => {
    if ((fish.monthlyKg[month] || 0) <= 0) return limits;
    const source = pool.find((item) => item.id === fish.id);
    if (!source) return limits;
    return { min: limits.min + source.kgMin, max: limits.max + source.kgMax };
  }, { min: 0, max: 0 });
}

function adjustMonthlyKgTotal(
  month: number,
  target: number,
  production: FishProduction[],
  pool: FishData[],
  randomFn: () => number,
): boolean {
  let currentTotal = monthlyKgTotal(production, month);
  while (currentTotal !== target) {
    const direction: 1 | -1 = target > currentTotal ? 1 : -1;
    const candidates = shuffle(
      production.filter((fish) => (fish.monthlyKg[month] || 0) > 0),
      randomFn,
    );
    let changed = false;

    for (const fish of candidates) {
      const source = pool.find((item) => item.id === fish.id);
      if (!source) continue;
      const current = fish.monthlyKg[month] || 0;
      const next = current + direction;
      if (next < source.kgMin || next > source.kgMax) continue;
      fish.monthlyKg[month] = next;
      currentTotal += direction;
      changed = true;
      break;
    }

    if (!changed) return false;
  }

  return true;
}

function enforceMonotonicKgOrder(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  daysMap: Record<number, number>,
  randomFn: () => number,
): boolean {
  const ordered = getKgOrder(months, daysMap, production);
  const lowerBounds: number[] = [];
  const upperBounds: number[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const limits = getMonthlyKgLimits(ordered[index].month, production, pool);
    const increment = index > 0 && ordered[index].days > ordered[index - 1].days ? 1 : 0;
    lowerBounds[index] = Math.max(limits.min, (lowerBounds[index - 1] ?? limits.min) + increment);
    upperBounds[index] = limits.max;
  }

  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    const increment = ordered[index + 1].days > ordered[index].days ? 1 : 0;
    upperBounds[index] = Math.min(upperBounds[index], upperBounds[index + 1] - increment);
  }

  if (lowerBounds.some((lower, index) => lower > upperBounds[index])) return false;

  let previousTarget: number | undefined;
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const increment = index > 0 && current.days > ordered[index - 1].days ? 1 : 0;
    const minimum = Math.max(lowerBounds[index], (previousTarget ?? lowerBounds[index]) + increment);
    const target = Math.max(minimum, Math.min(upperBounds[index], current.totalKg));
    if (target < minimum || !adjustMonthlyKgTotal(current.month, target, production, pool, randomFn)) return false;
    previousTarget = target;
  }

  return isMonotonicKgOrder(production, months, daysMap);
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

function calculateCalendarCapacity(
  calendar: MonthlyCalendar,
  pool: FishData[],
  months: number[],
): MonthlyProductionBounds {
  return Object.fromEntries(months.map((month) => {
    let min = 0;
    let max = 0;
    for (const fish of calendar[month] || []) {
      const source = pool.find((item) => item.id === fish.id);
      if (!source) continue;
      min += source.kgMin * source.priceMin;
      max += source.kgMax * source.priceMax;
    }
    return [month, { min, max }];
  }));
}

function calculateCapacityEnvelope(
  calendar: MonthlyCalendar,
  pool: FishData[],
  months: number[],
): { min: number; max: number } {
  const monthly = calculateCalendarCapacity(calendar, pool, months);
  return months.reduce(
    (total, month) => ({
      min: total.min + monthly[month].min,
      max: total.max + monthly[month].max,
    }),
    { min: 0, max: 0 },
  );
}

function applyConfiguredMonthlyBounds(
  capacity: MonthlyProductionBounds,
  configured: { min?: number; max?: number },
): MonthlyProductionBounds | null | undefined {
  if (configured.min === undefined && configured.max === undefined) return undefined;
  const bounds: MonthlyProductionBounds = {};
  for (const [monthKey, available] of Object.entries(capacity)) {
    const min = Math.max(available.min, configured.min ?? Number.NEGATIVE_INFINITY);
    const max = Math.min(available.max, configured.max ?? Number.POSITIVE_INFINITY);
    if (min > max) return null;
    bounds[Number(monthKey)] = { min, max };
  }
  return bounds;
}

function buildMonthlyTargets(
  target: number,
  months: number[],
  daysMap: Record<number, number>,
  monthlyBounds?: MonthlyProductionBounds,
): Record<number, number> {
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

  if (monthlyBounds) {
    for (const month of months) {
      targets[month] = Math.max(monthlyBounds[month].min, Math.min(monthlyBounds[month].max, targets[month]));
    }

    for (let pass = 0; pass < 100; pass += 1) {
      const residual = target - months.reduce((sum, month) => sum + targets[month], 0);
      if (Math.abs(residual) < 0.01) break;
      const candidates = months.filter((month) => residual > 0
        ? targets[month] < monthlyBounds[month].max
        : targets[month] > monthlyBounds[month].min);
      if (candidates.length === 0) break;
      const share = residual / candidates.length;
      for (const month of candidates) {
        targets[month] = Math.max(
          monthlyBounds[month].min,
          Math.min(monthlyBounds[month].max, targets[month] + share),
        );
      }
    }
  }
  return targets;
}

function isPriceTransitionSmooth(fish: FishProduction, month: number, nextPrice: number): boolean {
  const active = activeMonthsForFish(fish);
  const index = active.indexOf(month);
  const previous = index > 0 ? fish.monthlyPrices?.[active[index - 1]] : undefined;
  const next = index >= 0 && index < active.length - 1 ? fish.monthlyPrices?.[active[index + 1]] : undefined;
  if (previous !== undefined && Math.abs(nextPrice - previous) > MAX_PRICE_DELTA) return false;
  if (next !== undefined && Math.abs(next - nextPrice) > MAX_PRICE_DELTA) return false;
  return true;
}

function isNeighborhoodTotalValid(
  month: number,
  totalDelta: number,
  months: number[],
  production: FishProduction[],
  monthlyBounds?: MonthlyProductionBounds,
): boolean {
  const currentMonthTotal = production.reduce((sum, f) => sum + f.monthlyKg[month] * (f.monthlyPrices?.[month] || 0), 0);
  const newMonthTotal = currentMonthTotal + totalDelta;

  const currentBounds = monthlyBounds?.[month];
  if (currentBounds && (newMonthTotal < currentBounds.min || newMonthTotal > currentBounds.max)) return false;

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
  production: FishProduction[],
  monthlyBounds?: MonthlyProductionBounds,
): boolean {
  if (nextPrice < source.priceMin || nextPrice > source.priceMax) return false;
  if (!isPriceTransitionSmooth(fish, month, nextPrice)) return false;
  const currentPrice = fish.monthlyPrices?.[month] || 0;
  return isNeighborhoodTotalValid(month, fish.monthlyKg[month] * (nextPrice - currentPrice), months, production, monthlyBounds);
}

function canSetKg(
  fish: FishProduction,
  month: number,
  nextKg: number,
  source: FishData,
  months: number[],
  daysMap: Record<number, number>,
  production: FishProduction[],
  monthlyBounds?: MonthlyProductionBounds,
): boolean {
  if (!Number.isInteger(nextKg) || nextKg < source.kgMin || nextKg > source.kgMax) return false;
  const currentKg = fish.monthlyKg[month] || 0;
  const totalDelta = (nextKg - currentKg) * (fish.monthlyPrices?.[month] || 0);
  const isValidTotal = isNeighborhoodTotalValid(month, totalDelta, months, production, monthlyBounds);
  if (!isValidTotal) return false;
  fish.monthlyKg[month] = nextKg;
  const isValidOrder = isMonotonicKgOrder(production, months, daysMap);
  fish.monthlyKg[month] = currentKg;
  return isValidOrder;
}

type MonthlyStep = {
  fish: FishProduction;
  month: number;
  kind: "kg" | "price";
  value: number;
  improvement: number;
};

function findBestStepForMonth(
  month: number,
  delta: number,
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  daysMap: Record<number, number>,
  monthlyBounds?: MonthlyProductionBounds,
): MonthlyStep | undefined {
  const direction = delta > 0 ? 1 : -1;
  let best: MonthlyStep | undefined;

  for (const fish of production) {
    if (fish.monthlyKg[month] <= 0) continue;
    const source = pool.find((item) => item.id === fish.id);
    if (!source) continue;
    const current = fish.monthlyPrices?.[month] || 0;
    const nextPrice = roundToPriceStep(current + direction * PRICE_STEP);
    const currentDist = Math.abs(delta);
    if (canSetPrice(fish, month, nextPrice, source, months, production, monthlyBounds)) {
      const newDist = Math.abs(delta - fish.monthlyKg[month] * direction * PRICE_STEP);
      const improvement = currentDist - newDist;
      if (improvement > 0 && (!best || improvement > best.improvement)) {
        best = { fish, month, kind: "price", value: nextPrice, improvement };
      }
    }

    const currentKg = fish.monthlyKg[month] || 0;
    const nextKg = currentKg + direction;
    if (canSetKg(fish, month, nextKg, source, months, daysMap, production, monthlyBounds)) {
      const kgImprovement = currentDist - Math.abs(delta - direction * current);
      if (kgImprovement > 0 && (!best || kgImprovement > best.improvement)) {
        best = { fish, month, kind: "kg", value: nextKg, improvement: kgImprovement };
      }
    }
  }
  return best;
}

function adjustTowardMonthlyTargets(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  daysMap: Record<number, number>,
  targets: Record<number, number>,
  monthlyBounds?: MonthlyProductionBounds,
): void {
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const totals = monthlyTotals(production, months);
    let bestGlobal: MonthlyStep | undefined;

    for (const month of months) {
      const delta = targets[month] - totals[month];
      if (Math.abs(delta) < 0.25) continue;
       const best = findBestStepForMonth(month, delta, production, pool, months, daysMap, monthlyBounds);
      if (best && (!bestGlobal || best.improvement > bestGlobal.improvement)) {
        bestGlobal = best;
      }
    }
    if (!bestGlobal) break;
     if (bestGlobal.kind === "price") bestGlobal.fish.monthlyPrices![bestGlobal.month] = bestGlobal.value;
     else bestGlobal.fish.monthlyKg[bestGlobal.month] = bestGlobal.value;
  }
}

function tryStepAnnualPrice(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  direction: 1 | -1,
  monthlyBounds?: MonthlyProductionBounds,
): boolean {
  for (const month of months) {
    for (const fish of production) {
      if (fish.monthlyKg[month] <= 0) continue;
      const source = pool.find((item) => item.id === fish.id);
      if (!source) continue;
      const current = fish.monthlyPrices?.[month] || 0;
  const nextPrice = roundToPriceStep(current + direction * PRICE_STEP);
      if (!canSetPrice(fish, month, nextPrice, source, months, production, monthlyBounds)) continue;

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
  targetMax: number,
  monthlyBounds?: MonthlyProductionBounds,
): void {
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const totals = monthlyTotals(production, months);
    const annual = months.reduce((sum, m) => sum + totals[m], 0);
    if (annual >= targetMin && annual <= targetMax) break;

    const direction = annual < targetMin ? 1 : -1;
    const applied = tryStepAnnualPrice(production, pool, months, direction, monthlyBounds);
    if (!applied) break;
  }
}

function tryAdjustMonthPairPrice(
  monthToAdjust: number,
  direction: 1 | -1,
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  monthlyBounds?: MonthlyProductionBounds,
): boolean {
  for (const fish of production) {
    if (fish.monthlyKg[monthToAdjust] <= 0) continue;
    const source = pool.find((item) => item.id === fish.id);
    if (!source) continue;
  const nextPrice = roundToPriceStep((fish.monthlyPrices?.[monthToAdjust] || 0) + direction * PRICE_STEP);
    if (canSetPrice(fish, monthToAdjust, nextPrice, source, months, production, monthlyBounds)) {
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
  months: number[],
  monthlyBounds?: MonthlyProductionBounds,
): void {
  if (diff > 300) {
    const loweredCurr = tryAdjustMonthPairPrice(curr, -1, production, pool, months, monthlyBounds);
    if (!loweredCurr) tryAdjustMonthPairPrice(prev, 1, production, pool, months, monthlyBounds);
  } else {
    const loweredPrev = tryAdjustMonthPairPrice(prev, -1, production, pool, months, monthlyBounds);
    if (!loweredPrev) tryAdjustMonthPairPrice(curr, 1, production, pool, months, monthlyBounds);
  }
}

function smoothDiffPass(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  monthlyBounds?: MonthlyProductionBounds,
): boolean {
  let violationFound = false;
  for (let i = 1; i < months.length; i += 1) {
    const prev = months[i - 1];
    const curr = months[i];
    const totals = monthlyTotals(production, months);
    const diff = totals[curr] - totals[prev];
    if (Math.abs(diff) <= 300) continue;

    violationFound = true;
    smoothMonthPair(prev, curr, diff, production, pool, months, monthlyBounds);
  }
  return violationFound;
}

function smoothConsecutiveMonthDiffs(
  production: FishProduction[],
  pool: FishData[],
  months: number[],
  monthlyBounds?: MonthlyProductionBounds,
): void {
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const hasViolation = smoothDiffPass(production, pool, months, monthlyBounds);
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
  targetMax: number,
  monthlyBounds?: MonthlyProductionBounds,
): void {
  const targets = buildMonthlyTargets(target, months, daysMap, monthlyBounds);
  adjustTowardMonthlyTargets(production, pool, months, daysMap, targets, monthlyBounds);
  adjustTowardAnnualBounds(production, pool, months, targetMin, targetMax, monthlyBounds);
  smoothConsecutiveMonthDiffs(production, pool, months, monthlyBounds);
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
  targetMax: number,
  monthlyBounds?: MonthlyProductionBounds,
): boolean {
  const annual = months.reduce((sum, month) => sum + totals[month], 0);
  if (annual < targetMin || annual > targetMax) return false;
  if (monthlyBounds && months.some((month) => {
    const total = totals[month];
    const bounds = monthlyBounds[month];
    return total < bounds.min || total > bounds.max;
  })) return false;
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
      if (!Number.isInteger(kg) || kg < source.kgMin || kg > source.kgMax || price < source.priceMin || price > source.priceMax || Math.abs(price / PRICE_STEP - Math.round(price / PRICE_STEP)) > 1e-9) return false;
    }
    for (let index = 1; index < active.length; index += 1) {
      if (Math.abs((fish.monthlyPrices?.[active[index]] || 0) - (fish.monthlyPrices?.[active[index - 1]] || 0)) > MAX_PRICE_DELTA) return false;
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
  count: number,
  monthlyBounds?: MonthlyProductionBounds,
  daysMap?: Record<number, number>,
): boolean {
  const totals = monthlyTotals(production, months);
  if (!validateTotals(totals, months, targetMin, targetMax, monthlyBounds)) return false;
  if (!validateCalendarActiveCounts(production, calendar, months, count)) return false;
  if (daysMap && !isMonotonicKgOrder(production, months, daysMap)) return false;
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
    const configuredMonthlyRange = mode === "mpa"
      ? getMonthlyProductionRange(gender, settings)
      : {};
    let lastError = "Não foi possível gerar uma produção compatível com as configurações.";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const calendar = buildCalendar(pool, count, months, rotate, randomFn);
      const dayPrefix = gender === "MASCULINO" ? "mpaMascDays" : "mpaFemDays";
      const configuredDayMin = Number(settings?.[`${dayPrefix}Min`]);
      const configuredDayMax = Number(settings?.[`${dayPrefix}Max`]);
      const production = buildProduction(calendar, pool, months, daysMap, configuredDayMin, configuredDayMax, randomFn);
      if (!enforceMonotonicKgOrder(production, pool, months, daysMap, randomFn)) {
        lastError = "Não foi possível ordenar os quilos dos meses conforme os dias trabalhados.";
        continue;
      }
      assignInitialPrices(production, pool, randomFn);
      const capacity = calculateCapacityEnvelope(calendar, pool, months);
      const monthlyCapacity = calculateCalendarCapacity(calendar, pool, months);
      const monthlyBounds = applyConfiguredMonthlyBounds(monthlyCapacity, configuredMonthlyRange);
      if (monthlyBounds === null) {
        lastError = "A faixa de produção mensal configurada não é compatível com a capacidade de algum mês.";
        continue;
      }
      let range: [number, number];
      try {
        range = normalizeProductionRange(saved.min, saved.max, capacity.min, capacity.max, 300, PRICE_STEP);
      } catch (error: any) {
        lastError = error.message;
        continue;
      }
      const effectiveRange: [number, number] = monthlyBounds
        ? [
            Math.max(range[0], months.reduce((sum, month) => sum + monthlyBounds[month].min, 0)),
            Math.min(range[1], months.reduce((sum, month) => sum + monthlyBounds[month].max, 0)),
          ]
        : range;
      if (effectiveRange[0] > effectiveRange[1]) {
        lastError = `A faixa mensal não permite atingir a meta anual efetiva (${range[0]}–${range[1]}).`;
        continue;
      }
       const target = roundToPriceStep(effectiveRange[0] + randomFn() * (effectiveRange[1] - effectiveRange[0]));
      adjustPrices(production, pool, months, daysMap, target, effectiveRange[0], effectiveRange[1], monthlyBounds);
      finalizeAverages(production);
       if (validatePayload(production, pool, calendar, months, effectiveRange[0], effectiveRange[1], count, monthlyBounds, daysMap)) return production;
      lastError = `A meta anual efetiva (${effectiveRange[0]}–${effectiveRange[1]}) não convergiu com as restrições mensais.`;
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
       const price = roundToPriceStep((fish.priceMin + fish.priceMax) / 2);
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
