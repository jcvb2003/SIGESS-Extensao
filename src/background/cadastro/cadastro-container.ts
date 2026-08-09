import { StorageService } from "../services/storage";

const CADASTRO_CONTAINER_KEY = "sigessCadastroAutomaticoContainerId";
const CADASTRO_CONTAINER_NAME = "SIGESS Cadastro Automático";

function getContextualIdentitiesApi(): any {
  return (browser as any).contextualIdentities;
}

async function containerExists(cookieStoreId: string): Promise<boolean> {
  try {
    await getContextualIdentitiesApi().get(cookieStoreId);
    return true;
  } catch {
    return false;
  }
}

async function createCadastroContainer(): Promise<string> {
  const container = await getContextualIdentitiesApi().create({
    name: CADASTRO_CONTAINER_NAME,
    color: "green",
    icon: "briefcase",
  });
  await StorageService.set({ [CADASTRO_CONTAINER_KEY]: container.cookieStoreId });
  return container.cookieStoreId;
}

async function resolveCadastroContainer(): Promise<string> {
  const stored = await StorageService.get<string>(CADASTRO_CONTAINER_KEY);
  const cookieStoreId = stored[CADASTRO_CONTAINER_KEY];
  if (cookieStoreId && await containerExists(cookieStoreId)) return cookieStoreId;

  if (cookieStoreId) await StorageService.remove(CADASTRO_CONTAINER_KEY);
  return createCadastroContainer();
}

export async function closeCadastroContainerTabs(cookieStoreId: string): Promise<void> {
  const tabs = await browser.tabs.query({ cookieStoreId } as any);
  const tabIds = tabs
    .map((tab) => tab.id)
    .filter((tabId): tabId is number => typeof tabId === "number");
  for (const tabId of tabIds) {
    try {
      await browser.tabs.remove(tabId);
    } catch {
      // A aba pode ter sido encerrada em paralelo por um coletor.
    }
  }
}

async function clearDynamicSiteData(cookieStoreId: string): Promise<void> {
  const browsingData = (browser as any).browsingData;
  if (!browsingData?.remove) {
    throw new Error("A API browsingData não está disponível no Firefox atual.");
  }

  // O container pertence exclusivamente ao cadastro automático. Preserva seus
  // caches, mas remove autenticação e armazenamento dinâmico da pessoa anterior.
  await browsingData.remove(
    { cookieStoreId },
    { cookies: true, indexedDB: true, localStorage: true },
  );

  const remainingCookies = await browser.cookies.getAll({ storeId: cookieStoreId });
  if (remainingCookies.length > 0) {
    throw new Error(`A limpeza deixou ${remainingCookies.length} cookie(s) no container.`);
  }
}

async function recreateCadastroContainer(cookieStoreId: string): Promise<string> {
  try {
    await getContextualIdentitiesApi().remove(cookieStoreId);
  } catch {
    // O container exclusivo pode ter sido removido pelo usuário.
  }
  await StorageService.remove(CADASTRO_CONTAINER_KEY);
  return createCadastroContainer();
}

export async function prepareCadastroContainer(): Promise<string> {
  let cookieStoreId = await resolveCadastroContainer();
  await closeCadastroContainerTabs(cookieStoreId);

  try {
    await clearDynamicSiteData(cookieStoreId);
  } catch (error) {
    console.warn("[SIGESS] Falha ao higienizar container de cadastro; recriando:", error);
    cookieStoreId = await recreateCadastroContainer(cookieStoreId);
  }

  return cookieStoreId;
}

export async function sanitizeCadastroContainer(cookieStoreId: string): Promise<void> {
  const stored = await StorageService.get<string>(CADASTRO_CONTAINER_KEY);
  if (stored[CADASTRO_CONTAINER_KEY] !== cookieStoreId) {
    console.debug("[SIGESS] Container automático legado não será alterado pela retenção persistente.");
    return;
  }

  try {
    await clearDynamicSiteData(cookieStoreId);
  } catch (error) {
    console.warn("[SIGESS] Falha na limpeza final do container; recriando:", error);
    await recreateCadastroContainer(cookieStoreId);
  }
}
