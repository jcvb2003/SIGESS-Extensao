import { State } from './session-state';
import { TurboReapConfig } from '../../shared/types';

export function validateReapSettings(settings: any, gender: string): string | null {
  if (!settings.mpaMunicipio) {
    return "Por favor, selecione um MUNICÍPIO no painel de configurações do REAP MPA.";
  }

  const filled = (settings.mpaSpecies || []).filter((s: any) => s?.id);
  if (filled.length < 5) {
    return `Por favor, preencha pelo menos 5 espécies no painel de configurações do REAP MPA.`;
  }
  for (const s of filled) {
    if (!s.kgMin || !s.kgMax || !s.priceMin || !s.priceMax) {
      return `Preencha todos os campos numéricos (KG e VAL Mín/Máx) para todas as espécies configuradas.`;
    }
  }

  const daysPrefix = gender === "MASCULINO" ? "mpaMascDays" : "mpaFemDays";
  if (!settings[`${daysPrefix}Min`] || !settings[`${daysPrefix}Max`]) {
    return `Por favor, preencha os limites (Mín/Máx) de "Dias Trab." para o gênero ${gender} no painel de configurações.`;
  }

  const prodPrefix = gender === "MASCULINO" ? "mpaMascProd" : "mpaFemProd";
  if (!settings[`${prodPrefix}Min`] || !settings[`${prodPrefix}Max`]) {
    return `Por favor, preencha as metas (Mín/Máx) de "Produção (R$)" para o gênero ${gender} no painel de configurações.`;
  }

  return null;
}

export function buildTurboConfig(
  settings: any,
  pdfCache?: { b64: string; filename: string } | null
): TurboReapConfig {
  const isParcial = State.turboFillMode === "parcial";
  const config: TurboReapConfig = {
    startMonth: isParcial ? 1 : State.currentMonthIndex + 1,
    ...(isParcial && State.turboSelectedMonths.size > 0 && {
      mesesFiltro: Array.from(State.turboSelectedMonths).sort((a, b) => a - b).map(i => i + 1),
    }),
    areaRealizacao: {
      localPesca: settings.mpaLocalPesca || 6,
      uf: settings.mpaUF || 5,
      municipio: settings.mpaMunicipio,
      petrechosPesca: [settings.mpaPetrecho || 4],
      ambientePesca: settings.mpaAmbiente || 1,
    },
    meses: [],
    documentoMode: settings.mpaDocumentoMode || "manual",
  };

  for (let i = 0; i < 12; i++) {
    const especies = State.production
      .map((fish: any) => {
        const monthlyKg = fish.monthlyKg[i] || 0;
        return monthlyKg > 0
          ? { especiePescado: fish.id, unidadeMedida: 1, quantidade: monthlyKg, valorMedioQuilo: fish.price }
          : null;
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    if (especies.length === 0) {
      config.meses.push({ mes: i + 1, houvePesca: false, justificativa: 1 });
    } else {
      config.meses.push({ mes: i + 1, houvePesca: true, diasTrabalhados: State.daysMap[i] || 16, especies });
    }
  }

  if (config.documentoMode === "local" && pdfCache?.b64) {
    config.documentoPdfB64 = pdfCache.b64;
    config.documentoPdfFilename = pdfCache.filename;
  }

  return config;
}
