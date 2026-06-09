import { Utils } from "../utils/dom-utils";
import { IWorkflowManager } from "../types";
import { getReapStateLabel, normalizeReapSettings } from "../reap-settings";

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

function getFieldValue(inputName: string) {
  const input = document.querySelector<HTMLInputElement>(`input[name="${inputName}"]`);
  return normalizeText(input?.value);
}

export const Page2 = {
  isCurrentPage: () => !!document.querySelector('input[name="prestacaoServico"]'),
  execute: async (_manager: IWorkflowManager) => {
    console.log("REAP: Executando Pagina 2...");

    const rawSettings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
    const settings = normalizeReapSettings(rawSettings);
    const desiredRelation = settings.mpaWorkRelation || "Economia Familiar";
    const desiredStates = (settings.mpaCommercializationStates || [5])
      .map((stateCode) => getReapStateLabel(stateCode))
      .filter(Boolean);

    const currentRelation = getFieldValue("prestacaoServico");
    const currentStates = getFieldValue("estadosComercializacao");

    const hasDesiredRelation =
      !desiredRelation || currentRelation.includes(normalizeText(desiredRelation));
    const hasDesiredStates =
      desiredStates.length === 0 ||
      desiredStates.every((stateLabel) => currentStates.includes(normalizeText(stateLabel)));

    if (!hasDesiredRelation) {
      const relationSelect = document
        .querySelector('input[name="prestacaoServico"]')
        ?.closest<HTMLElement>(".br-select");
      if (relationSelect) {
        await Utils.selectOption(relationSelect, desiredRelation);
      }
    }

    if (!hasDesiredStates) {
      const statesSelect = document
        .querySelector('input[name="estadosComercializacao"]')
        ?.closest<HTMLElement>(".br-select");
      if (statesSelect) {
        for (const stateLabel of desiredStates) {
          await Utils.selectOption(statesSelect, stateLabel);
          await Utils.sleep(150);
        }
      }
    }

    toggleCheckboxByText("gruposAlvo", "Peixes");
    toggleCheckboxByText("compradoresPescado", "Venda direta ao consumidor");

    await Utils.sleep(1000);
    document.querySelector<HTMLElement>('button[data-action="avancar"]')?.click();
  },
};
