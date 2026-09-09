export const IBAMA_DEFESO_URL = "https://www.gov.br/ibama/pt-br/assuntos/biodiversidade/biodiversidade-aquatica/periodos-de-defeso";

export const REAP_STATE_OPTIONS = [
  { value: 1, label: "RONDONIA", enabled: true },
  { value: 2, label: "ACRE", enabled: true },
  { value: 3, label: "AMAZONAS", enabled: true },
  { value: 4, label: "RORAIMA", enabled: true },
  { value: 5, label: "PARA", enabled: true },
  { value: 6, label: "AMAPA", enabled: true },
  { value: 7, label: "TOCANTINS", enabled: true },
  { value: 8, label: "MARANHAO", enabled: true },
  { value: 9, label: "PIAUI", enabled: true },
  { value: 10, label: "CEARA", enabled: true },
  { value: 11, label: "RIO GRANDE DO NORTE", enabled: true },
  { value: 12, label: "PARAIBA", enabled: true },
  { value: 13, label: "PERNAMBUCO", enabled: true },
  { value: 14, label: "ALAGOAS", enabled: true },
  { value: 15, label: "SERGIPE", enabled: true },
  { value: 16, label: "BAHIA", enabled: true },
  { value: 17, label: "MINAS GERAIS", enabled: true },
  { value: 18, label: "ESPIRITO SANTO", enabled: true },
  { value: 19, label: "RIO DE JANEIRO", enabled: true },
  { value: 20, label: "SAO PAULO", enabled: true },
  { value: 21, label: "PARANA", enabled: true },
  { value: 22, label: "SANTA CATARINA", enabled: true },
  { value: 23, label: "RIO GRANDE DO SUL", enabled: true },
  { value: 24, label: "MATO GROSSO DO SUL", enabled: true },
  { value: 25, label: "MATO GROSSO", enabled: true },
  { value: 26, label: "GOIAS", enabled: true },
  { value: 27, label: "DISTRITO FEDERAL", enabled: true },
  { value: 28, label: "EX", enabled: false },
] as const;

export const REAP_STATE_UF_BY_CODE: Record<number, string> = {
  1: "RO", 2: "AC", 3: "AM", 4: "RR", 5: "PA", 6: "AP", 7: "TO",
  8: "MA", 9: "PI", 10: "CE", 11: "RN", 12: "PB", 13: "PE", 14: "AL",
  15: "SE", 16: "BA", 17: "MG", 18: "ES", 19: "RJ", 20: "SP", 21: "PR",
  22: "SC", 23: "RS", 24: "MS", 25: "MT", 26: "GO", 27: "DF",
};

// O portal MPA disponibiliza todos estes códigos no campo
// `estadosComercializacao`; a mesma cobertura é usada para residência porque
// os municípios de todos os estados estão disponíveis localmente.
export const REAP_COMMERCIALIZATION_STATE_OPTIONS = REAP_STATE_OPTIONS.map(({ value, label }) => ({
  value,
  label,
}));

export const WORK_RELATION_OPTIONS = [
  "Economia Familiar",
  "Individual/Autônomo",
];

export const FISHING_LOCATION_OPTIONS = [
  { value: 1, label: "Açude" },
  { value: 2, label: "Estuário" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Lago" },
  { value: 5, label: "Lagoa" },
  { value: 6, label: "Rio" },
  { value: 7, label: "Represa" },
  { value: 8, label: "Reservatório" },
  { value: 9, label: "Laguna" },
];

export const FISHING_ENVIRONMENT_OPTIONS = [
  { value: 1, label: "Água Doce" },
];

export const APETRECHOS_OPTIONS = [
  { value: 1, label: "Arrasto" },
  { value: 2, label: "Cerco" },
  { value: 3, label: "Covos" },
  { value: 4, label: "Emalhe" },
  { value: 5, label: "Espinhel" },
  { value: 6, label: "Linha de Mão" },
  { value: 7, label: "Linha e Anzol" },
  { value: 8, label: "Mariscagem" },
  { value: 9, label: "Matapi" },
  { value: 10, label: "Pesca Subaquática" },
  { value: 11, label: "Tarrafa" },
  { value: 12, label: "Vara" },
  { value: 13, label: "Outro" },
];

export const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
