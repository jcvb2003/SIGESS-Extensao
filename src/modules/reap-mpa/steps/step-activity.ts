import { Utils } from '../utils/dom-utils';
import { IWorkflowManager } from "../types";

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toggleCheckboxByText(groupName: string, expectedText: string) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[name="${groupName}"]`),
  );
  const target = inputs.find((input) => {
    const container = input.closest(".br-checkbox");
    const text = container?.textContent || "";
    return normalizeText(text).includes(normalizeText(expectedText));
  });

  if (target && !target.checked) {
    document
      .querySelector(`label[for="${target.id}"]`)
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
}

export const Page2 = {
  isCurrentPage: () =>
    !!document.querySelector('input[name="prestacaoServico"]'),
  execute: async (_manager: IWorkflowManager) => {
    console.log("REAP: Executando Página 2...");

    const inputRelacao = document.querySelector<HTMLInputElement>('input[name="prestacaoServico"]');
    const inputEstados = document.querySelector<HTMLInputElement>('input[name="estadosComercializacao"]');
    
    // Se a relação ou os estados já estiverem preenchidos, assumimos que a página está pronta
    const isAlreadyFilled = (inputRelacao?.value?.trim() !== "") || (inputEstados?.value?.trim() !== "");

    if (isAlreadyFilled) {
      console.log('REAP: Página 2 já preenchida (detectado via inputs). Avançando para Página 3.');
      const btn = document.querySelector<HTMLElement>('button[data-action="avancar"]');
      if (btn) btn.click();
      return;
    }

    const divRelacao = document
      .querySelector('input[name="prestacaoServico"]')
      ?.closest<HTMLElement>(".br-select");
    if (divRelacao) await Utils.selectOption(divRelacao, "Economia Familiar");
    const divEstados = document
      .querySelector('input[name="estadosComercializacao"]')
      ?.closest<HTMLElement>(".br-select");
    if (divEstados) await Utils.selectOption(divEstados, "PARA");
    toggleCheckboxByText("gruposAlvo", "Peixes");
    toggleCheckboxByText("compradoresPescado", "Venda direta ao consumidor");
    await Utils.sleep(1000);
    (
      document.querySelector<HTMLElement>('button[data-action="avancar"]')
    )?.click();
  },
};
