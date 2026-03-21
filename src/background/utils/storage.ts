import { AppSettings, UserCredentials } from "../../shared/types";
declare var chrome: any;
function getBrowserStorage() {
  if (typeof browser !== "undefined" && browser.storage)
    return browser.storage.local;
  if (typeof chrome !== "undefined" && chrome.storage)
    return chrome.storage.local;
  return null;
}
export class StorageService {
  static async get<T>(keys: string | string[]): Promise<Record<string, T>> {
    const storage = getBrowserStorage();
    if (!storage) return {} as Record<string, T>;
    return storage.get(keys) as Promise<Record<string, T>>;
  }
  static async set(data: Record<string, any>): Promise<void> {
    const storage = getBrowserStorage();
    if (storage) return storage.set(data);
  }
  static async remove(keys: string | string[]): Promise<void> {
    const storage = getBrowserStorage();
    if (storage) return storage.remove(keys);
  }
  static async getSettings(): Promise<AppSettings> {
    const result = await this.get<AppSettings>("sigessSettings");
    return (
      result.sigessSettings || {
        consultarGuias: false,
        gerarGps: false,
        selectedYear: "current",
        selectedMonth: "08",
        valorComercializado: "",
        reapData: {
          2021: "",
          2022: "",
          2023: "",
          2024: "",
        },
      }
    );
  }
  static async saveSettings(settings: AppSettings): Promise<void> {
    await this.set({ sigessSettings: settings });
  }
  static async getCredentials(tabId: number): Promise<UserCredentials | null> {
    const key = `credenciais_${tabId}`;
    const result = await this.get<UserCredentials>(key);
    return result[key] || null;
  }
  static async saveCredentials(
    tabId: number,
    creds: UserCredentials,
  ): Promise<void> {
    const key = `credenciais_${tabId}`;
    await this.set({ [key]: creds });
  }
  static async clearCredentials(tabId: number): Promise<void> {
    const key = `credenciais_${tabId}`;
    await this.remove(key);
  }
}
