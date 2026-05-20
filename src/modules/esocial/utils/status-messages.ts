export interface StatusMessage {
  status: "processando" | "concluido" | "ignorado" | "erro";
  title: string;
  description: string;
}

export const esocialMessages = {
  verifyingBoletoStatus: (): StatusMessage => ({
    status: "processando",
    title: "Verificando status do boleto",
    description: "Consultando boleto existente...",
  }),

  redirectingToCompetencies: (): StatusMessage => ({
    status: "processando",
    title: "Abrindo lista de competências",
    description: "Carregando lista para consultar boletos...",
  }),

  competenciesLoaded: (): StatusMessage => ({
    status: "processando",
    title: "Lista de competências carregada",
    description: "Verificando filtros de ano...",
  }),

  applyingYearFilter: (year: string): StatusMessage => ({
    status: "processando",
    title: `Filtrando por ano: ${year}`,
    description: "Ajustando filtros...",
  }),

  guideAlreadyExists: (competencia: string): StatusMessage => ({
    status: "ignorado",
    title: `Boleto de ${competencia} já existe`,
    description: "Este boleto já foi gerado com valor. Pulando...",
  }),

  guideAlreadyIssued: (competencia: string): StatusMessage => ({
    status: "processando",
    title: `Boleto de ${competencia} já foi gerado`,
    description: "Baixando boleto existente...",
  }),

  initializingGuideGeneration: (competencia: string): StatusMessage => ({
    status: "processando",
    title: `Gerando boleto de ${competencia}...`,
    description: "Executando fluxo de geração...",
  }),

  savingCommercializationDraft: (): StatusMessage => ({
    status: "processando",
    title: "Salvando dados da comercialização",
    description: "Processando informações...",
  }),

  sendingCommercializationEvents: (): StatusMessage => ({
    status: "processando",
    title: "Enviando informações",
    description: "Completando operação...",
  }),

  loadingClosureScreen: (): StatusMessage => ({
    status: "processando",
    title: "Carregando tela de encerramento",
    description: "Aguarde...",
  }),

  closingPayroll: (): StatusMessage => ({
    status: "processando",
    title: "Finalizando folha de pagamento",
    description: "Processando encerramento...",
  }),

  loadingCommercializationData: (): StatusMessage => ({
    status: "processando",
    title: "Carregando dados de comercialização",
    description: "Recuperando informações...",
  }),

  verifyingClosureAccess: (): StatusMessage => ({
    status: "processando",
    title: "Verificando acesso ao encerramento",
    description: "Validando permissões...",
  }),

  pdfDownloadedSuccessfully: (filename: string): StatusMessage => ({
    status: "concluido",
    title: "Boleto salvo com sucesso",
    description: `Arquivo: ${filename}`,
  }),

  guideOpenedInNewTab: (filename: string): StatusMessage => ({
    status: "concluido",
    title: "Boleto aberto em nova aba",
    description: `Finalize a emissão: ${filename}`,
  }),

  failedToResolveGuideUrl: (): StatusMessage => ({
    status: "erro",
    title: "Erro ao resolver boleto",
    description: "Não consegui acessar o link do boleto. Tente novamente.",
  }),

  failedToDownloadGuide: (): StatusMessage => ({
    status: "erro",
    title: "Erro ao baixar boleto",
    description: "O eSocial não retornou o PDF esperado. Tente novamente.",
  }),

  failedToGenerateGuide: (): StatusMessage => ({
    status: "erro",
    title: "Erro ao gerar boleto",
    description: "Não consegui concluir a geração automática. Tente novamente.",
  }),

  manualEmitGuideDetected: (): StatusMessage => ({
    status: "processando",
    title: "Baixando PDF do boleto",
    description: "Gerando arquivo...",
  }),

  payrollAlreadyClosed: (competencia: string): StatusMessage => ({
    status: "erro",
    title: `Folha de ${competencia} já foi fechada`,
    description: "Será necessário reabrir a folha no eSocial para fazer alterações.",
  }),
};
