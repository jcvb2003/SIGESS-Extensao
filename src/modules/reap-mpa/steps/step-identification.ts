import { Utils } from '../utils/dom-utils';
import { IWorkflowManager } from "../types";
import { MUNICIPIOS_LIST } from '../../../shared/data/municipios';

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function getFieldValueByLabel(labelText: string) {
  const expectedLabel = normalizeText(labelText);
  const labels = Array.from(document.querySelectorAll("label"));

  for (const label of labels) {
    if (normalizeText(label.textContent) !== expectedLabel) continue;

    const forId = label.getAttribute("for");
    if (forId) {
      const linkedField = document.getElementById(forId) as HTMLInputElement | null;
      if (linkedField) {
        return linkedField.value || linkedField.getAttribute("data-displayvalue") || "";
      }
    }

    const wrapper = label.closest(".br-input, .input-label")?.parentElement;
    const field = wrapper?.querySelector("input") as HTMLInputElement | null;
    if (field) {
      return field.value || field.getAttribute("data-displayvalue") || "";
    }
  }

  return "";
}

function highlightFieldByLabel(labelText: string) {
  const expectedLabel = normalizeText(labelText);
  const labels = Array.from(document.querySelectorAll("label"));
  const targetLabel = labels.find(
    (label) => normalizeText(label.textContent) === expectedLabel,
  ) as HTMLElement | undefined;

  if (!targetLabel) return;

  const wrapper = targetLabel.closest(".br-input, .br-select, .input-label") as HTMLElement | null;
  Utils.highlightError(wrapper || targetLabel);
}

export const Page1 = {
  isCurrentPage: () =>
    Array.from(document.querySelectorAll("h4")).some((heading) =>
      normalizeText(heading.textContent).includes("SITUACAO DO(A) PESCADOR(A)"),
    ) &&
    getFieldValueByLabel("Nº do RGP") !== "",
  execute: async (manager: IWorkflowManager) => {
    console.log("REAP: Validando PÃ¡gina 1...");

    const settings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
    const municipio = MUNICIPIOS_LIST.find((m) => m.id === settings.mpaMunicipio);
    const municipioName = municipio?.nome || "";

    const validations: Array<[string, string]> = [
      ["Estado de residência", "PARA"],
      ["Município de residência", municipioName],
      ["Categoria", "Artesanal"],
      ["Forma de atuação", "Desembarcado"],
    ];

    const hasMismatch = validations.some(([label, expected]) => {
      const value = getFieldValueByLabel(label);
      if (!value || normalizeText(value).includes(normalizeText(expected))) {
        return false;
      }

      highlightFieldByLabel(label);
      return true;
    });

    if (hasMismatch) {
      alert("PAUSADO: Verifique campos em vermelho e avance manualmente.");
      manager.stop();
      return;
    }

    (
      document.querySelector('button[data-action="avancar"]') as HTMLElement
    )?.click();
  },
};
