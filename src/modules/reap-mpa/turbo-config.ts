import { State } from "./session-state";
import { TurboReapConfig } from "../../shared/types";
import { getEffectiveFishingMethod, getValidSpeciesPool } from "./reap-settings";
import { buildMonthPlan, hasConfiguredDefesoMonths } from "./monthly-plan";
import { DaysGenerator } from "./generators/days-schedule";
import { ProductionGenerator } from "./generators/fish-production";

export interface ReapValidationOptions {
  hasPdf?: boolean;
  strictBothGenders?: boolean;
}

function validateSpeciesSection(settings: any, errors: string[]): void {
  const requestedSpeciesCount = Number(settings.mpaSpeciesCount);
  if (!Number.isInteger(requestedSpeciesCount) || requestedSpeciesCount < 1) {
    errors.push("Quantidade de espécies configuradas deve ser maior que zero.");
    return;
  }

  const filled = (settings.mpaSpecies || []).filter((s: any) => Boolean(s?.id));
  const validPool = getValidSpeciesPool(settings.mpaSpecies);

  for (const s of filled) {
    const kgMin = Number(String(s.kgMin ?? "").replace(",", "."));
    const kgMax = Number(String(s.kgMax ?? "").replace(",", "."));
    const priceMin = Number(String(s.priceMin ?? "").replace(",", "."));
    const priceMax = Number(String(s.priceMax ?? "").replace(",", "."));

    if (
      !Number.isFinite(kgMin) || kgMin <= 0 ||
      !Number.isFinite(kgMax) || kgMax <= 0 ||
      !Number.isFinite(priceMin) || priceMin <= 0 ||
      !Number.isFinite(priceMax) || priceMax <= 0
    ) {
      errors.push("Preencha valores numéricos positivos válidos (KG e Preço) para todas as espécies.");
      break;
    }

    if (kgMin > kgMax) {
      errors.push("KG Mín não pode ser maior que KG Máx em nenhuma espécie.");
      break;
    }
    if (priceMin > priceMax) {
      errors.push("Preço Mín não pode ser maior que Preço Máx em nenhuma espécie.");
      break;
    }
  }

  if (requestedSpeciesCount > filled.length || validPool.length < requestedSpeciesCount) {
    errors.push(`A pool possui ${validPool.length} espécie(s) válida(s), mas são necessárias ${requestedSpeciesCount}.`);
  }
}

function validateSingleGender(settings: any, g: string, errors: string[]): void {
  const prefix = g === "MASCULINO" ? "mpaMasc" : "mpaFem";
  const gLabel = g === "MASCULINO" ? "Masculino" : "Feminino";

  const rawMin = settings[`${prefix}DaysMin`];
  const rawMax = settings[`${prefix}DaysMax`];
  const daysMin = Number(rawMin);
  const daysMax = Number(rawMax);

  if (
    rawMin === "" || rawMin == null ||
    rawMax === "" || rawMax == null ||
    !Number.isFinite(daysMin) || !Number.isFinite(daysMax) ||
    !Number.isInteger(daysMin) || !Number.isInteger(daysMax)
  ) {
    errors.push(`Preencha números inteiros válidos de Dias/Mês (Mín e Máx) para o gênero ${gLabel}.`);
  } else if (daysMin < 1 || daysMax > 30) {
    errors.push(`Os limites de Dias/Mês para o gênero ${gLabel} devem estar entre 1 e 30 dias.`);
  } else if (daysMin > daysMax) {
    errors.push(`Dias/Mês Mínimo não pode ser maior que Máximo para o gênero ${gLabel}.`);
  }

  const prodMin = settings[`${prefix}ProductionAnnualMin`];
  const prodMax = settings[`${prefix}ProductionAnnualMax`];
  if (
    prodMin == null || prodMax == null ||
    !Number.isFinite(Number(prodMin)) || !Number.isFinite(Number(prodMax))
  ) {
    errors.push(`Ajuste o slider de Produção Anual (R$) para o gênero ${gLabel}.`);
  }
}

function validateGenderSection(
  settings: any,
  gender: string,
  options: ReapValidationOptions | undefined,
  errors: string[],
): void {
  if (options?.strictBothGenders) {
    validateSingleGender(settings, "MASCULINO", errors);
    validateSingleGender(settings, "FEMININO", errors);
  } else {
    validateSingleGender(settings, gender || "MASCULINO", errors);
  }
}

export function getReapSettingsValidationErrors(
  settings: any,
  gender: string,
  options?: ReapValidationOptions,
): string[] {
  const errors: string[] = [];

  // Seção 1: Identificação
  if (!settings.mpaReferenceYear) {
    errors.push("Ano de referência não configurado.");
  }
  if (!settings.mpaResidenceUF) {
    errors.push("Estado (UF) de residência não selecionado.");
  }
  if (!settings.mpaResidenceMunicipio) {
    errors.push("Município de residência não selecionado.");
  }

  // Seção 2: Atividade
  if (!settings.mpaWorkRelation) {
    errors.push("Relação de trabalho não selecionada.");
  }
  if (
    !Array.isArray(settings.mpaCommercializationStates) ||
    settings.mpaCommercializationStates.length === 0
  ) {
    errors.push("Selecione pelo menos um estado de comercialização.");
  }

  // Seção 3: Locais de Pesca (Sem fallbacks)
  if (!hasConfiguredDefesoMonths(settings)) {
    errors.push("Selecione pelo menos um mês de defeso.");
  }
  if (!settings.mpaLocalPesca) {
    errors.push("Local de pesca não selecionado.");
  }
  if (!getEffectiveFishingMethod(settings)) {
    errors.push("Petrecho de pesca não selecionado.");
  }
  if (!settings.mpaUF) {
    errors.push("Estado (UF) de pesca não selecionado.");
  }
  if (!settings.mpaMunicipio) {
    errors.push("Município de pesca não selecionado.");
  }

  // Seção 4: Espécies e Produção
  validateSpeciesSection(settings, errors);
  validateGenderSection(settings, gender, options, errors);

  // Seção 5: Documento Comprobatório
  if (settings.mpaDocumentoMode === "local" && options?.hasPdf === false) {
    errors.push("Modo 'Arquivo local' ativo, mas nenhum PDF foi anexado nas configurações.");
  }

  return errors;
}

export function validateReapSettings(
  settings: any,
  gender: string,
  options?: ReapValidationOptions,
): string | null {
  const errors = getReapSettingsValidationErrors(settings, gender, options);
  return errors.length > 0 ? errors[0] : null;
}

export function checkPresetReadiness(
  settings: any,
  gender = "MASCULINO",
  options?: ReapValidationOptions,
): { isReady: boolean; pendingCount: number; pendingFields: string[] } {
  const pendingFields = getReapSettingsValidationErrors(settings, gender, options);
  return {
    isReady: pendingFields.length === 0,
    pendingCount: pendingFields.length,
    pendingFields,
  };
}

export function buildTurboConfig(
  settings: any,
  pdfCache?: { b64: string; filename: string } | null,
): TurboReapConfig {
  const isParcial = State.turboFillMode === "parcial";
  const petrecho = getEffectiveFishingMethod(settings);

  const configuredSpeciesCount = Number(settings?.mpaSpeciesCount);
  if (!State.daysMap || Object.keys(State.daysMap).length === 0) {
    State.daysMap = DaysGenerator.generate(State.gender, settings);
  }
  const rotationEnabled = Boolean(settings?.mpaRotateMonthlySpecies);
  if (!State.production || State.production.length === 0 || (!rotationEnabled && State.production.length !== configuredSpeciesCount)) {
    State.production = ProductionGenerator.generate(State.daysMap, State.gender, settings, { mode: "mpa" });
  }

  const config: TurboReapConfig = {
    startMonth: isParcial ? 1 : State.currentMonthIndex + 1,
    ...(isParcial &&
      State.turboSelectedMonths.size > 0 && {
        mesesFiltro: Array.from(State.turboSelectedMonths)
          .sort((a, b) => a - b)
          .map((i) => i + 1),
      }),
    areaRealizacao: {
      localPesca: settings.mpaLocalPesca,
      uf: settings.mpaUF,
      municipio: settings.mpaMunicipio,
      ...(settings.mpaNomeLocalPesca?.trim() ? { nome: settings.mpaNomeLocalPesca.trim() } : {}),
      petrechosPesca: petrecho ? [petrecho] : [],
      ambientePesca: 1,
    },
    meses: [],
    documentoMode: settings.mpaDocumentoMode === "local" ? "local" : "manual",
  };

  for (let i = 0; i < 12; i++) {
    config.meses.push(buildMonthPlan(settings, i, State.daysMap, State.production));
  }

  if (config.documentoMode === "local" && pdfCache?.b64) {
    config.documentoPdfB64 = pdfCache.b64;
    config.documentoPdfFilename = pdfCache.filename;
  }

  return config;
}
