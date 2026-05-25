export class DOMInjector {
  static async execute<T>(
    tabId: number,
    func: (...args: any[]) => T,
    args: any[] = [],
  ): Promise<T> {
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: func as any,
        args: args,
      });
      return results[0]?.result as T;
    } catch (error) {
      console.error(`DOMInjector Error (Tab ${tabId}):`, error);
      throw error;
    }
  }

  static async setInputValue(
    tabId: number,
    selector: string,
    value: string,
  ): Promise<void> {
    await this.execute(
      tabId,
      (sel, val) => {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (!input) throw new Error(`Elemento ${sel} não encontrado`);

        input.focus();

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, "");
          nativeInputValueSetter.call(input, val);
        } else {
          input.value = "";
          input.value = val;
        }

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      },
      [selector, value],
    );
  }

  static async clickElement(tabId: number, selector: string): Promise<void> {
    await this.execute(
      tabId,
      (sel) => {
        const element = document.querySelector(sel) as HTMLElement;
        if (!element) throw new Error(`Elemento ${sel} não encontrado`);
        element.click();
      },
      [selector],
    );
  }

  static async waitForElement(
    tabId: number,
    selector: string,
    timeoutMs: number = 20000,
  ): Promise<boolean> {
    const pollInterval = 150;
    let attempts = 0;
    const maxAttempts = timeoutMs / pollInterval;

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const exists = await this.execute(
            tabId,
            (sel) => {
              const el = document.querySelector(sel) as HTMLElement | null;
              return !!el && el.offsetParent !== null;
            },
            [selector],
          );

          if (exists) {
            clearInterval(interval);
            resolve(true);
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            reject(new Error(`Timeout esperando elemento: ${selector}`));
          }

          attempts++;
        } catch (e) {
          clearInterval(interval);
          reject(e);
        }
      }, pollInterval);
    });
  }

  static async waitForAnyElement(
    tabId: number,
    selectors: string[],
    timeoutMs: number = 20000,
  ): Promise<string | null> {
    const pollInterval = 150;
    let attempts = 0;
    const maxAttempts = timeoutMs / pollInterval;

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const matchedSelector = await this.execute(
            tabId,
            (list) => {
              for (const selector of list) {
                const el = document.querySelector(selector) as HTMLElement | null;
                if (el && el.offsetParent !== null) {
                  return selector;
                }
              }
              return null;
            },
            [selectors],
          );

          if (matchedSelector) {
            clearInterval(interval);
            resolve(matchedSelector);
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            reject(
              new Error(`Timeout esperando um dos elementos: ${selectors.join(", ")}`),
            );
          }

          attempts++;
        } catch (e) {
          clearInterval(interval);
          reject(e);
        }
      }, pollInterval);
    });
  }
}
