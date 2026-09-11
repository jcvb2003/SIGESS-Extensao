export interface StatusMessage {
  status: "processando" | "concluido" | "ignorado" | "erro";
  title: string;
  description: string;
  progressFlow: "consulta" | "geracao";
  progressStage:
    | "aguardando_pagina"
    | "fazendo_login"
    | "abrindo_consulta"
    | "competencias_consultadas"
    | "preparando_competencia"
    | "carregando_comercializacao"
    | "baixando_pdf";
}

const consulta = (progressStage: StatusMessage["progressStage"]) => ({
  progressFlow: "consulta" as const,
  progressStage,
});

const geracao = (progressStage: StatusMessage["progressStage"]) => ({
  progressFlow: "geracao" as const,
  progressStage,
});

function formatCompetencia(competencia: string): string {
  return /^\d{6}$/.test(competencia)
    ? `${competencia.slice(4, 6)}/${competencia.slice(0, 4)}`
    : competencia;
}

export const esocialMessages = {
  consultationPageWaiting: (): StatusMessage => ({
    status: "processando",
    title: "Aguardando página",
    description: "Aguardando o carregamento da página do eSocial.",
    ...consulta("aguardando_pagina"),
  }),

  openingConsultation: (): StatusMessage => ({
    status: "processando",
    title: "Abrindo a consulta de competências",
    description: "Carregando a consulta de competências do eSocial.",
    ...consulta("abrindo_consulta"),
  }),

  consultationCompleted: (total: number, year: string): StatusMessage => ({
    status: "concluido",
    title: "Competências consultadas",
    description: `${total} competência(s) retornada(s) para ${year}.`,
    ...consulta("competencias_consultadas"),
  }),

  consultationFailed: (): StatusMessage => ({
    status: "erro",
    title: "Falha na consulta de competências",
    description: "Não foi possível extrair os dados da tabela do eSocial.",
    ...consulta("abrindo_consulta"),
  }),

  startingCompetencia: (competencia: string, index: number, total: number): StatusMessage => ({
    status: "processando",
    title: `Preparando competência ${index} de ${total}`,
    description: `Iniciando a geração do DAE de ${formatCompetencia(competencia)}.`,
    ...geracao("preparando_competencia"),
  }),

  competenciaConcluida: (competencia: string, index: number, total: number): StatusMessage => ({
    status: "processando",
    title: `Competência ${index} de ${total} concluída`,
    description: index < total
      ? `Boleto de ${formatCompetencia(competencia)} salvo. Iniciando a próxima competência.`
      : `Boleto de ${formatCompetencia(competencia)} salvo.`,
    ...geracao("baixando_pdf"),
  }),

  allCompetenciasCompleted: (total: number): StatusMessage => ({
    status: "concluido",
    title: "Geração concluída",
    description: `${total} competência(s) processada(s) com sucesso.`,
    ...geracao("baixando_pdf"),
  }),

  verifyingBoletoStatus: (): StatusMessage => ({
    status: "processando",
    title: "Verificando status do boleto",
    description: "Consultando boleto existente...",
    ...geracao("carregando_comercializacao"),
  }),

  redirectingToCompetencies: (): StatusMessage => ({
    status: "processando",
    title: "Abrindo lista de competências",
    description: "Carregando lista para consultar boletos...",
    ...consulta("abrindo_consulta"),
  }),

  competenciesLoaded: (): StatusMessage => ({
    status: "processando",
    title: "Lista de competências carregada",
    description: "Verificando filtros de ano...",
    ...consulta("abrindo_consulta"),
  }),

  applyingYearFilter: (year: string): StatusMessage => ({
    status: "processando",
    title: `Filtrando por ano: ${year}`,
    description: "Ajustando filtros...",
    ...consulta("abrindo_consulta"),
  }),

  guideAlreadyExists: (competencia: string): StatusMessage => ({
    status: "ignorado",
    title: `Boleto de ${formatCompetencia(competencia)} já existe`,
    description: "Este boleto já foi gerado com valor. Pulando...",
    ...geracao("baixando_pdf"),
  }),

  guideAlreadyIssued: (competencia: string): StatusMessage => ({
    status: "processando",
    title: `Boleto de ${formatCompetencia(competencia)} já foi gerado`,
    description: "Baixando boleto existente...",
    ...geracao("baixando_pdf"),
  }),

  initializingGuideGeneration: (competencia: string): StatusMessage => ({
    status: "processando",
    title: `Preparando boleto de ${formatCompetencia(competencia)}`,
    description: "As informações estão sendo registradas no eSocial.",
    ...geracao("preparando_competencia"),
  }),

  openingGenerationContext: (competencia: string): StatusMessage => ({
    status: "processando",
    title: "Preparando contexto do eSocial",
    description: `Abrindo a página de pagamentos antes de gerar o DAE de ${formatCompetencia(competencia)}.`,
    ...geracao("preparando_competencia"),
  }),

  reopeningCompetencia: (competencia: string): StatusMessage => ({
    status: "processando",
    title: `Reabrindo competência ${formatCompetencia(competencia)}`,
    description: "Abrindo a folha no eSocial para registrar a nova geração.",
    ...geracao("preparando_competencia"),
  }),

  retryingGuideGeneration: (competencia: string): StatusMessage => ({
    status: "processando",
    title: "Aguardando validação do eSocial",
    description: `O DCTF Web ainda está processando a competência ${formatCompetencia(competencia)}. Tentando novamente em instantes.`,
    ...geracao("carregando_comercializacao"),
  }),

  savingCommercializationDraft: (): StatusMessage => ({
    status: "processando",
    title: "Salvando dados da comercialização",
    description: "Processando informações...",
    ...geracao("carregando_comercializacao"),
  }),

  sendingCommercializationEvents: (): StatusMessage => ({
    status: "processando",
    title: "Enviando informações",
    description: "Completando operação...",
    ...geracao("carregando_comercializacao"),
  }),

  loadingClosureScreen: (): StatusMessage => ({
    status: "processando",
    title: "Carregando tela de encerramento",
    description: "Aguarde...",
    ...geracao("carregando_comercializacao"),
  }),

  closingPayroll: (): StatusMessage => ({
    status: "processando",
    title: "Finalizando folha de pagamento",
    description: "Processando encerramento...",
    ...geracao("carregando_comercializacao"),
  }),

  loadingCommercializationData: (): StatusMessage => ({
    status: "processando",
    title: "Carregando dados de comercialização",
    description: "Recuperando informações...",
    ...geracao("carregando_comercializacao"),
  }),

  pdfDownloadedSuccessfully: (filename: string): StatusMessage => ({
    status: "concluido",
    title: "Boleto salvo com sucesso",
    description: `Arquivo: ${filename}`,
    ...geracao("baixando_pdf"),
  }),

  failedToResolveGuideUrl: (): StatusMessage => ({
    status: "erro",
    title: "Erro ao resolver boleto",
    description: "Não consegui acessar o link do boleto. Tente novamente.",
    ...geracao("carregando_comercializacao"),
  }),

  failedToDownloadGuide: (): StatusMessage => ({
    status: "erro",
    title: "Erro ao baixar boleto",
    description: "O eSocial não retornou o PDF esperado. Tente novamente.",
    ...geracao("baixando_pdf"),
  }),

  failedToGenerateGuide: (): StatusMessage => ({
    status: "erro",
    title: "Erro ao gerar boleto",
    description: "Não foi possível concluir a emissão. Tente novamente.",
    ...geracao("carregando_comercializacao"),
  }),

  caepfNotLinked: (competencia: string): StatusMessage => ({
    status: "erro",
    title: `CAEPF não vinculado ao CEI em ${formatCompetencia(competencia)}`,
    description: "Não existem estabelecimentos CAEPF válidos nesta competência. Vincule ou regularize o CAEPF no eSocial antes de gerar o boleto.",
    ...geracao("carregando_comercializacao"),
  }),

  manualEmitGuideDetected: (): StatusMessage => ({
    status: "processando",
    title: "Baixando PDF do boleto",
    description: "Gerando arquivo...",
    ...geracao("baixando_pdf"),
  }),

  payrollAlreadyClosed: (competencia: string): StatusMessage => ({
    status: "erro",
    title: `Folha de ${formatCompetencia(competencia)} já foi fechada`,
    description: "Será necessário reabrir a folha no eSocial para fazer alterações.",
    ...geracao("preparando_competencia"),
  }),
};
