import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseReapMpaImportPayload } from "../../src/modules/reap-mpa/reap-io";
import {
  calculateSafeProductionEnvelope,
  normalizeMonthlyProductionRange,
  normalizeProductionRange,
  parseMoneyValue,
} from "../../src/modules/reap-mpa/reap-settings";
import { generateMpaProduction } from "../../src/modules/reap-mpa/generators/mpa-production";
import { AppSettings, FishProduction } from "../../src/shared/types";

function createPrng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function validateProductionProperties(
  production: FishProduction[],
  daysMap: Record<number, number>,
  productiveMonths: number[],
  expectedSpeciesCount: number,
  monthlyMin: number,
  monthlyMax: number,
  annualMin: number,
  annualMax: number,
  minDays: number,
  maxDays: number,
) {
  expect(production.length).toBeGreaterThan(0);

  let calculatedAnnualTotal = 0;
  const monthTotals: Record<number, number> = {};

  // 1. Validações mês a mês
  for (const monthIdx of productiveMonths) {
    const activeFish = production.filter((f) => (f.monthlyKg[monthIdx] || 0) > 0);
    expect(activeFish.length).toBe(expectedSpeciesCount);

    const days = daysMap[monthIdx];
    expect(days).toBeGreaterThanOrEqual(minDays);
    expect(days).toBeLessThanOrEqual(maxDays);

    const totalKg = activeFish.reduce((sum, f) => sum + (f.monthlyKg[monthIdx] || 0), 0);
    expect(totalKg).toBeGreaterThan(0);

    const monthValue = activeFish.reduce(
      (sum, f) => sum + (f.monthlyKg[monthIdx] || 0) * (f.monthlyPrices?.[monthIdx] || 0),
      0,
    );
    monthTotals[monthIdx] = monthValue;
    calculatedAnnualTotal += monthValue;

    // Respeito à faixa mensal configurada (com tolerância de ponto flutuante de 0.01)
    expect(monthValue).toBeGreaterThanOrEqual(monthlyMin - 0.01);
    expect(monthValue).toBeLessThanOrEqual(monthlyMax + 0.01);
  }

  // 2. Respeito à faixa anual
  expect(calculatedAnnualTotal).toBeGreaterThanOrEqual(annualMin - 0.01);
  expect(calculatedAnnualTotal).toBeLessThanOrEqual(annualMax + 0.01);

  // 3. Diferença de até R$ 300 entre meses consecutivos
  for (let i = 1; i < productiveMonths.length; i++) {
    const prevMonth = productiveMonths[i - 1];
    const currMonth = productiveMonths[i];
    const diff = Math.abs(monthTotals[currMonth] - monthTotals[prevMonth]);
    expect(diff).toBeLessThanOrEqual(300.01);
  }

  // 4. Passo de preço (múltiplo de 0,25) e variação máxima entre meses ativos (<= 3.00)
  for (const fish of production) {
    const activeMonths = productiveMonths.filter((m) => (fish.monthlyKg[m] || 0) > 0);
    for (const m of activeMonths) {
      const price = fish.monthlyPrices?.[m] || 0;
      const stepRemainder = Math.abs(price / 0.25 - Math.round(price / 0.25));
      expect(stepRemainder).toBeLessThan(1e-5);
    }

    for (let i = 1; i < activeMonths.length; i++) {
      const pPrev = fish.monthlyPrices?.[activeMonths[i - 1]] || 0;
      const pCurr = fish.monthlyPrices?.[activeMonths[i]] || 0;
      expect(Math.abs(pCurr - pPrev)).toBeLessThanOrEqual(3.01);
    }
  }

  // 5. Monotonicidade estrita: dias maiores => quilos estritamente maiores
  for (let i = 0; i < productiveMonths.length; i++) {
    for (let j = i + 1; j < productiveMonths.length; j++) {
      const mA = productiveMonths[i];
      const mB = productiveMonths[j];
      const daysA = daysMap[mA];
      const daysB = daysMap[mB];
      const kgA = production.reduce((sum, f) => sum + (f.monthlyKg[mA] || 0), 0);
      const kgB = production.reduce((sum, f) => sum + (f.monthlyKg[mB] || 0), 0);

      if (daysA < daysB) {
        expect(kgA).toBeLessThan(kgB);
      } else if (daysA > daysB) {
        expect(kgA).toBeGreaterThan(kgB);
      }
    }
  }
}

describe("REAP MPA End-to-End Tests with Sanitized Fixtures", () => {
  const fixture1002Path = path.resolve(__dirname, "../fixtures/reap-config-2026-10-02.fixture.json");
  const fixture0924Path = path.resolve(__dirname, "../fixtures/reap-config-2026-09-24.fixture.json");

  it("fixture 02/10 (5 defeso, 7 espécies): sanitizes, normalizes, stabilizes render cycle, and executes E2E", () => {
    expect(fs.existsSync(fixture1002Path)).toBe(true);
    const parsedJson = JSON.parse(fs.readFileSync(fixture1002Path, "utf-8"));

    const localProfile: AppSettings = {
      cpf: "11122233344",
      senha: "SENHA_LOCAL_SEGURA",
      pessoaData: {
        cpf: "11122233344",
        nome: "Operador Local",
      },
    };

    // 1. Sanitização na importação
    const importResult = parseReapMpaImportPayload(parsedJson, localProfile);
    expect(importResult.normalizedSettings.cpf).toBe("11122233344");
    expect(importResult.normalizedSettings.senha).toBe("SENHA_LOCAL_SEGURA");
    expect(importResult.normalizedSettings.pessoaData?.nome).toBe("Operador Local");

    const presetId = "4a59f332-06d3-42e4-9d8c-c9e7954d5e76";
    expect(importResult.activePresetId).toBe(presetId);
    expect(importResult.pdfCaches[presetId]?.filename).toBe("PT 048.pdf");
    expect(importResult.pdfCaches[presetId]?.b64.startsWith("JVBERi0xLjUK")).toBe(true);

    const activeSettings = importResult.normalizedSettings;

    // 2. Cálculo do Envelope da Bússola
    const femEnvelope = calculateSafeProductionEnvelope(activeSettings, "FEMININO");
    expect(femEnvelope.productiveMonths).toBe(7);
    expect(femEnvelope.safeMonthlyMin).toBe(825);
    expect(femEnvelope.safeMonthlyMax).toBe(1500);
    expect(femEnvelope.min).toBe(5775);
    expect(femEnvelope.max).toBe(6195);

    // 3. Normalização das faixas mensais e anuais
    const femMonthly = normalizeMonthlyProductionRange(
      activeSettings.mpaFemProductionMonthlyMin,
      activeSettings.mpaFemProductionMonthlyMax,
      femEnvelope.safeMonthlyMin,
      femEnvelope.safeMonthlyMax,
    );
    expect(femMonthly).toEqual([825, 885]);

    const [femAnnualMin, femAnnualMax] = normalizeProductionRange(
      activeSettings.mpaFemProductionAnnualMin,
      activeSettings.mpaFemProductionAnnualMax,
      femEnvelope.min,
      femEnvelope.max,
      300,
    );
    expect(femAnnualMin).toBe(5775);
    expect(femAnnualMax).toBe(6075);

    const mascEnvelope = calculateSafeProductionEnvelope(activeSettings, "MASCULINO");
    const mascMonthly = normalizeMonthlyProductionRange(
      activeSettings.mpaMascProductionMonthlyMin,
      activeSettings.mpaMascProductionMonthlyMax,
      mascEnvelope.safeMonthlyMin,
      mascEnvelope.safeMonthlyMax,
    );
    expect(mascMonthly).toEqual([825, 885]);

    const [mascAnnualMin, mascAnnualMax] = normalizeProductionRange(
      activeSettings.mpaMascProductionAnnualMin,
      activeSettings.mpaMascProductionAnnualMax,
      mascEnvelope.min,
      mascEnvelope.max,
      300,
    );
    expect(mascAnnualMin).toBe(5775);
    expect(mascAnnualMax).toBe(6075);

    // 4. Teste de Estabilidade do Ciclo de Renderização da Interface (Simulação do useEffect)
    // Render 1: detecta valores desajustados e gera patch
    const patchRender1: Partial<AppSettings> = {};
    if (activeSettings.mpaFemProductionAnnualMin !== femAnnualMin) patchRender1.mpaFemProductionAnnualMin = femAnnualMin;
    if (activeSettings.mpaFemProductionAnnualMax !== femAnnualMax) patchRender1.mpaFemProductionAnnualMax = femAnnualMax;
    if (parseMoneyValue(activeSettings.mpaFemProductionMonthlyMin) !== femMonthly![0]) {
      patchRender1.mpaFemProductionMonthlyMin = String(femMonthly![0]);
    }
    if (parseMoneyValue(activeSettings.mpaFemProductionMonthlyMax) !== femMonthly![1]) {
      patchRender1.mpaFemProductionMonthlyMax = String(femMonthly![1]);
    }

    expect(patchRender1.mpaFemProductionAnnualMin).toBe(5775);
    expect(patchRender1.mpaFemProductionAnnualMax).toBe(6075);
    expect(patchRender1.mpaFemProductionMonthlyMin).toBe("825");
    expect(patchRender1.mpaFemProductionMonthlyMax).toBe("885");

    // Render 2 com estado atualizado: NÃO deve gerar patch e NÃO deve expandir o anual para 6195
    const stateRender2: AppSettings = { ...activeSettings, ...patchRender1 };
    const [femAnnMinR2, femAnnMaxR2] = normalizeProductionRange(
      stateRender2.mpaFemProductionAnnualMin,
      stateRender2.mpaFemProductionAnnualMax,
      femEnvelope.min,
      femEnvelope.max,
      300,
    );
    const patchRender2: Partial<AppSettings> = {};
    if (stateRender2.mpaFemProductionAnnualMin !== femAnnMinR2) patchRender2.mpaFemProductionAnnualMin = femAnnMinR2;
    if (stateRender2.mpaFemProductionAnnualMax !== femAnnMaxR2) patchRender2.mpaFemProductionAnnualMax = femAnnMaxR2;

    expect(femAnnMinR2).toBe(5775);
    expect(femAnnMaxR2).toBe(6075); // Permanece estritamente 6075, nunca expande para 6195!
    expect(Object.keys(patchRender2)).toHaveLength(0); // Equilíbrio estável alcançado

    // 5. Configuração Sanitizada Final para Execução
    const executionSettings: AppSettings = {
      ...activeSettings,
      mpaFemProductionMonthlyMin: String(femMonthly![0]),
      mpaFemProductionMonthlyMax: String(femMonthly![1]),
      mpaFemProductionAnnualMin: femAnnualMin,
      mpaFemProductionAnnualMax: femAnnualMax,
      mpaMascProductionMonthlyMin: String(mascMonthly![0]),
      mpaMascProductionMonthlyMax: String(mascMonthly![1]),
      mpaMascProductionAnnualMin: mascAnnualMin,
      mpaMascProductionAnnualMax: mascAnnualMax,
    };

    const productiveMonthIndexes = [3, 4, 5, 6, 7, 8, 9];

    // 6. Testes exaustivos com múltiplas sementes e rotação
    const seeds = [42, 101, 777];
    for (const seed of seeds) {
      // FEMININO com rotação desativada
      const femRun = generateMpaProduction("FEMININO", executionSettings, {
        randomFn: createPrng(seed),
      });
      validateProductionProperties(
        femRun.production,
        femRun.daysMap,
        productiveMonthIndexes,
        4,
        825,
        885,
        5775,
        6075,
        21,
        25,
      );

      // MASCULINO com rotação ativada
      const mascRun = generateMpaProduction(
        "MASCULINO",
        { ...executionSettings, mpaRotateMonthlySpecies: true },
        { randomFn: createPrng(seed + 99) },
      );
      validateProductionProperties(
        mascRun.production,
        mascRun.daysMap,
        productiveMonthIndexes,
        4,
        825,
        885,
        5775,
        6075,
        21,
        25,
      );
    }
  });

  it("fixture 09/24 (4 defeso, 5 espécies): sanitizes, normalizes, and executes E2E across multiple seeds", () => {
    expect(fs.existsSync(fixture0924Path)).toBe(true);
    const parsedJson = JSON.parse(fs.readFileSync(fixture0924Path, "utf-8"));

    const localProfile: AppSettings = {
      cpf: "22233344455",
      senha: "OUTRA_SENHA_LOCAL",
    };

    const importResult = parseReapMpaImportPayload(parsedJson, localProfile);
    expect(importResult.normalizedSettings.cpf).toBe("22233344455");
    expect(importResult.normalizedSettings.senha).toBe("OUTRA_SENHA_LOCAL");

    const activeSettings = importResult.normalizedSettings;

    // Defeso: meses 1, 2, 3, 4 -> 8 meses produtivos (índices 4 a 11)
    const femEnvelope = calculateSafeProductionEnvelope(activeSettings, "FEMININO");
    expect(femEnvelope.productiveMonths).toBe(8);
    expect(femEnvelope.safeMonthlyMin).toBe(372);
    expect(femEnvelope.safeMonthlyMax).toBe(804);

    const femMonthly = normalizeMonthlyProductionRange(
      activeSettings.mpaFemProductionMonthlyMin,
      activeSettings.mpaFemProductionMonthlyMax,
      femEnvelope.safeMonthlyMin,
      femEnvelope.safeMonthlyMax,
    );
    expect(femMonthly).not.toBeNull();
    // 650..710 está dentro da faixa segura [372, 804]
    expect(femMonthly![0]).toBe(650);
    expect(femMonthly![1]).toBe(710);

    const [femAnnualMin, femAnnualMax] = normalizeProductionRange(
      activeSettings.mpaFemProductionAnnualMin,
      activeSettings.mpaFemProductionAnnualMax,
      femEnvelope.min,
      femEnvelope.max,
      300,
    );
    // 8 * 650 = 5200, 8 * 710 = 5680
    expect(femEnvelope.min).toBe(5200);
    expect(femEnvelope.max).toBe(5680);
    expect(femAnnualMin).toBe(5200);
    expect(femAnnualMax).toBe(5619); // 5053..5619 clamped para [5200, 5680] mantendo step 0.25 e span >= 300

    const executionSettings: AppSettings = {
      ...activeSettings,
      mpaFemProductionMonthlyMin: String(femMonthly![0]),
      mpaFemProductionMonthlyMax: String(femMonthly![1]),
      mpaFemProductionAnnualMin: femAnnualMin,
      mpaFemProductionAnnualMax: femAnnualMax,
      mpaMascProductionMonthlyMin: String(femMonthly![0]),
      mpaMascProductionMonthlyMax: String(femMonthly![1]),
      mpaMascProductionAnnualMin: femAnnualMin,
      mpaMascProductionAnnualMax: femAnnualMax,
    };

    const productiveMonthIndexes = [4, 5, 6, 7, 8, 9, 10, 11];

    for (const seed of [12, 55, 888]) {
      const run = generateMpaProduction("FEMININO", executionSettings, {
        randomFn: createPrng(seed),
      });
      validateProductionProperties(
        run.production,
        run.daysMap,
        productiveMonthIndexes,
        5,
        650,
        710,
        5200,
        5619,
        21,
        25,
      );
    }
  });

  it("verifies PDF cache content integrity: foreign PDF key does not overwrite preset PDF", () => {
    const importPayload = {
      version: 1,
      format: "sigess-reap-mpa-settings",
      settings: {
        mpaDefesoMonths: [1],
        mpaSpeciesCount: 1,
        reapMpaPresets: [
          {
            id: "preset-legitimo",
            name: "Legítimo",
            settings: { mpaSpeciesCount: 1 },
          },
        ],
      },
      pdfCaches: {
        "preset-legitimo": {
          b64: "CONTEUDO_ORIGINAL_PRESET",
          filename: "documento_original.pdf",
        },
        "chave-desconhecida-intrusa": {
          b64: "CONTEUDO_INTRUSO_MALICIOSO",
          filename: "invasor.pdf",
        },
      },
    };

    const result = parseReapMpaImportPayload(importPayload, {});

    // Preset legítimo preserva rigorosamente seu conteúdo original
    expect(result.pdfCaches["preset-legitimo"]).toBeDefined();
    expect(result.pdfCaches["preset-legitimo"].b64).toBe("CONTEUDO_ORIGINAL_PRESET");
    expect(result.pdfCaches["preset-legitimo"].filename).toBe("documento_original.pdf");

    // Chave intrusa foi descartada e não substituiu nada
    expect(result.pdfCaches["chave-desconhecida-intrusa"]).toBeUndefined();
    expect(Object.keys(result.pdfCaches)).toEqual(["preset-legitimo"]);
  });
});
