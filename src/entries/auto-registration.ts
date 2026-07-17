import { parsePesqBrasilRSC } from "../modules/automation/pesqbrasil/extractor";
import { parseCaepfData } from "../modules/automation/caepf/extractor";
import { scrapeEcacCpfData, scrapeEcacCaepfTable } from "../modules/automation/ecac/extractor";
import { parseCadUnicoToken } from "../modules/automation/cadunico/extractor";
import { fetchCadUnicoAdvanced } from "../modules/automation/cadunico/fetcher";
import { parseTseData } from "../modules/automation/tse/extractor";
import {
  fillTseAuthForm,
  resetTseFillGuard,
  validateTseResultRoute,
} from "../modules/automation/tse/form-filler-tse";
import { parseInssData } from "../modules/automation/inss/extractor";
import { resolveTseQueryProfile } from "../modules/automation/cadastro/tse-query-profile";
import { updateAssistantStatus, removeAssistantUI } from "../modules/automation/assistant-ui";
import { setupSPANavigationObserver } from "../modules/automation/spa-observer";

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
  /** Evita disparar o click do Gov.br no PesqBrasil MPA mais de uma vez por ciclo de vida. */
  let _pesqBrasilMpaClickAttempted = false;

  // ── Inicialização ────────────────────────────────────────────────────────

  async function injectGovBrReloginButton() {
    if (document.readyState === "loading") {
      await new Promise<void>((resolve) =>
        document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }),
      );
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
      if (!response?.eligible) return false;
      if (document.querySelector("#sigess-relogin-btn")) return true;

      const btn = document.createElement("button");
      btn.id = "sigess-relogin-btn";
      btn.type = "button";
      btn.textContent = "Relogin SIGESS";
      btn.style.cssText = [
      "margin-left:8px",
      "padding:0 16px",
      "height:40px",
      "border-radius:4px",
      "border:2px solid #1351b4",
      "background:#fff",
      "color:#1351b4",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      "vertical-align:middle",
      ].join(";");

      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Preenchendo...";
        btn.style.opacity = "0.6";
        await api.runtime.sendMessage({ action: "triggerRelogin" }).catch(() => null);
      });

      target.insertAdjacentElement("afterend", btn);
      return true;
    };

    if (await tryInsert()) return;
    observer = new MutationObserver(() => {
      void tryInsert().then((inserted) => {
        if (inserted) observer?.disconnect();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function startAutomation() {
    if (globalThis.location.hostname === "sso.acesso.gov.br") {
      await injectGovBrReloginButton();
    }

    // Correção para falha intermitente de redirecionamento no CadÚnico (Gov.br -> SuccessLogin sem token)
    if (
      globalThis.location.hostname.includes('cadunico.dataprev.gov.br') &&
      globalThis.location.hash === '#/successLogin'
    ) {
      console.warn('[SIGESS] CadÚnico: successLogin sem token. Redirecionando para #/home.');
      globalThis.location.replace('https://cadunico.dataprev.gov.br/#/home');
    }

    const [settingsResult, cadastroResult] = await Promise.all([
      (globalThis.browser || globalThis.chrome).storage.local.get("sigessSettings"),
      (globalThis.browser || globalThis.chrome).storage.local.get("sigessActiveCadastro"),
    ]);
    const settings = settingsResult.sigessSettings || {};
    const activeCadastro = cadastroResult.sigessActiveCadastro;
    _autoEnabled = !!settings.autoRegistrationEnabled || activeCadastro?.sessionState === "active";
    _cadastroSessionActive = activeCadastro?.sessionState === "active";

    // SEMPRE registra listeners de bridge, mesmo se desativado (para poder ativar em tempo real)
    globalThis.addEventListener("message", handleBridgeMessages);

    if (_autoEnabled) {
      initEnabledFeatures(settings);
    }

    // Reage a mudanças de URL (incluindo back button)
    const handleTseNavigation = () => {
      if (globalThis.location.hostname === "www.tse.jus.br") {
        validateTseResultRoute(globalThis.location.href);
      }
      resetTseFillGuard();
    };
    globalThis.addEventListener('popstate', handleTseNavigation);
    globalThis.addEventListener('hashchange', handleTseNavigation);

    let _lastUrl = globalThis.location.href;

    // Monitor sempre ativo para reagir a mudanças no popup e navegação SPA
    setupSPANavigationObserver(() => {
      updateAssistantStatus();

      const currentUrl = globalThis.location.href;
      if (currentUrl === _lastUrl) return; // DOM mutou mas URL não mudou — ignorar excesso
      _lastUrl = currentUrl;

      if (globalThis.location.hostname === "sso.acesso.gov.br") {
        void injectGovBrReloginButton();
      }

      if (globalThis.location.hostname === "www.tse.jus.br") {
        validateTseResultRoute(currentUrl);
      }

      if (_autoEnabled) {
        (globalThis.browser || globalThis.chrome).storage.local.get("sigessSettings").then(res => {
          // Se a URL mudou de fato, permitimos um novo preenchimento do TSE e re-checamos bridges
          resetTseFillGuard();
          initEnabledFeatures(res.sigessSettings || {});
        });
      }
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

  function handleBridgeMessages(event: MessageEvent) {
    if (event.origin !== globalThis.location.origin) return;

    const { type, payload } = event.data || {};
    if (type?.startsWith("SIGESS_")) {
      processIncomingData(type, payload);
    }
  }

  function processIncomingData(type: string, payload: unknown) {
    if (!_autoEnabled) return;

    console.log(`SIGESS: Mensagem recebida da página -> ${type}`);

    if (type === "SIGESS_PESQBRASIL_RAW_DATA") {
      const extractedData = parsePesqBrasilRSC(payload as string);
      if (extractedData) saveData(extractedData, "pesqbrasil");
    } else if (type === "SIGESS_CAEPF_RAW_DATA") {
      const extractedData = parseCaepfData(payload);
      if (extractedData) saveData(extractedData, "ecac_caepf", payload);
    } else if (type === "SIGESS_CADUNICO_RAW_TOKEN") {
      const extractedData = parseCadUnicoToken(payload as string);
      if (extractedData) saveData(extractedData, "cadunico");
    } else if (type === "SIGESS_CADUNICO_ADV_TOKENS") {
      const advPayload = payload as { cpf: string; bearer: string; xsrf: string; cnas: string };
      fetchCadUnicoAdvanced(advPayload).then(result => {
        if (result.kind === "collected") {
          saveData(result.data, "cadunico_adv", result.data);
        } else {
          reportPortalOutcome("cadunico", result.kind, result.reason);
        }
      });
    } else if (type === "SIGESS_TSE_RAW_DATA") {
      const extractedData = parseTseData(payload);
      if (extractedData) saveData(extractedData, "tse", payload);
    } else if (type === "SIGESS_INSS_RAW_DATA") {
      const extractedData = parseInssData(payload);
      if (extractedData) saveData(extractedData, "inss", payload);
    }
  }

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
  const _injectedBridges = new Set<string>();

  function injectScript(assetPath: string) {
    if (_injectedBridges.has(assetPath)) return;
    _injectedBridges.add(assetPath);

    try {
      const script = document.createElement("script");
      script.src = (globalThis.browser || globalThis.chrome).runtime.getURL(assetPath);
      (document.head || document.documentElement).appendChild(script);
      console.log(`SIGESS: Bridge script injected -> ${assetPath}`);
    } catch (e) {
      console.error(`SIGESS: Erro ao injetar bridge ${assetPath}`, e);
    }
  }

  function injectBridges() {
    const host = globalThis.location.hostname;
    if (host.includes("pesqbrasil-pescadorprofissional")) {
      injectScript("assets/pesqbrasil_bridge.js");
    } else if (
      host.includes("caepf.receita.fazenda.gov.br") ||
      host.includes("cav.receita.fazenda.gov.br")
    ) {
      injectScript("assets/caepf_bridge.js");
    } else if (host.includes("cadunico.dataprev.gov.br")) {
      injectScript("assets/cadunico_bridge.js");
    } else if (host.includes("tse.jus.br")) {
      injectScript("assets/tse_bridge.js");
    } else if (host.includes("meu.inss.gov.br")) {
      injectScript("assets/inss_bridge.js");
    }
  }

  // ── Persistência ─────────────────────────────────────────────────────────

  function saveData(
    data: Partial<import("../shared/types").PessoaData>,
    fonte: string,
    snapshot?: unknown,
  ) {
    console.log(`SIGESS: Dados extraídos de ${fonte}`, data);
    const api = (globalThis.browser || globalThis.chrome) as any;
    
    if (api?.runtime?.sendMessage) {
      api.runtime.sendMessage({
        action: "SAVE_PESSOA_DATA",
        data,
        fonte,
        snapshot,
      });
    }

    // Disparamos o evento local de atualização
    globalThis.dispatchEvent(new CustomEvent('SIGESS_DATA_UPDATED'));
  }

  function reportPortalOutcome(
    portal: "cadunico" | "tse" | "inss",
    outcome: "not_found" | "failed" | "unavailable",
    reason: string,
  ) {
    const api = (globalThis.browser || globalThis.chrome) as any;
    api?.runtime?.sendMessage?.({
      action: "REPORT_CADASTRO_PORTAL_OUTCOME",
      portal,
      outcome,
      reason,
    });
  }

  // ── Reatividade (storage.onChanged) ──────────────────────────────────────

  (globalThis.browser || globalThis.chrome).storage.onChanged.addListener((changes: any) => {
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
