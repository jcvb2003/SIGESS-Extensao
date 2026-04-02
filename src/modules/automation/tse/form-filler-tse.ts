import { PessoaData } from "../../../shared/types";

let _tseFillDone = false;

/**
 * Reseta o guard de preenchimento para permitir nova execução em navegações SPA.
 */
export function resetTseFillGuard(): void {
  _tseFillDone = false;
}

/**
 * Preenche automaticamente o formulário de autenticação do TSE
 * (Consulta de Título Eleitoral) com dados já capturados.
 */
export function fillTseAuthForm(data: Partial<PessoaData>): void {
  if (_tseFillDone) return;

  const cpfField = document.getElementById('titulo-cpf-nome');
  if (!cpfField) {
    // Modal ainda não abriu — tentar em 500ms sem marcar como done
    setTimeout(() => fillTseAuthForm(data), 500);
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
