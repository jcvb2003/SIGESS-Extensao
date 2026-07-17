import { scrapeEcacCpfData, scrapeEcacCaepfTable } from "../modules/automation/ecac/extractor";
import { recoverCadUnicoIncompleteSuccessLogin } from "../modules/automation/cadunico/navigation";
import {
  fillTseAuthForm,
  resetTseFillGuard,
  validateTseResultRoute,
} from "../modules/automation/tse/form-filler-tse";
import { resolveTseQueryProfile } from "../modules/automation/cadastro/tse-query-profile";
import { updateAssistantStatus, removeAssistantUI } from "../modules/automation/assistant-ui";
import { saveCapturedPessoaData as saveData } from "../modules/automation/cadastro/capture-data-reporter";
import { resolvePortalBridge } from "../modules/automation/cadastro/portal-bridges";
import { BridgeInjector } from "../modules/automation/cadastro/bridge-injector";
import { routePortalBridgeMessage } from "../modules/automation/cadastro/portal-data-router";
import { setupRegistrationNavigation } from "../modules/automation/cadastro/registration-navigation";
import { loadRegistrationRuntimeState, observeRegistrationStorage } from "../modules/automation/cadastro/registration-state";
import { injectGovBrReloginButton } from "../modules/automation/cadastro/govbr-relogin";

declare var browser: any;
declare var chrome: any;

// Impede dupla execução quando o script é injetado em múltiplos frames (ex: e-CAC)
if ((globalThis as any).__sigessAutoRegLoaded) {
  // Já carregado, não faz nada
} else {
  (globalThis as any).__sigessAutoRegLoaded = true;
  initMain();
}

async function initMain() {
  console.log("SIGESS: Auto Registration Content Script loaded");

  /** Cache reativo do estado de ativação — evita I/O no storage a cada mensagem. */
  let _autoEnabled = false;
  /** True quando há sessão de cadastro automático ativa (diferente de autoRegistrationEnabled genérico). */
  let _cadastroSessionActive = false;
  /** Evita disparar o click do Gov.br no eCAC mais de uma vez por ciclo de vida do content script. */
  let _ecacClickAttempted = false;
  /** Evita disparar o click do Gov.br no CadÚnico mais de uma vez por ciclo de vida. */
  let _cadUnicoClickAttempted = false;
  /** Evita aceitar o termo próprio do CadÚnico mais de uma vez por ciclo de vida. */
  let _cadUnicoTermsAttempted = false;
  /** Evita disparar o click do Gov.br no PesqBrasil MPA mais de uma vez por ciclo de vida. */
  let _pesqBrasilMpaClickAttempted = false;
  /** Evita notificar duas vezes a área autenticada do Meu INSS. */
  let _inssAuthenticatedReported = false;

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
      onAnyMutation: updateAssistantStatus,
      onHistoryNavigation: resetTseFillGuard,
      onTseNavigation: (url) => {
        validateTseResultRoute(url);
      },
      onUrlChanged: () => {
        if (globalThis.location.hostname === "sso.acesso.gov.br") void injectGovBrReloginButton();
        if (!_autoEnabled) return;
        (globalThis.browser || globalThis.chrome).storage.local.get("sigessSettings").then((res: any) => {
          resetTseFillGuard();
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

    const url = globalThis.location.href;
    const host = globalThis.location.hostname;

    // Scrapers de DOM para e-CAC (id=15 e id=89)
    const isEcacCpf = url.includes('id=15') || url.includes('ConsultarCPF');
    const isEcacCaepf = url.includes('id=89');

    if (isEcacCpf) {
      const runScrape = () => {
        const data = scrapeEcacCpfData();
        saveData(data ?? {}, "ecac_cpf");
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runScrape, { once: true });
      } else {
        runScrape();
      }
    }

    if (isEcacCaepf) {
      // O eCAC renderiza a tabela CAEPF via JS após o status "complete".
      // Na navegação automática o scraper disparava antes da tabela aparecer.
      // MutationObserver espera a tabela chegar; timeout de 15s para quem não tem CAEPF.
      const runCaepfScrape = () => {
        const data = scrapeEcacCaepfTable();
        saveData(data ?? {}, "ecac_caepf");
      };

      const waitForCaepfTable = () => {
        if (document.querySelector('table.tabela')) {
          runCaepfScrape();
          return;
        }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          obs.disconnect();
          runCaepfScrape();
        };
        const obs = new MutationObserver(() => {
          if (document.querySelector('table.tabela')) finish();
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForCaepfTable, { once: true });
      } else {
        waitForCaepfTable();
      }
    }

    // eCAC auth page: clique proativo no Gov.br sem depender da cadeia background→sendMessage.
    // DOMInjector.waitForElement só busca no frame principal; o botão pode estar em subframe
    // ou a sequência de mensagens pode ter timing issue. O content script (all_frames) clica
    // diretamente via injeção de <script> no mundo principal de cada frame.
    const isEcacAuth = host.includes('cav.receita.fazenda.gov.br') && url.includes('autenticacao');
    if (isEcacAuth && _cadastroSessionActive && !_ecacClickAttempted) {
      _ecacClickAttempted = true;
      const clickGovBr = () => {
        const s = document.createElement('script');
        s.textContent = `
          (function tryClickEcac(n) {
            if (n <= 0) return;
            var btn = document.querySelector("input[type='image']");
            if (!btn) { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
            if (typeof hcaptcha === 'undefined') { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
            if (!document.querySelector('iframe[src*="hcaptcha"]')) { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          })(30);
        `;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', clickGovBr, { once: true });
      } else {
        clickGovBr();
      }
    }

    // CadÚnico: MutationObserver no mundo principal aguarda o botão Gov.br aparecer
    // e clica imediatamente — mais confiável que polling via executeScript do background,
    // especialmente quando o SPA demora a renderizar a rota #/home.
    const isCadUnico = host.includes('cadunico.dataprev.gov.br') && !url.includes('successLogin');
    if (isCadUnico && _cadastroSessionActive && !_cadUnicoClickAttempted) {
      _cadUnicoClickAttempted = true;
      const clickCadUnicoGovBr = () => {
        const s = document.createElement('script');
        s.textContent = `
          (function() {
            var SELECTORS = [
              "button.br-button[class*='botaoGovBr']",
              ".br-button.botaoGovBr"
            ];
            var obs;
            function findBtn() {
              for (var i = 0; i < SELECTORS.length; i++) {
                var b = document.querySelector(SELECTORS[i]);
                if (b && b.offsetParent !== null) return b;
              }
              return null;
            }
            function tryClick() {
              var b = findBtn();
              if (!b) return false;
              if (obs) obs.disconnect();
              b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              return true;
            }
            if (!tryClick()) {
              obs = new MutationObserver(function() { tryClick(); });
              obs.observe(document.documentElement, { childList: true, subtree: true });
              setTimeout(function() { if (obs) obs.disconnect(); }, 20000);
            }
          })();
        `;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', clickCadUnicoGovBr, { once: true });
      } else {
        clickCadUnicoGovBr();
      }
    }

    // Termo próprio do CadÚnico: não confundir com o consentimento OAuth do GOV.BR.
    // Só existe na rota #/home já autenticada e usa o botão identificado pelo portal.
    if (
      host.includes("cadunico.dataprev.gov.br") &&
      globalThis.location.hash === "#/home" &&
      _cadastroSessionActive &&
      !_cadUnicoTermsAttempted
    ) {
      _cadUnicoTermsAttempted = true;
      const acceptCadUnicoTerms = () => {
        const script = document.createElement("script");
        script.textContent = `
          (function() {
            var observer;
            function accept() {
              var button = document.querySelector('#botaoLiConcordo');
              if (!button || button.offsetParent === null) return false;
              if (observer) observer.disconnect();
              button.click();
              return true;
            }
            if (!accept()) {
              observer = new MutationObserver(function() { accept(); });
              observer.observe(document.documentElement, { childList: true, subtree: true });
            }
          })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", acceptCadUnicoTerms, { once: true });
      } else {
        acceptCadUnicoTerms();
      }
    }

    // PesqBrasil MPA: mesma abordagem — MutationObserver aguarda #button_____r0
    const isPesqBrasilMPA = host.includes('pesqbrasil-pescadorprofissional.mpa.gov.br') ||
                            host.includes('pesqbrasil-pescadorprofissional.agro.gov.br');
    if (isPesqBrasilMPA && _cadastroSessionActive && !_pesqBrasilMpaClickAttempted) {
      _pesqBrasilMpaClickAttempted = true;
      const clickPesqBrasilMpaGovBr = () => {
        const s = document.createElement('script');
        s.textContent = `
          (function() {
            var obs;
            function tryClick() {
              var b = document.querySelector('#button_____r0');
              if (!b || b.offsetParent === null) return false;
              if (obs) obs.disconnect();
              b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              return true;
            }
            if (!tryClick()) {
              obs = new MutationObserver(function() { tryClick(); });
              obs.observe(document.documentElement, { childList: true, subtree: true });
              setTimeout(function() { if (obs) obs.disconnect(); }, 20000);
            }
          })();
        `;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', clickPesqBrasilMpaGovBr, { once: true });
      } else {
        clickPesqBrasilMpaGovBr();
      }
    }

    // PesqBrasil MPA: após login, aparece menu de cards. Clica em #card_____ra
    // ("Registro de pescador(a) profissional") para acessar os dados do pescador.
    if (isPesqBrasilMPA && _cadastroSessionActive) {
      const clickPesqBrasilCard = () => {
        const card = document.querySelector<HTMLElement>('#card_____ra');
        if (card) { card.click(); return true; }
        return false;
      };
      if (!clickPesqBrasilCard()) {
        const obs = new MutationObserver(() => { if (clickPesqBrasilCard()) obs.disconnect(); });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 30000);
      }
    }

    // Tela de consentimento OAuth do Gov.br — aparece após login bem-sucedido em alguns portais.
    // Clica automaticamente em "Autorizar" para não bloquear o fluxo.
    if (
      _cadastroSessionActive &&
      host === "sso.acesso.gov.br" &&
      globalThis.location.pathname === "/authorize"
    ) {
      let contactConfirmationReported = false;
      const reportContactConfirmation = () => {
        if (contactConfirmationReported || !document.querySelector("#contact-validation")) return false;
        contactConfirmationReported = true;
        void (globalThis.browser || globalThis.chrome).runtime.sendMessage({
          action: "govBrContactConfirmationDetected",
        });
        return true;
      };
      if (!reportContactConfirmation()) {
        const contactObserver = new MutationObserver(() => {
          if (reportContactConfirmation()) contactObserver.disconnect();
        });
        contactObserver.observe(document.documentElement, { childList: true, subtree: true });
      }

      const clickAuthorize = () => {
        const btn = document.querySelector<HTMLButtonElement>('button[name="user_oauth_approval"][value="true"]');
        if (btn) { btn.click(); return true; }
        return false;
      };
      if (!clickAuthorize()) {
        const obs = new MutationObserver(() => { if (clickAuthorize()) obs.disconnect(); });
        obs.observe(document.documentElement, { childList: true, subtree: true });
      }
    }

    // Preenchimento automático para o TSE (Portal de Atendimento)
    if (url.includes('tse.jus.br')) {
      validateTseResultRoute(url);
    }

    // Meu INSS: o retorno autenticado pode ocorrer apenas por transição interna do SPA,
    // sem um tabs.onUpdated confiável. O avatar existe somente na área autenticada.
    if (
      host.includes("meu.inss.gov.br") &&
      _cadastroSessionActive &&
      !url.includes("dados-cadastrais") &&
      !_inssAuthenticatedReported
    ) {
      const reportInssAuthenticated = () => {
        if (_inssAuthenticatedReported || !document.querySelector("#avatar-dropdown-trigger")) return false;
        _inssAuthenticatedReported = true;
        void (globalThis.browser || globalThis.chrome).runtime.sendMessage({
          action: "inssAuthenticated",
        });
        return true;
      };
      if (!reportInssAuthenticated()) {
        const inssObserver = new MutationObserver(() => {
          if (reportInssAuthenticated()) inssObserver.disconnect();
        });
        inssObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
    }

    if (
      url.includes('tse.jus.br') &&
      url.includes('servicos-eleitorais/autoatendimento-eleitoral')
    ) {
      const profile = resolveTseQueryProfile(settings);
      if (_cadastroSessionActive) {
        if (profile.isSufficient) {
          void canSubmitCadastroTse().then((submit) => {
            fillTseAuthForm(profile, { submit });
          });
        }
      } else if (profile.cpf || profile.dataDeNascimento || profile.mae || profile.pai) {
        fillTseAuthForm(profile, { submit: false });
      }
    }
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

  function injectScript(assetPath: string) {
    bridgeInjector.inject(assetPath);
  }

  function injectBridges() {
    const bridge = resolvePortalBridge(globalThis.location.hostname);
    if (bridge) injectScript(bridge);
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
          console.log("SIGESS: Captura desativada via popup. Ocultando UI.");
          removeAssistantUI();
          return;
        }

        if (!oldVal.autoRegistrationEnabled && newVal.autoRegistrationEnabled) {
          initEnabledFeatures(newVal);
        }

        updateAssistantStatus();
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

  globalThis.addEventListener('SIGESS_DATA_UPDATED', updateAssistantStatus);

  // Comando do background para clicar no botão Gov.br do eCAC.
  // DOMInjector (mundo isolado) gera isTrusted=false, que validarHcaptcha rejeita.
  // Injetar <script> executa validarHcaptcha no mundo principal da página.
  (globalThis.browser || globalThis.chrome).runtime.onMessage.addListener((message: any) => {
    if (message?.action === "clickEcacGovBrButton") {
      const s = document.createElement('script');
      // validarHcaptcha('govBr') usa window.event internamente; chamada direta sem evento real
      // causa "event is undefined". dispatchEvent seta window.event corretamente durante o onclick.
      s.textContent = `
        (function tryClickEcac(n) {
          if (n <= 0) return;
          var btn = document.querySelector("input[type='image']");
          if (!btn) { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
          if (typeof hcaptcha === 'undefined') { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
          if (!document.querySelector('iframe[src*="hcaptcha"]')) { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        })(30);
      `;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    }
  });

  startAutomation();
}
