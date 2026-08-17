import { StorageService } from "./storage";
import { DOMInjector } from "./dom-injector";
import { CadastroSession, UserCredentials } from "../../shared/types";
import {
  AuthStrategy,
  PesqBrasilStrategy,
  PesqBrasilMPAStrategy,
  MTEStrategy,
  INSSStrategy,
  ESocialStrategy,
  CadUnicoStrategy,
  EcacStrategy,
} from "./auth-strategy";
import { CADUNICO_HOME_URL, isCadUnicoUrl } from "../../modules/automation/cadunico/routes";
import { INSS_DATA_URL, isInssDataUrl, isInssUrl } from "../../modules/automation/inss/routes";
import { ECAC_COLLECTION_URL, ECAC_LOGIN_URL, isEcacCaepfCollectionUrl, isEcacUrl } from "../../modules/automation/ecac/routes";
import { PESQBRASIL_MPA_URL, isPesqBrasilMpaUrl } from "../../modules/automation/pesqbrasil/routes";
import { isMteUrl } from "../../modules/automation/mte/routes";
import { closeCadastroContainerTabs, sanitizeCadastroContainer } from "../cadastro/cadastro-container";

export class TabManager {
  private readonly strategies: AuthStrategy[] = [];
  private static readonly TAB_CONTAINER_PREFIX = "tab_container_";
  private static readonly RECENT_CONTAINERS_KEY = "sigessRecentContainers";
  private static readonly PENDING_TAB_RECHECK_MS = 6000;
  private _containerQueueLock: Promise<void> = Promise.resolve();
  private readonly processingTabs = new Set<number>();
  private readonly pendingGovBrDomReplay = new Set<number>();
  private readonly postLoginNavigationInFlight = new Set<number>();
  private readonly govBrFocusRestore = new Map<number, { tabId: number | null; pendingTabs: Set<number> }>();
  private readonly govBrCpfWatchers = new Set<number>();

  constructor() {
    this.strategies = [
      new PesqBrasilStrategy(),
      new PesqBrasilMPAStrategy(),
      new MTEStrategy(),
      new INSSStrategy(),
      new ESocialStrategy(),
      new CadUnicoStrategy(),
      new EcacStrategy(),
    ];
  }

  private enqueueContainerOp(fn: () => Promise<void>): Promise<void> {
    this._containerQueueLock = this._containerQueueLock.then(() => fn()).catch(() => {});
    return this._containerQueueLock;
  }

  private async getRecentContainers(): Promise<string[]> {
    const result = await StorageService.get<string[]>(TabManager.RECENT_CONTAINERS_KEY);
    return result[TabManager.RECENT_CONTAINERS_KEY] || [];
  }

  private async saveRecentContainers(containers: string[]): Promise<void> {
    await StorageService.set({ [TabManager.RECENT_CONTAINERS_KEY]: containers });
  }

  private supportsContextualIdentities(): boolean {
    return Boolean((browser as any)?.contextualIdentities);
  }

  private getTabContainerKey(tabId: number): string {
    return `${TabManager.TAB_CONTAINER_PREFIX}${tabId}`;
  }

  private async saveTabContainer(tabId: number, containerId: string) {
    await StorageService.set({ [this.getTabContainerKey(tabId)]: containerId });
  }

  private async getTabContainer(tabId: number): Promise<string | null> {
    const key = this.getTabContainerKey(tabId);
    const result = await StorageService.get<string>(key);
    return result[key] || null;
  }

  private async clearTabContainer(tabId: number) {
    await StorageService.remove(this.getTabContainerKey(tabId));
  }

  async createSession(
    url: string,
    cpf: string,
    senha: string,
    index: number,
    nome?: string,
    portalType?: "mte" | "pesqbrasil_mpa" | "esocial" | "inss",
    valorComercializado?: string,
    gerarGps?: boolean,
    consultarGuias?: boolean,
    selectedYear?: string,
    selectedMonth?: string,
    competencias?: UserCredentials["competencias"],
  ): Promise<void> {
    try {
      const resolvedPortalType =
        portalType ||
        (url.includes("esocial") ? "esocial"
          : isInssUrl(url) ? "inss"
          : isPesqBrasilMpaUrl(url) ? "pesqbrasil_mpa"
          : isMteUrl(url) ? "mte"
          : "mte");

      let tab: browser.tabs.Tab;

      if (this.supportsContextualIdentities()) {
        const container = await (browser as any).contextualIdentities.create({
          name: nome || `Sessao-${index}-${cpf.slice(-4)}`,
          color: "blue",
          icon: "fingerprint",
        });

        // A navegação final só começa depois que as credenciais forem salvas.
        // Isso evita perder o primeiro tabs.onUpdated quando a página chega ao
        // Gov.br antes de o registro da aba existir no storage.
        tab = await browser.tabs.create({
          url: "about:blank",
          cookieStoreId: container.cookieStoreId,
          active: false,
        });

        if (tab.id) {
          await this.saveTabContainer(tab.id, container.cookieStoreId);
        }
      } else {
        tab = await browser.tabs.create({
          url: "about:blank",
          active: false,
        });
      }

      if (tab.id) {
        await StorageService.saveCredentials(tab.id, {
          cpf,
          senha,
          nome,
          valorComercializado,
          portalType: resolvedPortalType,
          gerarGps,
          consultarGuias,
           selectedYear,
           selectedMonth,
           competencias,
          loginConcluido: false,
          govBrCpfSubmitted: false,
          govBrPasswordSubmitted: false,
          status: "abrindo_em_lote",
          statusTitle: "Abrindo em lote",
          statusDescription: "Abrindo aba para autenticacao...",
          lastUpdatedAt: Date.now(),
        });
        await browser.tabs.update(tab.id, { url });
      }
    } catch (error) {
      console.error("Erro ao criar sessao:", error);
    }
  }

  async createSessionInContainer(
    url: string,
    cpf: string,
    senha: string,
    cookieStoreId: string,
    nome?: string,
    portalType?: "cadunico" | "ecac" | "tse" | "pesqbrasil_mpa" | "inss",
    cadastroSessionId?: string,
  ): Promise<number | null> {
    try {
      const tab = await browser.tabs.create({ url: "about:blank", cookieStoreId, active: false });
      if (!tab.id) return null;

      await this.saveTabContainer(tab.id, cookieStoreId);
      await StorageService.saveCredentials(tab.id, {
        cpf,
        senha,
        nome,
        portalType: portalType as UserCredentials["portalType"],
        isCadastroAutomatico: true,
        cadastroSessionId,
        loginConcluido: false,
        govBrCpfSubmitted: false,
        govBrPasswordSubmitted: false,
        status: "abrindo_em_lote",
        statusTitle: "Abrindo",
        statusDescription: "Abrindo aba de cadastro automático...",
        lastUpdatedAt: Date.now(),
      });
      // O TSE precisa de uma primeira renderização em foreground para iniciar
      // sua SPA com confiabilidade. Os demais portais permanecem em segundo plano
      // e recebem foco apenas durante a inicialização do Gov.br.
      await browser.tabs.update(tab.id, { url, active: portalType === "tse" });
      return tab.id;
    } catch (error) {
      console.error("[SIGESS] Erro ao criar sessão no container:", error);
      return null;
    }
  }

  async handleTabUpdate(
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    tab: browser.tabs.Tab,
  ) {
    if (!tab.url) return;

    const credentials = await StorageService.getCredentials(tabId);
    if (!credentials) return;

    const returnedFromGovBr =
      credentials.govBrPasswordSubmitted &&
      !tab.url.includes("sso.acesso.gov.br");

    if (returnedFromGovBr) {
      if (credentials.isCadastroAutomatico) {
        await StorageService.updateCadastroInteraction(credentials.cadastroSessionId, undefined, tabId);
      }
      const completedCredentials = await StorageService.updateBatchStatus(
        tabId,
        "redirecionando",
        credentials.consultarGuias ? "Login GOV.BR concluído" : "Login concluído",
        credentials.consultarGuias
          ? "Abrindo a consulta de competências..."
          : "Acessando o portal de serviços...",
        { loginConcluido: true, govBrTwoFactorPending: false },
      );
      await this.restoreGovBrFocus(tabId);

      if (completedCredentials?.isCadastroAutomatico && changeInfo.status === "complete") {
        await this.handleCadastroPostLoginNav(tabId, tab.url, completedCredentials);
      }
      return;
    }

    // Hook de pós-login para tabs de cadastro automático
    if (credentials.loginConcluido && credentials.isCadastroAutomatico) {
      if (changeInfo.status === "complete") {
        await this.handleCadastroPostLoginNav(tabId, tab.url, credentials);
      }
      return;
    }

    if (credentials.loginConcluido) return;

    if (changeInfo.status === "loading" || changeInfo.url) {
      await this.markTabAsAwaitingPage(tabId, tab.url);
    }

    if (changeInfo.status !== "complete" && !changeInfo.url) return;

    const strategy = this.strategies.find(
      (s) =>
        tab.url?.includes(s.urlTrigger) ||
        tab.url?.includes("sso.acesso.gov.br"),
    );

    if (strategy) {
      const execute = () => this.executeWithRetry(tabId, tab.url!, credentials, strategy);
      if (tab.url.includes("sso.acesso.gov.br")) {
        await this.focusGovBrTab(tabId);
        this.watchGovBrCpfField(tabId);
      }
      await execute();

      // O e-CAC pode concluir o login já na página autenticada, sem gerar outro
      // evento de navegação. Rele as credenciais para usar o mesmo pós-login.
      const updatedCredentials = await StorageService.getCredentials(tabId);
      if (updatedCredentials?.loginConcluido) {
        await this.restoreGovBrFocus(tabId);
      }
      if (
        changeInfo.status === "complete" &&
        updatedCredentials?.isCadastroAutomatico &&
        updatedCredentials.loginConcluido &&
        ["ecac", "inss"].includes(updatedCredentials.portalType || "")
      ) {
        await this.handleCadastroPostLoginNav(tabId, tab.url, updatedCredentials);
      }
    }
  }

  async handleTabActivated(tabId: number): Promise<void> {
    try {
      const tab = await browser.tabs.get(tabId);
      const credentials = await StorageService.getCredentials(tabId);
      if (!tab.url || !credentials || credentials.loginConcluido) return;

      if (tab.status === "complete") {
        await this.handleTabUpdate(tabId, { status: "complete" }, tab);
        return;
      }

      await this.markTabAsAwaitingPage(tabId, tab.url);
    } catch (error) {
      console.debug("[SIGESS] Falha ao reavaliar aba ativada:", error);
    }
  }

  async handleGovBrLoginDomReady(tabId: number): Promise<void> {
    if (this.processingTabs.has(tabId)) {
      this.pendingGovBrDomReplay.add(tabId);
      return;
    }

    const tab = await browser.tabs.get(tabId);
    const credentials = await StorageService.getCredentials(tabId);
    if (!tab.url?.includes("sso.acesso.gov.br") || !credentials || credentials.loginConcluido) return;

    const strategy = this.strategies.find(
      (candidate) => tab.url?.includes(candidate.urlTrigger) || tab.url?.includes("sso.acesso.gov.br"),
    );
    if (!strategy) return;

    await this.focusGovBrTab(tabId);
    await this.executeWithRetry(tabId, tab.url, credentials, strategy);
  }

  async recheckPendingTabs(): Promise<void> {
    // Watchdog: recupera caso o evento tabs.onUpdated seja perdido após login do CadÚnico
    await this.recheckCadastroSiblings();

    const allCredentials = await StorageService.getAllCredentials();
    const now = Date.now();

    for (const [key, credentials] of Object.entries(allCredentials)) {
      const tabId = Number(key.replace("credenciais_", ""));
      if (!Number.isFinite(tabId) || credentials.govBrTwoFactorPending) continue;
      if (credentials.status === "concluido" || credentials.status === "erro" || credentials.status === "ignorado") continue;
      if (this.processingTabs.has(tabId)) continue;

      const staleFor = now - (credentials.lastUpdatedAt || 0);
      if (staleFor < TabManager.PENDING_TAB_RECHECK_MS) continue;

      try {
        const tab = await browser.tabs.get(tabId);
        if (!tab.url) continue;

        if (credentials.loginConcluido) continue;

        if ((tab as browser.tabs.Tab & { discarded?: boolean }).discarded) {
          await StorageService.updateBatchStatus(
            tabId,
            "aguardando_pagina",
            "Recarregando aba",
            "A aba estava suspensa. Recarregando para retomar a automacao...",
          );
          await browser.tabs.reload(tabId);
          continue;
        }

        if (tab.status === "complete") {
          await this.handleTabUpdate(tabId, { status: "complete" }, tab);
          continue;
        }

        await StorageService.updateBatchStatus(
          tabId,
          "aguardando_pagina",
          "Aguardando carregamento",
          "Reavaliando aba pendente sem interacao manual...",
        );
      } catch (error) {
        console.debug(`[SIGESS] Falha ao reavaliar aba pendente ${tabId}:`, error);
      }
    }
  }

  private async executeWithRetry(
    tabId: number,
    tabUrl: string,
    credentials: any,
    strategy: any,
    maxRetries = 3,
  ): Promise<void> {
    if (this.processingTabs.has(tabId)) {
      return;
    }

    this.processingTabs.add(tabId);

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await strategy.execute(tabId, tabUrl, credentials);
          return;
        } catch (error: any) {
          if (error?.message === "govbr_senha_invalida") {
            await this.abortActiveCadastroSession("Usuário e/ou senha inválidos no Gov.br.");
            return;
          }
          if (attempt === maxRetries) {
            console.error(`[TabManager] Falha na execucao apos ${maxRetries} tentativas:`, error);
            await strategy.updateStatus(tabId, "erro", "Erro no Login", String(error));
            return;
          }
          const delayMs = 1000 * attempt;
          console.log(`[TabManager] Tentativa ${attempt} falhou, aguardando ${delayMs}ms antes de retry...`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    } finally {
      this.processingTabs.delete(tabId);
      if (this.pendingGovBrDomReplay.delete(tabId)) {
        queueMicrotask(() => {
          void this.handleGovBrLoginDomReady(tabId).catch((error) => {
            console.error(`[SIGESS] Falha ao reprocessar sinal DOM do Gov.br na aba ${tabId}:`, error);
          });
        });
      }
    }
  }

  private async abortActiveCadastroSession(errorMessage: string): Promise<void> {
    const CADASTRO_SESSION_KEY = "sigessActiveCadastro";
    try {
      const result = await StorageService.get<CadastroSession>(CADASTRO_SESSION_KEY);
      const session: CadastroSession | undefined = (result as any)[CADASTRO_SESSION_KEY];
      if (!session || session.sessionState !== "active") return;

      // Marca todos os portais como erro e seta o estado da sessão
      for (const key of Object.keys(session.portais) as (keyof typeof session.portais)[]) {
        const portal = session.portais[key];
        if (portal) portal.status = "erro";
      }
      session.sessionState = "error";
      session.errorMessage = errorMessage;
      await StorageService.set({ [CADASTRO_SESSION_KEY]: session });

      await closeCadastroContainerTabs(session.cookieStoreId);
      await sanitizeCadastroContainer(session.cookieStoreId);
    } catch (e) {
      console.error("[TabManager] Erro ao abortar sessão de cadastro:", e);
    }
  }

  private async markTabAsAwaitingPage(tabId: number, url: string): Promise<void> {
    const credentials = await StorageService.getCredentials(tabId);
    if (!credentials || credentials.loginConcluido) return;

    const currentStatus = credentials.status || "abrindo_em_lote";
    if (currentStatus === "fazendo_login" || currentStatus === "acessando_esocial") {
      return;
    }

    const host = this.extractHostLabel(url);
    await StorageService.updateBatchStatus(
      tabId,
      "aguardando_pagina",
      "Aguardando página",
      host ? `Carregando ${host} para iniciar a automacao...` : "Aguardando a pagina ficar pronta...",
    );
  }

  async triggerReloginForTab(tabId: number): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) return;

    await StorageService.updateCredentials(tabId, {
      loginConcluido: false,
      govBrCpfSubmitted: false,
      govBrPasswordSubmitted: false,
      govBrTwoFactorPending: false,
    });

    const credentials = await StorageService.getCredentials(tabId);
    if (!credentials) return;

    const portalType = credentials.portalType || "mte";
    const strategyName = portalType === "esocial" ? "eSocial"
      : portalType === "inss" ? "INSS"
      : portalType === "pesqbrasil_mpa" ? "PesqBrasilMPA"
      : "MTE";
    const strategy = this.strategies.find((s) => s.name === strategyName);
    if (!strategy) return;

    await this.executeWithRetry(tabId, tab.url, credentials, strategy);
  }

  private extractHostLabel(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  private async handleCadastroPostLoginNav(
    tabId: number,
    tabUrl: string,
    creds: UserCredentials,
  ): Promise<void> {
    const key = "sigessActiveCadastro";
    const result = await StorageService.get<CadastroSession>(key);
    const session: CadastroSession | undefined = (result as any)[key];
    if (!session || session.sessionState !== "active") return;

    // Interações humanas do GOV.BR (2FA ou confirmação de contato) terminam
    // somente quando a mesma aba retorna ao portal autenticado.
    await StorageService.updateCadastroInteraction(creds.cadastroSessionId, undefined, tabId);

    if (creds.portalType === "ecac") {
      const ecac = session.portais.ecac;
      // Navega para a página CAEPF se ainda não estiver lá
      if (
        isEcacUrl(tabUrl) &&
        !isEcacCaepfCollectionUrl(tabUrl) &&
        !ecac.postLoginNavigationIssued &&
        !this.postLoginNavigationInFlight.has(tabId)
      ) {
        this.postLoginNavigationInFlight.add(tabId);
        ecac.postLoginNavigationIssued = true;
        ecac.updatedAt = Date.now();
        await StorageService.set({ [key]: session });
        await browser.tabs.update(tabId, {
          url: ECAC_COLLECTION_URL,
        });
      }
    } else if (creds.portalType === "cadunico") {
      if (tabUrl.endsWith("#/successLogin")) {
        await browser.tabs.update(tabId, { url: CADUNICO_HOME_URL });
        return;
      }
      // Abre tabs filhas somente uma vez (pesqbrasil ainda aguardando = não abertas)
      if (
        isCadUnicoUrl(tabUrl) &&
        session.portais.pesqbrasil.status === "aguardando"
      ) {
        await this.openCadastroSiblings(session, tabId, creds);
      }
    } else if (creds.portalType === "inss") {
      if (isInssUrl(tabUrl) && !isInssDataUrl(tabUrl)) {
        await browser.tabs.update(tabId, {
          url: INSS_DATA_URL,
        });
      }
    }
  }

  private async recheckCadastroSiblings(): Promise<void> {
    const key = "sigessActiveCadastro";
    const result = await StorageService.get<CadastroSession>(key);
    const session: CadastroSession | undefined = (result as any)[key];

    if (!session || session.sessionState !== "active") return;
    if (session.portais.pesqbrasil.status !== "aguardando") return;

    // Aguarda mínimo de 30s desde o início da sessão — CadÚnico pode ainda estar fazendo login
    const cadUnicoTabId = session.portais.cadunico.tabId;
    if (!cadUnicoTabId) return;

    const creds = await StorageService.getCredentials(cadUnicoTabId);
    if (!creds?.loginConcluido || !creds.isCadastroAutomatico) return;

    console.log("[TabManager] Watchdog: abrindo siblings que nao foram abertos pelo evento de navegacao.");
    await this.openCadastroSiblings(session, cadUnicoTabId, creds);
  }

  private async openCadastroSiblings(
    session: CadastroSession,
    _cadUnicoTabId: number,
    creds: UserCredentials,
  ): Promise<void> {
    const { cookieStoreId } = session;
    const { cpf, senha, nome, cadastroSessionId } = creds;
    if (!cpf || !senha) return;

    const key = "sigessActiveCadastro";

    // Marca os portais como "abrindo" antes de abrir as tabs
    session.portais.pesqbrasil = { status: "abrindo" };
    session.portais.ecac = { status: "abrindo" };
    await StorageService.set({ [key]: session });

    const [pesqTabId, ecacTabId] = await Promise.all([
      this.createSessionInContainer(
        PESQBRASIL_MPA_URL,
        cpf, senha, cookieStoreId, nome, "pesqbrasil_mpa", cadastroSessionId,
      ),
      this.createSessionInContainer(
        ECAC_LOGIN_URL,
        cpf, senha, cookieStoreId, nome, "ecac", cadastroSessionId,
      ),
    ]);

    if (pesqTabId) session.portais.pesqbrasil.tabId = pesqTabId;
    if (ecacTabId) session.portais.ecac.tabId = ecacTabId;
    await StorageService.set({ [key]: session });

    const cadunico = session.portais.cadunico;
    const tseDecidido = Boolean(session.portais.tse);
    if (
      cadunico.status === "concluido" &&
      tseDecidido &&
      typeof cadunico.tabId === "number" &&
      typeof pesqTabId === "number" &&
      typeof ecacTabId === "number"
    ) {
      try {
        await browser.tabs.remove(cadunico.tabId);
      } catch {
        // A aba pode ter sido fechada pela finalizacao concorrente do fluxo.
      }
    }
  }

  async handleTabRemoval(
    tabId: number,
    _removeInfo: browser.tabs._OnRemovedRemoveInfo,
  ) {
    // Detecta fechamento inesperado de tab de cadastro automático
    const creds = await StorageService.getCredentials(tabId);
    if (creds?.isCadastroAutomatico && creds.portalType) {
      const key = "sigessActiveCadastro";
      const result = await StorageService.get<CadastroSession>(key);
      const session: CadastroSession | undefined = (result as any)[key];
      if (session?.sessionState === "active") {
        const portalMap: Record<string, keyof typeof session.portais> = {
          cadunico: "cadunico",
          ecac: "ecac",
          pesqbrasil_mpa: "pesqbrasil",
          tse: "tse",
          inss: "inss",
        };
        const portalKey = portalMap[creds.portalType];
        const portal = portalKey ? session.portais[portalKey] : undefined;
        const belongsToCurrentSession = creds.cadastroSessionId === session.sessionId;
        const isCurrentPortalTab = portal?.tabId === tabId;
        if (
          portal &&
          belongsToCurrentSession &&
          isCurrentPortalTab &&
          !["concluido", "dispensado", "nao_encontrado", "indisponivel", "erro"].includes(portal.status)
        ) {
          portal.status = "erro";
          await StorageService.set({ [key]: session });
        }
      }
    }

    await StorageService.clearCredentials(tabId);
    const containerId = await this.getTabContainer(tabId);
    await this.clearTabContainer(tabId);
    this.processingTabs.delete(tabId);
    this.postLoginNavigationInFlight.delete(tabId);
    this.govBrCpfWatchers.delete(tabId);
    for (const [windowId, state] of this.govBrFocusRestore.entries()) {
      state.pendingTabs.delete(tabId);
      if (state.pendingTabs.size === 0) this.govBrFocusRestore.delete(windowId);
    }

    if (containerId && !creds?.isCadastroAutomatico && this.supportsContextualIdentities()) {
      this.enqueueContainerOp(() => this.processContainerRetention(containerId));
    }
  }

  private async focusGovBrTab(tabId: number): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.active || typeof tab.windowId !== "number") return;

    const credentials = await StorageService.getCredentials(tabId);
    // No login manual, a aba do portal deve permanecer aberta e focada para
    // que o usuário continue trabalhando nela após a autenticação.
    if (!credentials?.isCadastroAutomatico) {
      await browser.tabs.update(tabId, { active: true });
      return;
    }

    let state = this.govBrFocusRestore.get(tab.windowId);
    if (!state) {
      const activeTabs = await browser.tabs.query({ windowId: tab.windowId, active: true });
      const previous = activeTabs[0];
      state = {
        tabId: typeof previous?.id === "number" && previous.id !== tabId ? previous.id : null,
        pendingTabs: new Set<number>(),
      };
      this.govBrFocusRestore.set(tab.windowId, state);
    }
    state.pendingTabs.add(tabId);

    await browser.tabs.update(tabId, { active: true });
  }

  private async restoreGovBrFocus(tabId: number): Promise<void> {
    const credentials = await StorageService.getCredentials(tabId);
    if (credentials?.govBrTwoFactorPending) return;

    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (!tab || typeof tab.windowId !== "number") return;
    const state = this.govBrFocusRestore.get(tab.windowId);
    if (!state) return;
    state.pendingTabs.delete(tabId);
    if (state.pendingTabs.size > 0) return;

    try {
      const activeTabs = await browser.tabs.query({ windowId: tab.windowId, active: true });
      if (activeTabs[0]?.id === tabId && state.tabId !== null) {
        await browser.tabs.update(state.tabId, { active: true });
      }
    } catch {
      // A aba anterior pode ter sido fechada durante o fluxo.
    } finally {
      this.govBrFocusRestore.delete(tab.windowId);
    }
  }

  private watchGovBrCpfField(tabId: number): void {
    if (this.govBrCpfWatchers.has(tabId)) return;
    this.govBrCpfWatchers.add(tabId);

    void (async () => {
      try {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const credentials = await StorageService.getCredentials(tabId);
          if (!credentials || credentials.loginConcluido || credentials.govBrTwoFactorPending) return;

          const tab = await browser.tabs.get(tabId).catch(() => null);
          if (!tab?.url?.includes("sso.acesso.gov.br")) return;

          try {
            const cpfVisible = await DOMInjector.execute(
              tabId,
              () => {
                const field = document.querySelector("#accountId") as HTMLElement | null;
                return Boolean(field && field.offsetParent !== null);
              },
            );
            if (cpfVisible) {
              await this.restoreGovBrFocus(tabId);
              return;
            }
          } catch {
            // A página pode estar transitando entre as telas do Gov.br.
          }

          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      } finally {
        this.govBrCpfWatchers.delete(tabId);
      }
    })();
  }

  private async processContainerRetention(containerId: string): Promise<void> {
    try {
      const list = await this.getRecentContainers();
      const deduped = list.filter((id) => id !== containerId);
      const updated = [containerId, ...deduped];

      if (updated.length > 5) {
        const oldestId = updated.pop();
        if (oldestId) {
          try {
            await (browser as any).contextualIdentities.remove(oldestId);
            console.log(`[SIGESS] Conteiner excedente ${oldestId} removido.`);
          } catch (e) {
            console.debug(`[SIGESS] Nao foi possivel remover conteiner ${oldestId}:`, e);
          }
        }
      }

      await this.saveRecentContainers(updated);
      console.log(`[SIGESS] Conteiner ${containerId} mantido na lista de recentes.`);
    } catch (error) {
      console.error("[SIGESS] Erro no processamento de retencao de conteiner:", error);
    }
  }
}
