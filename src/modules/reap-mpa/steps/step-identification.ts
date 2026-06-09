import { Utils, clickAvancar } from "../utils/dom-utils";
import { IWorkflowManager } from "../types";
import { MUNICIPIOS_LIST } from "../../../shared/data/municipios";
import { getReapStateLabel, normalizeReapSettings } from "../reap-settings";

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
    console.log("REAP: Validando Pagina 1...");

    const rawSettings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
    const settings = normalizeReapSettings(rawSettings);
    const municipio = MUNICIPIOS_LIST.find((m) => m.id === settings.mpaResidenceMunicipio);
    const municipioName = municipio?.nome || "";
    const estadoResidencia = getReapStateLabel(settings.mpaResidenceUF);

    const validations: Array<[string, string]> = [
      ["Estado de residência", estadoResidencia],
      ["Município de residência", municipioName],
      ["Categoria", "Artesanal"],
      ["Forma de atuação", "Desembarcado"],
    ];

    // Valida ano de referência (obrigatório)
    const anoEsperado = settings.mpaReferenceYear || "";
    if (!anoEsperado) {
      alert("PAUSADO: Configure o Ano de Referência do REAP no painel de configurações.");
      manager.stop();
      return;
    }
    const anoFeedback = Array.from(document.querySelectorAll("div.feedback.info")).find((el) =>
      normalizeText(el.textContent).includes("ANO DE REFERENCIA DO REAP"),
    );
    const anoMatch = normalizeText(anoFeedback?.textContent).match(/\d{4}/);
    const anoReferencia = anoMatch ? anoMatch[0] : null;
    if (anoReferencia && anoReferencia !== anoEsperado) {
      anoFeedback && Utils.highlightError(anoFeedback as HTMLElement);
      alert(`PAUSADO: Ano de referência do REAP é ${anoReferencia}, esperado ${anoEsperado}. Verifique e avance manualmente.`);
      manager.stop();
      return;
    }

    const hasMismatch = validations.some(([label, expected]) => {
      if (!expected) return false;

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

    clickAvancar();
  },
};
