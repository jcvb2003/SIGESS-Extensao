import { describe, it, expect } from "vitest";
import {
  validateReapSettings,
  getReapSettingsValidationErrors,
  checkPresetReadiness,
  buildTurboConfig
} from "../../src/modules/reap-mpa/turbo-config";

const completeValidSettings = {
  mpaReferenceYear: "2025",
  mpaResidenceUF: 5,
  mpaResidenceMunicipio: 1500800,
  mpaWorkRelation: "Autônomo",
  mpaCommercializationStates: [5],
  mpaDefesoMonths: [1, 2],
  mpaLocalPesca: 6,
  mpaMetodoPesca: 4,
  mpaUF: 5,
  mpaMunicipio: 1500800,
  mpaSpeciesCount: 1,
  mpaSpecies: [
    { id: 10, nome: "Tucunaré", kgMin: "20", kgMax: "50", priceMin: "10.50", priceMax: "20.00" }
  ],
  mpaMascDaysMin: "20",
  mpaMascDaysMax: "25",
  mpaMascProductionAnnualMin: 5000,
  mpaMascProductionAnnualMax: 15000,
  mpaFemDaysMin: "20",
  mpaFemDaysMax: "25",
  mpaFemProductionAnnualMin: 5000,
  mpaFemProductionAnnualMax: 15000,
  mpaDocumentoMode: "manual",
};

describe("Complete REAP MPA Validation", () => {
  it("approves 100% valid complete settings", () => {
    const error = validateReapSettings(completeValidSettings, "MASCULINO");
    expect(error).toBeNull();

    const readiness = checkPresetReadiness(completeValidSettings, "MASCULINO", { strictBothGenders: true });
    expect(readiness.isReady).toBe(true);
    expect(readiness.pendingCount).toBe(0);
  });

  it("fails if identification fields (Seção 1) are missing", () => {
    const missingUf = { ...completeValidSettings, mpaResidenceUF: undefined };
    expect(validateReapSettings(missingUf, "MASCULINO")).toContain("Estado (UF) de residência");

    const missingMun = { ...completeValidSettings, mpaResidenceMunicipio: undefined };
    expect(validateReapSettings(missingMun, "MASCULINO")).toContain("Município de residência");
  });

  it("fails if activity fields (Seção 2) are missing", () => {
    const missingRelation = { ...completeValidSettings, mpaWorkRelation: "" };
    expect(validateReapSettings(missingRelation, "MASCULINO")).toContain("Relação de trabalho");

    const missingStates = { ...completeValidSettings, mpaCommercializationStates: [] };
    expect(validateReapSettings(missingStates, "MASCULINO")).toContain("estado de comercialização");
  });

  it("fails if fishing location fields (Seção 3) are missing (no fallbacks)", () => {
    const missingLocal = { ...completeValidSettings, mpaLocalPesca: undefined };
    expect(validateReapSettings(missingLocal, "MASCULINO")).toContain("Local de pesca");

    const missingPetrecho = { ...completeValidSettings, mpaMetodoPesca: undefined, mpaPetrecho: undefined };
    expect(validateReapSettings(missingPetrecho, "MASCULINO")).toContain("Petrecho de pesca");

    const missingUf = { ...completeValidSettings, mpaUF: undefined };
    expect(validateReapSettings(missingUf, "MASCULINO")).toContain("Estado (UF) de pesca");
  });

  it("fails if local document mode is selected but no PDF is present (Seção 5)", () => {
    const localDocMode = { ...completeValidSettings, mpaDocumentoMode: "local" };
    const error = validateReapSettings(localDocMode, "MASCULINO", { hasPdf: false });
    expect(error).toContain("Arquivo local");
  });

  it("approves local document mode when PDF is present in cache", () => {
    const localDocMode = { ...completeValidSettings, mpaDocumentoMode: "local" };
    const error = validateReapSettings(localDocMode, "MASCULINO", { hasPdf: true });
    expect(error).toBeNull();
  });

  it("fails when species have invalid or non-numeric values (Point 5)", () => {
    const invalidKg = {
      ...completeValidSettings,
      mpaSpecies: [{ id: 10, kgMin: "abc", kgMax: "50", priceMin: "10", priceMax: "20" }]
    };
    expect(validateReapSettings(invalidKg, "MASCULINO")).toContain("valores numéricos positivos válidos");

    const invertedKg = {
      ...completeValidSettings,
      mpaSpecies: [{ id: 10, kgMin: "60", kgMax: "50", priceMin: "10", priceMax: "20" }]
    };
    expect(validateReapSettings(invertedKg, "MASCULINO")).toContain("KG Mín não pode ser maior que KG Máx");
  });

  it("fails when days/month has non-numeric or out-of-range values (Point 5)", () => {
    const invalidDays = { ...completeValidSettings, mpaMascDaysMin: "abc" };
    expect(validateReapSettings(invalidDays, "MASCULINO")).toContain("números inteiros válidos de Dias/Mês");

    const outOfRangeDays = { ...completeValidSettings, mpaMascDaysMax: "35" };
    expect(validateReapSettings(outOfRangeDays, "MASCULINO")).toContain("entre 1 e 30 dias");
  });

  it("buildTurboConfig does not inject fallback values for localPesca or UF", () => {
    const config = buildTurboConfig(completeValidSettings);
    expect(config.areaRealizacao.localPesca).toBe(6);
    expect(config.areaRealizacao.uf).toBe(5);
    expect(config.areaRealizacao.petrechosPesca).toEqual([4]);

    const unconfiguredSettings = { ...completeValidSettings, mpaLocalPesca: undefined, mpaUF: undefined };
    const configWithoutFallback = buildTurboConfig(unconfiguredSettings);
    expect(configWithoutFallback.areaRealizacao.localPesca).toBeUndefined();
    expect(configWithoutFallback.areaRealizacao.uf).toBeUndefined();
  });

  it("handles optional mpaNomeLocalPesca correctly in readiness and turbo config", () => {
    // 1. Without mpaNomeLocalPesca -> still ready, nome is omitted
    const readinessWithout = checkPresetReadiness(completeValidSettings, "MASCULINO");
    expect(readinessWithout.isReady).toBe(true);
    const configWithout = buildTurboConfig(completeValidSettings);
    expect(configWithout.areaRealizacao.nome).toBeUndefined();

    // 2. With mpaNomeLocalPesca -> ready, nome is included trimmed
    const withNome = { ...completeValidSettings, mpaNomeLocalPesca: "  Igarapé Santa Luzia  " };
    const readinessWith = checkPresetReadiness(withNome, "MASCULINO");
    expect(readinessWith.isReady).toBe(true);
    const configWith = buildTurboConfig(withNome);
    expect(configWith.areaRealizacao.nome).toBe("Igarapé Santa Luzia");
  });
});

