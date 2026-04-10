export interface UserCredentials {
  cpf: string;
  senha: string;
  loginConcluido?: boolean;
}

export interface MultiLoginItem {
  id: string;
  nome: string;
  cpf: string;
  senha: string;
  url: string;
  type: 'pesqbrasil' | 'esocial';
  timestamp: number;
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
  multiLoginEnabled?: boolean;
  multiLoginQueue?: MultiLoginItem[];

  mpaSpecies?: Array<{
    id?: number;
    kgMin?: string;
    kgMax?: string;
    priceMin?: string;
    priceMax?: string;
  }>;
  mpaSpeciesCount?: number;

  mpaMascProdMin?: string;
  mpaMascProdMax?: string;
  mpaMascDaysMin?: string;
  mpaMascDaysMax?: string;
  mpaFemProdMin?: string;
  mpaFemProdMax?: string;
  mpaFemDaysMin?: string;
  mpaFemDaysMax?: string;

  pessoaData?: PessoaData;
  pessoaData_raw?: Record<string, Partial<PessoaData>>;
  autoRegistrationEnabled?: boolean;
  
  // SDPA (MTE)
  sdpaEnabled?: boolean;
  sdpaDefaultEmail?: string;
  sdpaFallbackPhone?: string;
}

export interface PessoaData {
  // Registro
  codigoDoSocio?: string;
  dataDeAdmissao?: string;
  situacao?: "ATIVO" | "APOSENTADO" | "FALECIDO" | "TRANSFERIDO" | "CANCELADO" | "SUSPENSO";
  observacoes?: string;

  // Dados Pessoais
  cpf?: string;
  nome?: string;
  apelido?: string;
  dataDeNascimento?: string;
  sexo?: "MASCULINO" | "FEMININO";
  estadoCivil?: string;
  pai?: string;
  mae?: string;
  nacionalidade?: string;
  naturalidade?: string;
  ufNaturalidade?: string;
  alfabetizado?: "SIM" | "NÃO";
  escolaridade?: string;

  // Endereço e Contato
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  codigoLocalidade?: string;

  // Documentos
  rg?: string;
  dataExpedicaoRg?: string;
  ufRg?: string;
  orgaoEmissorRg?: string;       // ex: SSP, DETRAN — vem do CadÚnico
  tituloEleitor?: string;
  zonaEleitoral?: string;
  secaoEleitoral?: string;
  nit?: string;                  // NIS/PIS/PASEP
  ctps?: string;                 // Número da CTPS (ex: "15705/50")
  ctpsUf?: string;               // UF emissora da CTPS
  cei?: string;
  caepf?: string;
  cnae?: string;
  atividadeEconomica?: string;
  situacaoCaepf?: string;
  rgp?: string;
  tipoRgp?: "INICIAL" | "PROTOCOLO" | "RECADASTRAMENTO";
  emissaoRgp?: string;
  ufRgp?: string;
  dataPrimeiroRegistro?: string;
  senhaGovInss?: string;

  // Metadados das fontes
  fontes?: {
    [key: string]: {
      capturado: boolean;
      timestamp: number;
    };
  };
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
