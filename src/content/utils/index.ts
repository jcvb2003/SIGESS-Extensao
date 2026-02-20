import { State } from '../state';

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function waitFor(cond: () => boolean, timeout = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (cond()) return true;
        if (State.stopRequested) return false;
        await sleep(200);
    }
    return false;
}

export async function waitForElement(selector: string, timeout = 10000, context: HTMLElement | Document = document): Promise<HTMLElement | null> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (State.stopRequested) return null;
        const el = context.querySelector(selector);
        if (el && (el as HTMLElement).clientHeight > 0) return el as HTMLElement;
        await sleep(200);
    }
    return null;
}

export function setReactInput(input: HTMLInputElement, value: string) {
    const tracker = (input as any)._valueTracker;
    if (tracker) tracker.setValue(value);
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) nativeInputValueSetter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
}

export function highlightError(element: HTMLElement) {
    element.style.border = "2px solid red";
    element.style.backgroundColor = "#ffe6e6";
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function fillAutocomplete(container: HTMLElement, value: string) {
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    if (!input) return false;

    // Focus and clear
    input.focus();
    setReactInput(input, "");
    await sleep(200);

    // Type the value
    setReactInput(input, value);

    // Trigger multiple keyboard events to wake up suggestions
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }));

    await sleep(2000);

    // Find list element - multiple strategies
    const findList = (): HTMLElement | null => {
        // 1. Direct child of container
        let list = container.querySelector('.br-list') as HTMLElement;
        if (list && list.children.length > 0) return list;

        // 2. Sibling of container (less common)
        list = container.nextElementSibling as HTMLElement;
        if (list?.classList?.contains('br-list') && list.children.length > 0) return list;

        // 3. Any visible list in document
        const allLists = document.querySelectorAll('.br-list');
        for (const l of allLists) {
            if ((l as HTMLElement).offsetHeight > 0 && l.children.length > 0) return l as HTMLElement;
        }

        return null;
    };

    const findItem = (list: HTMLElement | null) => {
        if (!list) return null;
        const items = Array.from(list.querySelectorAll('.br-item, [role="option"], div[tabindex]'));
        return items.find(el => el.textContent?.toLowerCase().includes(value.toLowerCase())) as HTMLElement;
    };

    let listElement = findList();
    let item = findItem(listElement);

    // If no item, try clicking the search button
    if (!item) {
        const trigger = container.querySelector('button[data-trigger]') as HTMLElement;
        if (trigger) {
            trigger.click();
            await sleep(1500);
            listElement = findList();
            item = findItem(listElement);
        }
    }

    if (item) {
        // Scroll into view
        item.scrollIntoView({ block: 'center' });
        await sleep(100);

        // Find radio and label inside the item
        const radioInput = item.querySelector('input[type="radio"]') as HTMLInputElement;
        const label = item.querySelector('label') as HTMLElement;

        if (radioInput) {
            radioInput.checked = true;
            radioInput.dispatchEvent(new Event('change', { bubbles: true }));
            radioInput.dispatchEvent(new Event('input', { bubbles: true }));
            radioInput.click();
        }

        if (label) {
            label.click();
        }

        // Also click the item itself
        item.click();

        await sleep(500);
        input.blur();
        return true;
    }

    return false;
}

export async function selectOption(containerSelector: string | HTMLElement, valueOrText: string) {
    let container: HTMLElement | null;
    if (typeof containerSelector === 'string') container = document.querySelector(containerSelector);
    else container = containerSelector;
    if (!container) return false;

    const inputs = Array.from(container.querySelectorAll('input'));
    const matchingInput = inputs.find(i => i.value === valueOrText);
    if (matchingInput) {
        if (!matchingInput.checked) {
            const label = container.querySelector(`label[for="${matchingInput.id}"]`) as HTMLElement;
            if (label) label.click(); else matchingInput.click();
        }
        return true;
    }

    const labels = Array.from(container.querySelectorAll('label'));
    const targetLabel = labels.find(l => l.textContent?.trim().includes(valueOrText));
    if (targetLabel) { targetLabel.click(); return true; }

    const trigger = container.querySelector('button[data-trigger]');
    if (trigger) {
        (trigger as HTMLElement).click();
        await sleep(500);
        const list = container.parentElement?.querySelector('.br-list') || container.querySelector('.br-list') || document.querySelector('.br-list');
        if (list) {
            const listLabel = Array.from(list.querySelectorAll('label, .br-item')).find(l => l.textContent?.trim().includes(valueOrText));
            if (listLabel) { (listLabel as HTMLElement).click(); return true; }
        }
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
    selectOption
};
