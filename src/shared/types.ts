export interface UserCredentials {
  cpf: string;
  senha: string;
  loginConcluido?: boolean;
}
export interface AppSettings {
  consultarGuias: boolean;
  gerarGps: boolean;
  selectedYear: string;
  selectedMonth: string;
  valorComercializado: string;
  reapData: Record<string, string>;
  reapTurboConfig?: string;
  mpaEspeciePescado?: number;
  mpaMunicipio?: number;
  mpaUF?: number;
  mpaLocalPesca?: number;
  mpaPetrecho?: number;
  mpaAmbiente?: number;

  // Novos campos para Multiespécies (Mockup/Config)
  mpaSpecies?: Array<{
    id?: number;
    kgMin?: string;
    kgMax?: string;
    priceMin?: string;
    priceMax?: string;
  }>;

  // Parâmetros de Gênero
  mpaMascProdMin?: string;
  mpaMascProdMax?: string;
  mpaMascDaysMin?: string;
  mpaMascDaysMax?: string;
  mpaFemProdMin?: string;
  mpaFemProdMax?: string;
  mpaFemDaysMin?: string;
  mpaFemDaysMax?: string;
}
export interface MessageRequest {
  action: string;
  settings?: Partial<AppSettings>;
  [key: string]: any;
}
export interface MessageResponse {
  success: boolean;
  error?: string;
  settings?: AppSettings;
  data?: any;
  [key: string]: any;
}

export interface TurboReapConfig {
  startMonth?: number;
  meses: TurboMesConfig[];
  areaRealizacao: TurboAreaConfig;
}

export interface TurboMesConfig {
  mes: number;
  houvePesca: boolean;
  diasTrabalhados?: number;
  justificativa?: number;
  especies?: TurboEspecieConfig[];
}

export interface TurboAreaConfig {
  localPesca: number;
  uf: number;
  municipio: number;
  petrechosPesca: number[];
  ambientePesca: number;
}

export interface TurboEspecieConfig {
  especiePescado: number;
  unidadeMedida: number;
  quantidade: number;
  valorMedioQuilo: number;
}
