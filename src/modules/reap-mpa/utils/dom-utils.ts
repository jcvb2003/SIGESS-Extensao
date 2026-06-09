import { State } from '../session-state';
import * as DomHelpers from '../../../shared/utils/dom-helpers';

export const sleep = DomHelpers.sleep;
export const simulateClick = DomHelpers.simulateClick;
export const setReactInput = DomHelpers.setReactInput;
export const highlightError = DomHelpers.highlightError;

// Injetores automáticos de Estado (para cancelar em caso de Pausa no MPA)
export const waitFor = (cond: () => boolean, timeout = 10000) => 
  DomHelpers.waitFor(cond, timeout, State);

export const waitForElement = (
  selector: string, 
  timeout = 10000, 
  context: HTMLElement | Document = document, 
  mustBeVisible = true
) => DomHelpers.waitForElement(selector, timeout, context, mustBeVisible, State);

export const fillAutocomplete = (container: HTMLElement, value: string) =>
  DomHelpers.fillAutocomplete(container, value, State);

export const selectOption = (containerSelector: string | HTMLElement, valueOrText: string) =>
  DomHelpers.selectOption(containerSelector, valueOrText, State);

export function clickAvancar() {
  const btn = Array.from(
    document.querySelectorAll<HTMLElement>('button[data-action="avancar"]'),
  ).find((b) => b.offsetParent !== null);
  btn?.click();
}

export const Utils = {
  sleep,
  waitFor,
  waitForElement,
  setReactInput,
  highlightError,
  fillAutocomplete,
  selectOption,
  simulateClick,
  clickAvancar,
};
