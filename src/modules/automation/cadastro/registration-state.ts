export interface RegistrationRuntimeState {
  settings: any;
  autoEnabled: boolean;
  cadastroSessionActive: boolean;
}

export async function loadRegistrationRuntimeState(): Promise<RegistrationRuntimeState> {
  const api = globalThis.browser || globalThis.chrome;
  const [settingsResult, cadastroResult] = await Promise.all([
    api.storage.local.get("sigessSettings"),
    api.storage.local.get("sigessActiveCadastro"),
  ]);
  const settings = settingsResult.sigessSettings || {};
  const cadastroSessionActive = cadastroResult.sigessActiveCadastro?.sessionState === "active";
  return {
    settings,
    cadastroSessionActive,
    autoEnabled: Boolean(settings.autoRegistrationEnabled) || cadastroSessionActive,
  };
}

export function observeRegistrationStorage(
  callback: (changes: any) => void,
): void {
  (globalThis.browser || globalThis.chrome).storage.onChanged.addListener(callback);
}
