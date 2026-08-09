import { recoverCadUnicoIncompleteSuccessLogin } from "../modules/automation/cadunico/navigation";
import { CadUnicoPortalRuntime } from "../modules/automation/cadunico/runtime";
import { InssPortalRuntime } from "../modules/automation/inss/runtime";
import { EcacPortalRuntime } from "../modules/automation/ecac/runtime";
import { PesqBrasilPortalRuntime } from "../modules/automation/pesqbrasil/runtime";
import { TsePortalRuntime } from "../modules/automation/tse/runtime";
import { resolvePortalBridge } from "../modules/automation/cadastro/portal-bridges";
import { BridgeInjector } from "../modules/automation/cadastro/bridge-injector";
import { routePortalBridgeMessage } from "../modules/automation/cadastro/portal-data-router";
import { setupRegistrationNavigation } from "../modules/automation/cadastro/registration-navigation";
import { loadRegistrationRuntimeState, observeRegistrationStorage } from "../modules/automation/cadastro/registration-state";
import { injectGovBrReloginButton } from "../modules/automation/cadastro/govbr-relogin";
import { GovBrConsentRuntime } from "../modules/automation/cadastro/govbr-consent";

declare var browser: any;
declare var chrome: any;

// Impede dupla execução quando o script é injetado em múltiplos frames (ex: e-CAC)
if ((globalThis as any).__sigessAutoRegLoaded) {
  // Já carregado, não faz nada
} else {
  (globalThis as any).__sigessAutoRegLoaded = true;
  observeGovBrLoginDom();
  initMain();
}

function observeGovBrLoginDom(): void {
  if (globalThis.location.hostname !== "sso.acesso.gov.br") return;

  const api = globalThis.browser || globalThis.chrome;
  let reportedScreen = "";
  let reportedHcaptcha = false;

  const inspect = () => {
    const screen = document.querySelector(".br-message.warning") ? "password-error"
      : document.querySelector("#accountId") ? "cpf"
      : document.querySelector("#password") ? "password"
      : document.querySelector("#twoFactorForm input[name='otpInput'], #enter-offline-2fa-code") ? "two-factor"
      : "";
    const hcaptchaReady = Boolean(document.querySelector('iframe[src*="hcaptcha"]'));

    if (screen && screen !== reportedScreen) {
      reportedScreen = screen;
      void api.runtime.sendMessage({ action: "govBrLoginDomReady", screen, hcaptchaReady });
    }

    if (screen === "cpf" && hcaptchaReady && !reportedHcaptcha) {
      reportedHcaptcha = true;
      void api.runtime.sendMessage({ action: "govBrLoginDomReady", screen, hcaptchaReady: true });
    }
  };

  inspect();
  const observer = new MutationObserver(inspect);
  observer.observe(document, { childList: true, subtree: true });
  globalThis.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}

async function initMain() {
  console.log("SIGESS: Auto Registration Content Script loaded");

  /** Cache reativo do estado de ativação — evita I/O no storage a cada mensagem. */
  let _autoEnabled = false;
  /** True quando há sessão de cadastro automático ativa (diferente de autoRegistrationEnabled genérico). */
  let _cadastroSessionActive = false;
  const cadUnicoRuntime = new CadUnicoPortalRuntime();
  const inssRuntime = new InssPortalRuntime();
  const ecacRuntime = new EcacPortalRuntime();
  const pesqBrasilRuntime = new PesqBrasilPortalRuntime();
  const tseRuntime = new TsePortalRuntime({ canSubmit: canSubmitCadastroTse });
  const govBrConsentRuntime = new GovBrConsentRuntime();

  // ── Inicialização ────────────────────────────────────────────────────────

  async function startAutomation() {
    if (globalThis.location.hostname === "sso.acesso.gov.br") {
      await injectGovBrReloginButton();
    }

    // Recupera somente o callback incompleto: com token, o CadÚnico deve consumi-lo.
    if (recoverCadUnicoIncompleteSuccessLogin(globalThis.location)) {
      console.warn('[SIGESS] CadÚnico: successLogin sem token. Redirecionando para #/home.');
    }

    const runtimeState = await loadRegistrationRuntimeState();
    const settings = runtimeState.settings;
    _autoEnabled = runtimeState.autoEnabled;
    _cadastroSessionActive = runtimeState.cadastroSessionActive;

    // SEMPRE registra listeners de bridge, mesmo se desativado (para poder ativar em tempo real)
    globalThis.addEventListener("message", (event) => routePortalBridgeMessage(event, _autoEnabled));

    if (_autoEnabled) {
      initEnabledFeatures(settings);
    }

    // Reage a mudanças de URL (incluindo back button)
    setupRegistrationNavigation({
      onHistoryNavigation: () => tseRuntime.reset(),
      onTseNavigation: (url) => tseRuntime.onNavigation(url),
      onUrlChanged: () => {
        if (globalThis.location.hostname === "sso.acesso.gov.br") void injectGovBrReloginButton();
        if (!_autoEnabled) return;
        (globalThis.browser || globalThis.chrome).storage.local.get("sigessSettings").then((res: any) => {
          tseRuntime.reset();
          initEnabledFeatures(res.sigessSettings || {});
        });
      },
    });
  }

  /**
   * Inicializa as funcionalidades que dependem da captura estar ATIVA.
   * Pode ser chamado no load inicial ou via onChanged.
   */
  function initEnabledFeatures(settings: any) {
    console.log("SIGESS: Funcionalidades de automação ativadas.");

    injectBridges();

    cadUnicoRuntime.run({ sessionActive: _cadastroSessionActive });
    ecacRuntime.run({ sessionActive: _cadastroSessionActive });

    pesqBrasilRuntime.run({ sessionActive: _cadastroSessionActive });
    govBrConsentRuntime.run({ sessionActive: _cadastroSessionActive });

    inssRuntime.run({ sessionActive: _cadastroSessionActive });

    tseRuntime.run({ sessionActive: _cadastroSessionActive, settings });
  }

  // ── Mensagens da Bridge ──────────────────────────────────────────────────

  /** O estado global da sessão não basta: a aba atual precisa ser a TSE criada por ela. */
  async function canSubmitCadastroTse(): Promise<boolean> {
    const api = globalThis.browser || globalThis.chrome;
    try {
      const response = await api.runtime.sendMessage({ action: "canSubmitCadastroTse" });
      return response?.allowed === true;
    } catch {
      return false;
    }
  }

  // ── Injeção de bridges ───────────────────────────────────────────────────
  const bridgeInjector = new BridgeInjector();

  function injectBridges() {
    const bridge = resolvePortalBridge(globalThis.location.hostname);
    if (bridge) bridgeInjector.inject(bridge);
  }

  // ── Persistência ─────────────────────────────────────────────────────────

  // ── Reatividade (storage.onChanged) ──────────────────────────────────────

  observeRegistrationStorage((changes: any) => {
    if (changes.sigessSettings) {
      const newVal = changes.sigessSettings.newValue || {};
      const oldVal = changes.sigessSettings.oldValue || {};

      console.log("SIGESS: Configurações alteradas detected no storage.onChanged", {
        autoEnabled: newVal.autoRegistrationEnabled,
        hasData: !!(newVal.pessoaData && Object.keys(newVal.pessoaData).length > 0)
      });

      const cadastroActive = (globalThis.browser || globalThis.chrome).storage.local
        .get("sigessActiveCadastro")
        .then((r: any) => r?.sigessActiveCadastro?.sessionState === "active")
        .catch(() => false);

      cadastroActive.then((cadastroIsActive: boolean) => {
        _autoEnabled = !!newVal.autoRegistrationEnabled || cadastroIsActive;

        if (oldVal.autoRegistrationEnabled === true && newVal.autoRegistrationEnabled === false && !cadastroIsActive) {
          console.log("SIGESS: Captura desativada via popup.");
          return;
        }

        if (!oldVal.autoRegistrationEnabled && newVal.autoRegistrationEnabled) {
          initEnabledFeatures(newVal);
        }

      });
    }

    if (changes.sigessActiveCadastro) {
      const newSession = changes.sigessActiveCadastro.newValue;
      const wasActive = !!changes.sigessActiveCadastro.oldValue;
      const isActive = newSession?.sessionState === "active";
      _cadastroSessionActive = isActive;

      if (isActive && !_autoEnabled) {
        _autoEnabled = true;
        (globalThis.browser || globalThis.chrome).storage.local.get("sigessSettings").then((r: any) => {
          initEnabledFeatures(r?.sigessSettings || {});
        });
      } else if (!isActive && wasActive) {
        (globalThis.browser || globalThis.chrome).storage.local.get("sigessSettings").then((r: any) => {
          _autoEnabled = !!r?.sigessSettings?.autoRegistrationEnabled;
        });
      }
    }
  });

  // Comando do background para clicar no botão Gov.br do eCAC.
  // DOMInjector (mundo isolado) gera isTrusted=false, que validarHcaptcha rejeita.
  // Injetar <script> executa validarHcaptcha no mundo principal da página.
  (globalThis.browser || globalThis.chrome).runtime.onMessage.addListener((message: any) => {
    ecacRuntime.handleMessage(message);
  });

  startAutomation();
}
