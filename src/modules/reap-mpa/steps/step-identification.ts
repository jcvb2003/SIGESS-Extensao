import { Utils } from '../utils/dom-utils';
import { IWorkflowManager } from "../types";
export const Page1 = {
  isCurrentPage: () =>
    !!document.querySelector('input[name="anoReferencia"]') &&
    !!document.querySelector('input[name="codigoRGP"]'),
  execute: async (manager: IWorkflowManager) => {
    console.log("REAP: Validando Página 1...");
    const validate = (name: string, expected: string) => {
      const input = document.querySelector(
        `input[name="${name}"]`,
      ) as HTMLInputElement;
      if (
        input &&
        !input.value.toUpperCase().includes(expected.toUpperCase())
      ) {
        Utils.highlightError(input.parentElement || input);
        return true;
      }
      return false;
    };
    if (
      validate("anoReferencia", "2025") ||
      validate("uf", "PARA") ||
      validate("municipio", "Oeiras")
    ) {
      alert("PAUSADO: Verifique campos em vermelho e avance manualmente.");
      manager.stop();
      return;
    }
    (
      document.querySelector('button[data-action="avancar"]') as HTMLElement
    )?.click();
  },
};
