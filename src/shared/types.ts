export interface CadastroPortalEntry {
  status:
    | "aguardando"
    | "abrindo"
    | "coletando"
    | "concluido"
    | "dispensado"
    | "nao_encontrado"
    | "indisponivel"
    | "erro";
  tabId?: number;
  evidence?: string;
  updatedAt?: number;
  postLoginNavigationIssued?: boolean;
}

export interface CadastroSession {
  sessionId: string;
  cookieStoreId: string;
  sessionState: "active" | "complete" | "error";
  startedAt: number;
  portais: {
    cadunico: CadastroPortalEntry;
    pesqbrasil: CadastroPortalEntry;
    ecac: CadastroPortalEntry;
    tse?: CadastroPortalEntry;
    inss?: CadastroPortalEntry;
  };
  mergeRequest?: { raw: Record<string, Partial<PessoaData>> };
  performance?: import("../background/services/cadastro-performance").CadastroPerformanceSnapshot;
  errorMessage?: string;
  interactionRequired?: {
    type: "govbr_2fa" | "govbr_contact_confirmation";
    message: string;
    tabId?: number;
  };
}

export interface UserCredentials {
  cpf: string;
  senha: string;
  nome?: string;
  valorComercializado?: string;
  isCadastroAutomatico?: boolean;
  cadastroSessionId?: string;
  portalType?: "mte" | "pesqbrasil_mpa" | "esocial" | "inss" | "cadunico" | "ecac" | "tse";
  gerarGps?: boolean;
  consultarGuias?: boolean;
  selectedYear?: string;
  selectedMonth?: string;
  progressStep?: number;
  progressTotal?: number;
  loginConcluido?: boolean;
  govBrCpfSubmitted?: boolean;
  govBrPasswordSubmitted?: boolean;
  govBrTwoFactorPending?: boolean;
  status?: GovBatchItemStatus;
  statusTitle?: string;
  statusDescription?: string;
  boletoInfo?: BoletoInfo;
  boletoGerado?: boolean;
  lastError?: string;
  lastUpdatedAt?: number;
}

export type GovBatchItemStatus =
  | "enfileirado"
  | "abrindo_em_lote"
  | "aguardando_pagina"
  | "fazendo_login"
  | "aguardando_2fa"
  | "acessando_esocial"
  | "consultando"
  | "verificando_boleto"
  | "boleto_salvo"
  | "gerando_pdf"
  | "redirecionando"
  | "concluido"
  | "erro"
  | "expirado"
  | "ignorado";

export interface BoletoInfo {
  detectado: boolean;
  competencia?: string;
  valorComercializado?: number;
  valorDeclarado?: number;
  valorPago?: number;
}

export interface MultiLoginItem {
  id: string;
  nome: string;
  cpf: string;
  senha: string;
  url: string;
  valorComercializado?: string;
  gerarGps?: boolean;
  consultarGuias?: boolean;
  selectedYear?: string;
  selectedMonth?: string;
  type: "mte" | "pesqbrasil_mpa" | "esocial" | "inss";
  timestamp: number;
}

export interface GovBatchQueueItem {
  cpf: string;
  senha: string;
  nome?: string;
  url: string;
  valorComercializado?: string;
  gerarGps?: boolean;
  consultarGuias?: boolean;
  selectedYear?: string;
  selectedMonth?: string;
}

export interface AppSettings {
  consultarGuias: boolean;
  gerarGps: boolean;
  selectedYear: string;
  selectedMonth: string;
  valorComercializado: string;
  reapData: Record<string, string>;
  reapTurboConfig?: string;
  mpaReferenceYear?: string;
  mpaResidenceUF?: number;
  mpaResidenceMunicipio?: number;
  mpaWorkRelation?: string;
  mpaCommercializationStates?: number[];
  mpaDefesoMonths?: number[];
mpaMunicipio?: number;
  mpaUF?: number;
  mpaLocalPesca?: number;
  mpaMetodoPesca?: number;
  mpaPetrecho?: number; // legado: usar mpaMetodoPesca como campo canonico
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
  mpaMascProductionAnnualMin?: number;
  mpaMascProductionAnnualMax?: number;
  mpaMascDaysMin?: string;
  mpaMascDaysMax?: string;
  mpaMascAnnualMin?: number;
  mpaMascAnnualMax?: number;
  mpaFemProdMin?: string;
  mpaFemProdMax?: string;
  mpaFemProductionAnnualMin?: number;
  mpaFemProductionAnnualMax?: number;
  mpaFemDaysMin?: string;
  mpaFemDaysMax?: string;
  mpaFemAnnualMin?: number;
  mpaFemAnnualMax?: number;

  pessoaData?: PessoaData;
  pessoaData_raw?: Record<string, Partial<PessoaData>>;
  /** Projeções autorizadas para o cadastro consolidado por fonte. */
  pessoaData_projections?: Record<string, Partial<PessoaData>>;
  /** Snapshots completos e normalizados para auditoria no Inspetor de Dados. */
  pessoaData_snapshots?: Record<string, import("../modules/automation/cadastro/contracts").CadastroSourceSnapshot>;
  /** Valores que não podem sofrer normalização textual. */
  pessoaData_sensitive?: { senhaGovInss?: string };
  autoRegistrationEnabled?: boolean;
  
  // SDPA (MTE)
  sdpaEnabled?: boolean;
  sdpaDefaultEmail?: string;
  sdpaFallbackPhone?: string;

  mpaDocumentoMode?: "manual" | "local" | "url";
  reapMpaPresets?: ReapMpaPreset[];
  activeReapMpaPresetId?: string;
}

export interface ReapMpaPreset {
  id: string;
  name: string;
  settings: Partial<AppSettings>;
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
  mesesFiltro?: number[];
  meses: TurboMesConfig[];
  areaRealizacao: TurboAreaConfig;
  documentoMode?: "manual" | "local" | "url";
  documentoPdfB64?: string;
  documentoPdfFilename?: string;
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
