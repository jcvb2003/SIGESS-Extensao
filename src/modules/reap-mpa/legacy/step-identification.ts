import { Utils } from '../utils/dom-utils';
import { IWorkflowManager } from "../types";
import { MUNICIPIOS_LIST } from '../../../shared/data/municipios';
import { getReapStateLabel, normalizeReapSettings } from '../reap-settings';

export const Page1 = {
  isCurrentPage: () =>
    !!document.querySelector('input[name="anoReferencia"]') &&
    !!document.querySelector('input[name="codigoRGP"]'),
  execute: async (manager: IWorkflowManager) => {
    console.log("REAP: Validando Página 1 (legacy)...");

    const rawSettings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
    const settings = normalizeReapSettings(rawSettings);
    const municipio = MUNICIPIOS_LIST.find(m => m.id === settings.mpaMunicipio);
    const municipioName = municipio?.nome || "";
    const anoReferencia = settings.mpaReferenceYear || "2025";
    const ufLabel = getReapStateLabel(settings.mpaResidenceUF) || "PARA";

    const validate = (name: string, expected: string) => {
      const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      if (input && !input.value.toUpperCase().includes(expected.toUpperCase())) {
        Utils.highlightError(input.parentElement || input);
        return true;
      }
      return false;
    };

    if (
      validate("anoReferencia", anoReferencia) ||
      validate("uf", ufLabel) ||
      validate("municipio", municipioName)
    ) {
      alert("PAUSADO: Verifique campos em vermelho e avance manualmente.");
      manager.stop();
      return;
    }

    (document.querySelector('button[data-action="avancar"]') as HTMLElement)?.click();
  },
};
