import type { CadastroPortalRuntimeContext } from "./contracts";

const GOVBR_HOST = "sso.acesso.gov.br";
const GOVBR_AUTHORIZE_PATH = "/authorize";
const GOVBR_APPROVAL_SELECTOR = 'button[name="user_oauth_approval"][value="true"]';
const GOVBR_CONTACT_SELECTOR = "#contact-validation";

export class GovBrConsentRuntime {
  private contactConfirmationReported = false;

  run(context: CadastroPortalRuntimeContext): void {
    if (
      !context.sessionActive ||
      globalThis.location.hostname !== GOVBR_HOST ||
      globalThis.location.pathname !== GOVBR_AUTHORIZE_PATH
    ) return;

    this.observeContactConfirmation();
    this.observeApprovalButton();
  }

  private observeContactConfirmation(): void {
    const report = () => {
      if (this.contactConfirmationReported || !document.querySelector(GOVBR_CONTACT_SELECTOR)) return false;
      this.contactConfirmationReported = true;
      void (globalThis.browser || globalThis.chrome).runtime.sendMessage({
        action: "govBrContactConfirmationDetected",
      });
      return true;
    };
    if (report()) return;
    const observer = new MutationObserver(() => {
      if (report()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  private observeApprovalButton(): void {
    const click = () => {
      const button = document.querySelector<HTMLButtonElement>(GOVBR_APPROVAL_SELECTOR);
      if (!button) return false;
      button.click();
      return true;
    };
    if (click()) return;
    const observer = new MutationObserver(() => {
      if (click()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}
