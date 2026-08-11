import { State } from "./session-state";
import { TurboReapConfig } from "../../shared/types";
import { getEffectiveFishingMethod } from "./reap-settings";
import { buildMonthPlan, hasConfiguredDefesoMonths } from "./monthly-plan";

export function validateReapSettings(settings: any, gender: string): string | null {
  if (!hasConfiguredDefesoMonths(settings)) {
    return "Selecione pelo menos um mes de defeso no painel de configuracoes do REAP MPA.";
  }

  if (!settings.mpaReferenceYear) {
    return "Por favor, configure o Ano de Referencia do REAP no painel de configuracoes do REAP MPA.";
  }

  if (!settings.mpaMunicipio) {
    return "Por favor, selecione um MUNICIPIO no painel de configuracoes do REAP MPA.";
  }

  const filled = (settings.mpaSpecies || []).filter((s: any) => s?.id);
  if (filled.length < 3) {
    return "Por favor, preencha pelo menos 3 especies no painel de configuracoes do REAP MPA.";
  }

  for (const s of filled) {
    if (!s.kgMin || !s.kgMax || !s.priceMin || !s.priceMax) {
      return "Preencha todos os campos numericos (KG e VAL Min/Max) para todas as especies configuradas.";
    }
    if (Number(s.kgMin) > Number(s.kgMax)) {
      return "KG Min nao pode ser maior que KG Max em nenhuma especie.";
    }
    if (Number(s.priceMin) > Number(s.priceMax)) {
      return "Valor Min nao pode ser maior que Valor Max em nenhuma especie.";
    }
  }

  const daysPrefix = gender === "MASCULINO" ? "mpaMascDays" : "mpaFemDays";
  const daysMin = Number(settings[`${daysPrefix}Min`]);
  const daysMax = Number(settings[`${daysPrefix}Max`]);
  if (!daysMin || !daysMax) {
    return `Por favor, preencha os limites (Min/Max) de "Dias/Mes" para o genero ${gender} no painel de configuracoes.`;
  }
  if (!Number.isInteger(daysMin) || !Number.isInteger(daysMax)) {
    return `Os valores de "Dias/Mes" para o genero ${gender} devem ser numeros inteiros de 1 a 30.`;
  }
  if (daysMin < 1 || daysMax < 1) {
    return `O minimo de "Dias/Mes" para o genero ${gender} e 1 dia.`;
  }
  if (daysMin > 30 || daysMax > 30) {
    return `O maximo de "Dias/Mes" para o genero ${gender} e 30 dias.`;
  }
  if (daysMin > daysMax) {
    return `O valor minimo de "Dias/Mes" nao pode ser maior que o maximo para o genero ${gender}.`;
  }

  const prodPrefix = gender === "MASCULINO" ? "mpaMascProductionAnnual" : "mpaFemProductionAnnual";
  if (!settings[`${prodPrefix}Min`] || !settings[`${prodPrefix}Max`]) {
    return `Por favor, ajuste o slider de "Producao (R$)" para o genero ${gender} no painel de configuracoes.`;
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
