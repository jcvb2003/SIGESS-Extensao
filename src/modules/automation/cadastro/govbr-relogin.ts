export async function injectGovBrReloginButton(): Promise<void> {
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
  }
  const api = globalThis.browser || globalThis.chrome;
  let observer: MutationObserver | null = null;
  let inserting = false;
  const tryInsert = async (): Promise<boolean> => {
    if (inserting || document.querySelector("#sigess-relogin-btn")) return true;
    const accountId = document.querySelector("#accountId");
    const target = document.querySelector("#enter-account-id");
    if (!accountId || !target) return false;
    inserting = true;
    const response = await api.runtime.sendMessage({ action: "checkReloginEligible" }).catch(() => null);
    inserting = false;
    if (!response?.eligible || document.querySelector("#sigess-relogin-btn")) return Boolean(document.querySelector("#sigess-relogin-btn"));

    const button = document.createElement("button");
    button.id = "sigess-relogin-btn";
    button.type = "button";
    button.textContent = "Relogin SIGESS";
    button.style.cssText = [
      "margin-left:8px", "padding:0 16px", "height:40px", "border-radius:999px",
      "border:2px solid #1351b4", "background:#fff", "color:#1351b4",
      "font-size:14px", "font-weight:600", "cursor:pointer", "vertical-align:middle",
    ].join(";");
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Preenchendo...";
      button.style.opacity = "0.6";
      await api.runtime.sendMessage({ action: "triggerRelogin" }).catch(() => null);
    });
    target.insertAdjacentElement("afterend", button);
    return true;
  };
  if (await tryInsert()) return;
  observer = new MutationObserver(() => void tryInsert().then((inserted) => inserted && observer?.disconnect()));
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
