export interface StatusMessage {
  status: "processando" | "concluido" | "ignorado" | "erro";
  title: string;
  description: string;
}

function formatCompetencia(competencia: string): string {
  return /^\d{6}$/.test(competencia)
    ? `${competencia.slice(4, 6)}/${competencia.slice(0, 4)}`
    : competencia;
}

export const esocialMessages = {
  startingCompetencia: (competencia: string, index: number, total: number): StatusMessage => ({
    status: "processando",
    title: `Preparando competência ${index} de ${total}`,
    description: `Iniciando a geração do DAE de ${formatCompetencia(competencia)}.`,
  }),

  competenciaConcluida: (competencia: string, index: number, total: number): StatusMessage => ({
    status: "processando",
    title: `Competência ${index} de ${total} concluída`,
    description: index < total
      ? `Boleto de ${formatCompetencia(competencia)} salvo. Iniciando a próxima competência.`
      : `Boleto de ${formatCompetencia(competencia)} salvo.`,
  }),

  allCompetenciasCompleted: (total: number): StatusMessage => ({
    status: "concluido",
    title: "Geração concluída",
    description: `${total} competência(s) processada(s) com sucesso.`,
  }),

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
    title: `Boleto de ${formatCompetencia(competencia)} já existe`,
    description: "Este boleto já foi gerado com valor. Pulando...",
  }),

  guideAlreadyIssued: (competencia: string): StatusMessage => ({
    status: "processando",
    title: `Boleto de ${formatCompetencia(competencia)} já foi gerado`,
    description: "Baixando boleto existente...",
  }),

  initializingGuideGeneration: (competencia: string): StatusMessage => ({
    status: "processando",
    title: `Preparando boleto de ${formatCompetencia(competencia)}`,
    description: "As informações estão sendo registradas no eSocial.",
  }),

  openingGenerationContext: (competencia: string): StatusMessage => ({
    status: "processando",
    title: "Preparando contexto do eSocial",
    description: `Abrindo a página de pagamentos antes de gerar o DAE de ${formatCompetencia(competencia)}.`,
  }),

  reopeningCompetencia: (competencia: string): StatusMessage => ({
    status: "processando",
    title: `Reabrindo competência ${formatCompetencia(competencia)}`,
    description: "Abrindo a folha no eSocial para registrar a nova geração.",
  }),

  retryingGuideGeneration: (competencia: string): StatusMessage => ({
    status: "processando",
    title: "Aguardando validação do eSocial",
    description: `O DCTF Web ainda está processando a competência ${formatCompetencia(competencia)}. Tentando novamente em instantes.`,
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

  pdfDownloadedSuccessfully: (filename: string): StatusMessage => ({
    status: "concluido",
    title: "Boleto salvo com sucesso",
    description: `Arquivo: ${filename}`,
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
    description: "Não foi possível concluir a emissão. Tente novamente.",
  }),

  manualEmitGuideDetected: (): StatusMessage => ({
    status: "processando",
    title: "Baixando PDF do boleto",
    description: "Gerando arquivo...",
  }),

  payrollAlreadyClosed: (competencia: string): StatusMessage => ({
    status: "erro",
    title: `Folha de ${formatCompetencia(competencia)} já foi fechada`,
    description: "Será necessário reabrir a folha no eSocial para fazer alterações.",
  }),
};
