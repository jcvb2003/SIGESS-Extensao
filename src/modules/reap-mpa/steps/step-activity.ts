import { Utils } from '../utils/dom-utils';
import { IWorkflowManager } from "../types";
export const Page2 = {
  isCurrentPage: () =>
    !!document.querySelector('input[name="prestacaoServico"]'),
  execute: async (_manager: IWorkflowManager) => {
    console.log("REAP: Executando Página 2...");
    const divRelacao = document
      .querySelector('input[name="prestacaoServico"]')
      ?.closest(".br-select") as HTMLElement;
    if (divRelacao) await Utils.selectOption(divRelacao, "Economia Familiar");
    const divEstados = document
      .querySelector('input[name="estadosComercializacao"]')
      ?.closest(".br-select") as HTMLElement;
    if (divEstados) await Utils.selectOption(divEstados, "PARA");
    const checkPeixes = document.querySelector(
      'input[name="gruposAlvo"][value="5"]',
    ) as HTMLInputElement;
    if (checkPeixes && !checkPeixes.checked)
      document
        .querySelector(`label[for="${checkPeixes.id}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const checkVenda = document.querySelector(
      'input[name="compradoresPescado"][value="6"]',
    ) as HTMLInputElement;
    if (checkVenda && !checkVenda.checked)
      document
        .querySelector(`label[for="${checkVenda.id}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Utils.sleep(1000);
    (
      document.querySelector('button[data-action="avancar"]') as HTMLElement
    )?.click();
  },
};
