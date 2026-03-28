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
    const current = result.sigessSettings || {};

    const defaults: AppSettings = {
      consultarGuias: false,
      gerarGps: false,
      selectedYear: "current",
      selectedMonth: "08",
      valorComercializado: "",
      reapData: {
        2021: "", 2022: "", 2023: "", 2024: "",
      },
      mpaSpecies: [
        { id: 12, kgMin: "60", kgMax: "70", priceMin: "8.00", priceMax: "11.00" },
        { id: 21, kgMin: "55", kgMax: "60", priceMin: "8.00", priceMax: "12.00" },
        { id: 26, kgMin: "55", kgMax: "60", priceMin: "9.00", priceMax: "13.00" },
        { id: 25, kgMin: "55", kgMax: "60", priceMin: "10.00", priceMax: "13.00" },
        { id: 15, kgMin: "45", kgMax: "50", priceMin: "13.00", priceMax: "16.00" },
      ],
      mpaMascProdMin: "2850",
      mpaMascProdMax: "3075",
      mpaMascDaysMin: "125",
      mpaMascDaysMax: "135",
      mpaFemProdMin: "2550",
      mpaFemProdMax: "2850",
      mpaFemDaysMin: "118",
      mpaFemDaysMax: "124",
    };

    // Deep merge simples (apenas 1 nível para objetos básicos, mpaSpecies é tratado à parte se necessário)
    return {
      ...defaults,
      ...current,
      // Se mpaSpecies vier vazio ou incompleto do storage, forçamos o padrão se as configurações MPA forem novas
      mpaSpecies: current.mpaSpecies && current.mpaSpecies.length > 0 ? current.mpaSpecies : defaults.mpaSpecies,
    };
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
