import { AppSettings, UserCredentials } from '../../shared/types';

// Declare chrome global for TypeScript if not available from types
declare var chrome: any;

export class StorageService {
    static async get<T>(keys: string | string[]): Promise<Record<string, T>> {
        return new Promise((resolve, reject) => {
            try {
                if (typeof browser !== 'undefined' && browser.storage) {
                    // Firefox / Polyfill: Retorna Promise
                    browser.storage.local.get(keys).then((res) => resolve(res as Record<string, T>)).catch(reject);
                } else if (typeof chrome !== 'undefined' && chrome.storage) {
                    // Chrome: Usa Callback
                    chrome.storage.local.get(keys, (res: any) => resolve(res as Record<string, T>));
                } else {
                    resolve({});
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    static async set(data: Record<string, any>): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if (typeof browser !== 'undefined' && browser.storage) {
                    browser.storage.local.set(data).then(() => resolve()).catch(reject);
                } else if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.set(data, () => resolve());
                } else {
                    resolve();
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    static async remove(keys: string | string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if (typeof browser !== 'undefined' && browser.storage) {
                    browser.storage.local.remove(keys).then(() => resolve()).catch(reject);
                } else if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.remove(keys, () => resolve());
                } else {
                    resolve();
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    // Helpers específicos
    static async getSettings(): Promise<AppSettings> {
        const result = await this.get<AppSettings>('sinpescaSettings');
        return result.sinpescaSettings || {
            consultarGuias: false,
            gerarGps: false,
            selectedYear: 'current',
            selectedMonth: '08',
            valorComercializado: '',
            reapData: {
                2021: '',
                2022: '',
                2023: '',
                2024: ''
            }
        };
    }

    static async saveSettings(settings: AppSettings): Promise<void> {
        await this.set({ sinpescaSettings: settings });
    }

    static async getCredentials(tabId: number): Promise<UserCredentials | null> {
        const key = `credenciais_${tabId}`;
        const result = await this.get<UserCredentials>(key);
        return result[key] || null;
    }

    static async saveCredentials(tabId: number, creds: UserCredentials): Promise<void> {
        const key = `credenciais_${tabId}`;
        await this.set({ [key]: creds });
    }

    static async clearCredentials(tabId: number): Promise<void> {
        const key = `credenciais_${tabId}`;
        await this.remove(key);
    }
}
