import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateMpaProduction } from "../src/modules/reap-mpa/generators/mpa-production";
import { getFishingMonthIndexes, getFishingMonthNumbers } from "../src/modules/reap-mpa/monthly-plan";
import { normalizeReapSettings } from "../src/modules/reap-mpa/reap-settings";
import type { FishProduction } from "../src/modules/reap-mpa/types";

const MONTHS = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

function usage(): never {
  console.error("Uso: npm run simulate:reap-mpa -- <arquivo.json> [--runs=5]");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  const runsArg = args.find((arg) => arg.startsWith("--runs="));
  const runs = runsArg ? Number(runsArg.split("=", 2)[1]) : 5;
  if (!file || !Number.isInteger(runs) || runs < 1) usage();
  return { file: resolve(file), runs };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function withRandom<T>(randomFn: () => number, callback: () => T): T {
  const originalRandom = Math.random;
  Math.random = randomFn;
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getSettingsFromExport(file: string): any {
  const exported = JSON.parse(readFileSync(file, "utf8"));
  const base = exported?.settings ?? exported;
  const activePreset = Array.isArray(base?.reapMpaPresets)
    ? base.reapMpaPresets.find((preset: any) => preset.id === base.activeReapMpaPresetId)
    : undefined;
  return normalizeReapSettings({ ...base, ...(activePreset?.settings ?? {}) });
}

function sortActiveSpecies(production: FishProduction[], monthIndex: number): FishProduction[] {
  return production
    .filter((fish) => (fish.monthlyKg[monthIndex] || 0) > 0)
    .sort((a, b) => (a.monthlyOrder?.[monthIndex] ?? Number.MAX_SAFE_INTEGER)
      - (b.monthlyOrder?.[monthIndex] ?? Number.MAX_SAFE_INTEGER));
}

function printRun(
  settings: any,
  gender: "MASCULINO" | "FEMININO",
  run: number,
  daysMap: Record<number, number>,
  production: FishProduction[],
): void {
  const months = getFishingMonthIndexes(settings);
  const monthNumbers = getFishingMonthNumbers(settings);
  const totals = months.map((month) => sortActiveSpecies(production, month)
    .reduce((sum, fish) => sum + fish.monthlyKg[month] * (fish.monthlyPrices?.[month] || 0), 0));
  const annual = totals.reduce((sum, total) => sum + total, 0);

  console.log(`\n===== ${gender} · sorteio ${run} =====`);

  months.forEach((month, index) => {
    const active = sortActiveSpecies(production, month);
    const species = active.map((fish) => {
      const price = fish.monthlyPrices?.[month] || 0;
      return `${fish.name}=${fish.monthlyKg[month]} kg @ ${formatMoney(price)}`;
    }).join("; ");
    console.log(`${MONTHS[month]} | ${daysMap[month]} dias trabalhados no mês | ${species} | Produção mensal: ${formatMoney(totals[index])}`);
  });
  console.log(`Total anual produzido: ${formatMoney(annual)}`);
}

function generateSample(
  settings: any,
  gender: "MASCULINO" | "FEMININO",
  seed: number,
): { daysMap: Record<number, number>; production?: FishProduction[]; error?: string } {
  const randomFn = mulberry32(seed);
  try {
    return withRandom(randomFn, () => generateMpaProduction(gender, settings, { randomFn }));
  } catch (error) {
    return {
      daysMap: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const { file, runs } = parseArgs();
const settings = getSettingsFromExport(file);
console.log(`Configuração: ${file}`);
console.log(`Meses produtivos: ${getFishingMonthNumbers(settings).join(", ")}`);
console.log(`Espécies por mês: ${settings.mpaSpeciesCount}`);

for (let run = 1; run <= runs; run += 1) {
  for (const gender of ["MASCULINO", "FEMININO"] as const) {
    const sample = generateSample(
      settings,
      gender,
      run * 1009 + (gender === "MASCULINO" ? 17 : 31),
    );
    if (sample.production) {
      printRun(settings, gender, run, sample.daysMap, sample.production);
    } else {
      console.log(`\n===== ${gender} · sorteio ${run} =====`);
      console.log(`Não houve valores para o REAP neste sorteio: ${sample.error}`);
    }
  }
}
