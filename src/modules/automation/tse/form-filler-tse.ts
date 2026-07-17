import { PessoaData } from "../../../shared/types";

let _tseFillDone = false;
let _tseSubmitDone = false;
let _tseFormObserver: MutationObserver | null = null;
let _tseOutcomeObserver: MutationObserver | null = null;
const TSE_RESULT_HASH = "#/atendimento-eleitor/consultar-numero-titulo-eleitor";

/**
 * Reseta o guard de preenchimento para permitir nova execução em navegações SPA.
 */
export function resetTseFillGuard(): void {
  _tseFillDone = false;
  _tseSubmitDone = false;
  _tseFormObserver?.disconnect();
  _tseOutcomeObserver?.disconnect();
  _tseFormObserver = null;
  _tseOutcomeObserver = null;
}

/**
 * Preenche automaticamente o formulário de autenticação do TSE
 * (Consulta de Título Eleitoral) com dados já capturados.
 */
export function fillTseAuthForm(
  data: Partial<PessoaData>,
  options: { submit?: boolean } = {},
): void {
  if (_tseFillDone) return;

  const cpfField = document.getElementById('titulo-cpf-nome');
  if (!cpfField) {
    // Modal ainda não abriu — tentar em 500ms sem marcar como done
    observeTseForm(data, options);
    return;
  }

  _tseFillDone = true;
  console.log("SIGESS: Iniciando preenchimento no portal TSE...");

  // CPF no campo principal
  if (data.cpf) {
    setAngularInput('titulo-cpf-nome', data.cpf);
  }

  // Data de nascimento: ISO → DD/MM/YYYY (o campo tem máscara)
  if (data.dataDeNascimento) {
    const formatted = data.dataDeNascimento
      .replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1');
    setAngularInput('dataNascimento', formatted);
  }

  // Nome da mãe e pai
  if (data.mae) setAngularInput('nomeMae', data.mae);
  if (data.pai) setAngularInput('nomePai', data.pai);

  // Select de filiação — determinar opção correta
  const tipoFiliacao = resolveTipoFiliacao(data);
  if (tipoFiliacao) setAngularSelect(tipoFiliacao);
  if (options.submit !== false) {
    submitTseQueryWhenReady();
    observeTseOutcome();
  }
}

function observeTseForm(
  data: Partial<PessoaData>,
  options: { submit?: boolean },
): void {
  if (_tseFormObserver) return;
  _tseFormObserver = new MutationObserver(() => {
    if (!document.getElementById('titulo-cpf-nome')) return;
    _tseFormObserver?.disconnect();
    _tseFormObserver = null;
    fillTseAuthForm(data, options);
  });
  _tseFormObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function submitTseQueryWhenReady(): void {
  const submit = () => {
    if (_tseSubmitDone) return true;
    const button = document.querySelector<HTMLButtonElement>('button[data-cy="bt-entrar"]');
    if (!button || button.disabled) return false;
    _tseSubmitDone = true;
    button.click();
    return true;
  };

  if (submit()) return;
  const observer = new MutationObserver(() => {
    if (!submit()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
}

/**
 * Depois do envio, a única rota válida é a tela que expõe os dados eleitorais.
 * A conclusão ainda depende do payload coletado pela bridge; a rota apenas
 * impede que um redirecionamento inesperado seja tratado como sucesso.
 */
export function validateTseResultRoute(url: string): void {
  if (!_tseSubmitDone || url.includes(TSE_RESULT_HASH)) return;
  reportTseOutcome("failed", "redirecionamento_tse_inesperado");
}

function observeTseOutcome(): void {
  if (_tseOutcomeObserver) return;
  const check = () => {
    if (!_tseSubmitDone) return;
    const text = document.body?.innerText || "";
    if (text.includes("nível de acesso obtido é menor do que o exigido")) {
      reportTseOutcome("not_found", "dados_divergentes_justica_eleitoral");
    } else if (text.includes("Não foi possível localizar um eleitor com os dados informados")) {
      reportTseOutcome("not_found", "eleitor_nao_localizado");
    }
  };
  _tseOutcomeObserver = new MutationObserver(check);
  _tseOutcomeObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  check();
}

function reportTseOutcome(
  outcome: "not_found" | "failed",
  reason: string,
): void {
  const api = (globalThis as any).browser || (globalThis as any).chrome;
  void api?.runtime?.sendMessage?.({
    action: "REPORT_CADASTRO_PORTAL_OUTCOME",
    portal: "tse",
    outcome,
    reason,
  });
  _tseOutcomeObserver?.disconnect();
  _tseOutcomeObserver = null;
}

function resolveTipoFiliacao(data: Partial<PessoaData>): string | null {
  const temMae = !!data.mae;
  const temPai = !!data.pai;
  if (temMae && temPai) return 'UMA_MAE_UM_PAI';
  if (temMae) return 'UMA_MAE';
  if (temPai) return 'UM_PAI';
  return null;
}

function setAngularInput(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  // SEM blur — deixar o usuário editar livremente após o preenchimento automático
}

function setAngularSelect(value: string): void {
  const select = document.querySelector<HTMLSelectElement>(
    'select[formcontrolname="tipoFiliacao"]'
  );
  if (!select) {
    console.warn("SIGESS: Select de filiação do TSE não encontrado.");
    return;
  }
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
