export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function simulateClick(element: HTMLElement) {
  const events = ["mousedown", "mouseup", "click"];
  events.forEach((evt) => {
    const mouseEvt = new MouseEvent(evt, {
      bubbles: true,
      cancelable: true,
      view: globalThis as unknown as Window,
      detail: 1,
    });
    element.dispatchEvent(mouseEvt);
  });
}

export async function waitFor(
  cond: () => boolean,
  timeout = 10000,
  signal?: { stopRequested?: boolean }
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (cond()) return true;
    if (signal?.stopRequested) return false;
    await sleep(200);
  }
  return false;
}

export async function waitForElement(
  selector: string,
  timeout = 10000,
  context: HTMLElement | Document = document,
  mustBeVisible = true,
  signal?: { stopRequested?: boolean }
): Promise<HTMLElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (signal?.stopRequested) return null;
    const el = context.querySelector(selector);
    if (el) {
      if (!mustBeVisible || (el as HTMLElement).clientHeight > 0)
        return el as HTMLElement;
    }
    await sleep(200);
  }
  return null;
}

export function setReactInput(input: HTMLInputElement, value: string) {
  const tracker = (input as any)._valueTracker;
  if (tracker) tracker.setValue(value);
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (nativeInputValueSetter) nativeInputValueSetter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

export function highlightError(element: HTMLElement) {
  element.style.border = "2px solid red";
  element.style.backgroundColor = "#ffe6e6";
  element.scrollIntoView({ behavior: "smooth", block: "center" });
}

export async function fillAutocomplete(
  container: HTMLElement, 
  value: string,
  signal?: { stopRequested?: boolean }
) {
  const input = container.querySelector<HTMLInputElement>(
    'input[type="text"]',
  );
  if (!input) return false;
  input.focus();
  setReactInput(input, "");
  await sleep(200);
  setReactInput(input, value);
  const events = ["input", "change"];
  events.forEach((type) =>
    input.dispatchEvent(new Event(type, { bubbles: true })),
  );
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  ["keydown", "keyup"].forEach((type) => {
    input.dispatchEvent(
      new KeyboardEvent(type, { key: "ArrowDown", bubbles: true }),
    );
  });
  
  const findList = () => {
    const internal = container.querySelector(".br-list");
    if (internal && internal.children.length > 0)
      return internal as HTMLElement;
    const sibling = container.nextElementSibling;
    if (
      sibling &&
      sibling.classList.contains("br-list") &&
      sibling.children.length > 0
    )
      return sibling as HTMLElement;
    const allLists = Array.from(document.querySelectorAll(".br-list"));
    return allLists.find(
      (l) => (l as HTMLElement).offsetHeight > 0 && l.children.length > 0,
    ) as HTMLElement;
  };
  
  const findItem = () => {
    const list = findList();
    if (!list) return null;
    const items = Array.from(
      list.querySelectorAll('.br-item, [role="option"], li'),
    );
    return items.find((el) =>
      el.textContent?.toLowerCase().includes(value.toLowerCase()),
    ) as HTMLElement;
  };
  
  let item = (await waitFor(() => findItem() !== null, 4000, signal))
    ? findItem()
    : null;
    
  if (!item) {
    const trigger = container.querySelector<HTMLButtonElement>(
      "button[data-trigger]",
    );
    if (trigger) {
      trigger.click();
      await waitFor(() => findItem() !== null, 2500, signal);
      item = findItem();
    }
  }
  
  if (item) {
    item.scrollIntoView({ block: "nearest" });
    const radioInput = item.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    );
    const label = item.querySelector("label") as HTMLElement;
    if (radioInput) {
      radioInput.checked = true;
      radioInput.dispatchEvent(new Event("change", { bubbles: true }));
      radioInput.click();
    } else if (label) {
      label.click();
    } else {
      item.click();
    }
    await sleep(400);
    input.blur();
    return true;
  }
  console.warn(`Autocomplete: Item "${value}" não encontrado.`);
  return false;
}

function findInList(container: HTMLElement, text: string): boolean {
  const list =
    container.parentElement?.querySelector(".br-list") ||
    container.querySelector(".br-list") ||
    document.body.querySelector(".br-list");
  if (!list) return false;
  
  const listLabel = Array.from(list.querySelectorAll("label, .br-item")).find(
    (l) => l.textContent?.trim().includes(text),
  );
  if (listLabel) {
    (listLabel as HTMLElement).click();
    return true;
  }
  return false;
}

export async function selectOption(
  containerSelector: string | HTMLElement,
  valueOrText: string,
  signal?: { stopRequested?: boolean }
) {
  const container =
    typeof containerSelector === "string"
      ? document.querySelector<HTMLElement>(containerSelector)
      : containerSelector;
      
  if (!container || signal?.stopRequested) return false;
  
  const inputs = Array.from(container.querySelectorAll("input"));
  const matchingInput = inputs.find((i) => i.value === valueOrText);
  if (matchingInput) {
    if (!matchingInput.checked) {
      const label = container.querySelector<HTMLElement>(
        `label[for="${matchingInput.id}"]`,
      );
      if (label) label.click();
      else {
        matchingInput.checked = true;
        matchingInput.dispatchEvent(new Event("change", { bubbles: true }));
        matchingInput.dispatchEvent(new Event("input", { bubbles: true }));
        matchingInput.click();
      }
    }
    return true;
  }
  
  const labels = Array.from(container.querySelectorAll("label"));
  const targetLabel = labels.find((l) =>
    l.textContent?.trim().includes(valueOrText),
  );
  if (targetLabel) {
    targetLabel.click();
    return true;
  }
  
  if (findInList(container, valueOrText)) return true;
  
  const trigger = container.querySelector<HTMLElement>("button[data-trigger]");
  if (trigger) {
    trigger.click();
    await sleep(800);
    if (findInList(container, valueOrText)) return true;
  }
  return false;
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
};
