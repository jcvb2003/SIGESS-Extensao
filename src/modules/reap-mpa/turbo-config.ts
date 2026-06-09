import { State } from "./session-state";
import { TurboReapConfig } from "../../shared/types";
import { getEffectiveFishingMethod } from "./reap-settings";
import { buildMonthPlan, hasConfiguredDefesoMonths } from "./monthly-plan";

export function validateReapSettings(settings: any, gender: string): string | null {
  if (!hasConfiguredDefesoMonths(settings)) {
    return "Selecione pelo menos um mes de defeso no painel de configuracoes do REAP MPA.";
  }

  if (!settings.mpaMunicipio) {
    return "Por favor, selecione um MUNICIPIO no painel de configuracoes do REAP MPA.";
  }

  const filled = (settings.mpaSpecies || []).filter((s: any) => s?.id);
  if (filled.length < 4) {
    return "Por favor, preencha pelo menos 4 especies no painel de configuracoes do REAP MPA.";
  }

  for (const s of filled) {
    if (!s.kgMin || !s.kgMax || !s.priceMin || !s.priceMax) {
      return "Preencha todos os campos numericos (KG e VAL Min/Max) para todas as especies configuradas.";
    }
  }

  const daysPrefix = gender === "MASCULINO" ? "mpaMascDays" : "mpaFemDays";
  if (!settings[`${daysPrefix}Min`] || !settings[`${daysPrefix}Max`]) {
    return `Por favor, preencha os limites (Min/Max) de "Dias Trab." para o genero ${gender} no painel de configuracoes.`;
  }

  const prodPrefix = gender === "MASCULINO" ? "mpaMascProd" : "mpaFemProd";
  if (!settings[`${prodPrefix}Min`] || !settings[`${prodPrefix}Max`]) {
    return `Por favor, preencha as metas (Min/Max) de "Producao (R$)" para o genero ${gender} no painel de configuracoes.`;
  }

  return null;
}

export function buildTurboConfig(
  settings: any,
  pdfCache?: { b64: string; filename: string } | null,
): TurboReapConfig {
  const isParcial = State.turboFillMode === "parcial";
  const config: TurboReapConfig = {
    startMonth: isParcial ? 1 : State.currentMonthIndex + 1,
    ...(isParcial &&
      State.turboSelectedMonths.size > 0 && {
        mesesFiltro: Array.from(State.turboSelectedMonths)
          .sort((a, b) => a - b)
          .map((i) => i + 1),
      }),
    areaRealizacao: {
      localPesca: settings.mpaLocalPesca || 6,
      uf: settings.mpaUF || 5,
      municipio: settings.mpaMunicipio,
      petrechosPesca: [getEffectiveFishingMethod(settings)],
      ambientePesca: 1,
    },
    meses: [],
    documentoMode: settings.mpaDocumentoMode || "manual",
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
