import { Utils } from '../utils/dom-utils';
import { IWorkflowManager } from "../types";
import { getReapStateLabel, normalizeReapSettings } from '../reap-settings';

export const Page2 = {
  isCurrentPage: () =>
    !!document.querySelector('input[name="prestacaoServico"]'),
  execute: async (_manager: IWorkflowManager) => {
    console.log("REAP: Executando Página 2 (legacy)...");

    const rawSettings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
    const settings = normalizeReapSettings(rawSettings);
    const workRelation = settings.mpaWorkRelation || "Economia Familiar";
    const commState = getReapStateLabel(settings.mpaCommercializationStates?.[0]) || "PARA";

    const inputRelacao = document.querySelector<HTMLInputElement>('input[name="prestacaoServico"]');
    const inputEstados = document.querySelector<HTMLInputElement>('input[name="estadosComercializacao"]');

    const isAlreadyFilled = (inputRelacao?.value?.trim() !== "") || (inputEstados?.value?.trim() !== "");
    if (isAlreadyFilled) {
      console.log('REAP: Página 2 já preenchida. Avançando para Página 3.');
      const btn = document.querySelector<HTMLElement>('button[data-action="avancar"]');
      if (btn) btn.click();
      return;
    }

    const divRelacao = document
      .querySelector('input[name="prestacaoServico"]')
      ?.closest<HTMLElement>(".br-select");
    if (divRelacao) await Utils.selectOption(divRelacao, workRelation);

    const divEstados = document
      .querySelector('input[name="estadosComercializacao"]')
      ?.closest<HTMLElement>(".br-select");
    if (divEstados) await Utils.selectOption(divEstados, commState);

    const checkPeixes = document.querySelector<HTMLInputElement>('input[name="gruposAlvo"][value="5"]');
    if (checkPeixes && !checkPeixes.checked)
      document.querySelector(`label[for="${checkPeixes.id}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const checkVenda = document.querySelector<HTMLInputElement>('input[name="compradoresPescado"][value="6"]');
    if (checkVenda && !checkVenda.checked)
      document.querySelector(`label[for="${checkVenda.id}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Utils.sleep(1000);
    (document.querySelector<HTMLElement>('button[data-action="avancar"]'))?.click();
  },
};
