import { getFingerprint } from "../utils/fingerprint";

const EDGE_FUNCTION_URL =
  "https://vdwupmfpfkaempsiqfgb.supabase.co/functions/v1/check-license";

export type LicenseReason =
  | "invalid_key"
  | "wrong_device"
  | "trial_expired"
  | "expired"
  | "blocked"
  | "no_key"
  | "network_error"
  | "database_error"
  | "unauthorized_access"
  | "missing_parameters"
  | "internal_error"
  | "limit_reached_manual"
  | "limit_reached_turbo"
  | "limit_reached_agro";

export interface LicenseResult {
  ok: boolean;
  plan?: "trial" | "paid";
  status?: string;
  
  // Contadores Segmentados
  usage_manual?: number;
  max_manual?: number;
  usage_turbo?: number;
  max_turbo?: number;
  usage_agro?: number;
  max_agro?: number;

  // Legado
  usage_count?: number;
  max_usage?: number;

  devices?: number;
  max_devices?: number;
  expires_at?: string;
  reason?: LicenseReason;
  valid_until?: string; // Mantido no tipo, mas não confiamos no retorno do servidor
  sig?: string;
  device_name?: string;

  // Cache Estendido (Gerado no cliente)
  cache_until?: string;
  last_check_date?: string;
}

export class LicenseService {
  private static memoryCache: LicenseResult | null = null;

  static async getSavedKey(): Promise<string | null> {
    const { license_key } = await browser.storage.local.get("license_key");
    return license_key || null;
  }

  static async saveKey(key: string): Promise<void> {
    await browser.storage.local.set({ license_key: key });
    await browser.storage.local.remove("license_cache");
    this.memoryCache = null;
  }

  private static getAppSecret(): string {
    return (import.meta as any).env?.VITE_APP_SECRET || (globalThis as any).VITE_APP_SECRET_MOCK || "";
  }

  /**
   * Verifica a integridade dos dados usando HMAC SHA-256.
   * O servidor assina o JSON.stringify() do objeto de resultado do RPC.
   */
  private static async verifySignature(
    data: any,
    sig: string,
  ): Promise<boolean> {
    if (!sig) return false;
    try {
      // Reconstroi o objeto exatamente como o servidor o assinou
      // Remove campos injetados pelo cliente (sig, signature, cache_until, last_check_date)
      const { 
        sig: _s, 
        signature: _sig, 
        cache_until: _cu, 
        last_check_date: _lcd, 
        ...serverData 
      } = data;
      
      const msg = JSON.stringify(serverData);
      
      const encoder = new TextEncoder();
      const secret = this.getAppSecret();
      const keyData = encoder.encode(secret);
      const msgData = encoder.encode(msg);
      
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      
      // Converte hex string para Uint8Array
      const sigHex = sig;
      const sigArray = new Uint8Array(
        sigHex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)),
      );
      
      return await crypto.subtle.verify("HMAC", cryptoKey, sigArray, msgData);
    } catch (e) {
      console.error("Signature verification error:", e);
      return false;
    }
  }

  static async checkLicense(
    forceLive = false,
    forceConsume = false,
    usageType: 'manual' | 'turbo' | 'agro' | 'activate' = 'manual'
  ): Promise<LicenseResult> {
    // Se não for para consumir e não houver obrigatoriedade de live check, tenta o cache
    if (!forceConsume && !forceLive) {
      const memory = this.getMemoryCache(forceLive);
      if (memory) return memory;
      const storage = await this.getStorageCache(forceLive);
      if (storage) return storage;
    }
    
    // Ação: "check" (consome) ou "status" (apenas consulta/vincula)
    const action = forceConsume ? "check" : "status";
    
    return this.performLiveCheck(action, usageType);
  }

  private static getMemoryCache(forceLive: boolean): LicenseResult | null {
    if (forceLive || !this.memoryCache) return null;
    if (!this.isCacheValid(this.memoryCache)) return null;
    return this.memoryCache;
  }

  private static async getStorageCache(
    forceLive: boolean,
  ): Promise<LicenseResult | null> {
    if (forceLive) return null;
    const { license_cache } = await browser.storage.local.get("license_cache");
    
    if (license_cache) {
      const sig = license_cache.signature || license_cache.sig;
      if (!sig) return null;

      const isAuthentic = await this.verifySignature(license_cache, sig);
      
      if (isAuthentic && this.isCacheValid(license_cache)) {
        this.memoryCache = license_cache;
        return license_cache;
      }
    }
    return null;
  }

  private static isCacheValid(cache: LicenseResult): boolean {
    const now = new Date();
    
    // 1. Midnight Boundary (Deve ter sido validado na data de hoje local)
    const today = new Date().toISOString().split('T')[0];
    if (cache.last_check_date !== today) return false;

    // 2. Local Extended Cache (8h) - Gerado pelo cliente no performLiveCheck
    if (cache.cache_until && new Date(cache.cache_until) < now) return false;

    return true;
  }

  private static async performLiveCheck(
    action: "check" | "status" | "update_name" = "status",
    usageType?: string,
    deviceName?: string
  ): Promise<LicenseResult> {
    const key = await this.getSavedKey();
    const fingerprint = await getFingerprint();
    if (!key) return { ok: false, reason: "no_key" };

    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-secret": this.getAppSecret(),
        },
        body: JSON.stringify({ 
           key, 
           fingerprint, 
           action, 
           resource: usageType, // REVERTIDO: O servidor v12 espera 'resource'
           device_name: deviceName
        }),
      });

      const result = await response.json();
      const sig = result.signature || result.sig;

      if (result.ok && sig) {
        // Enriquecemos o resultado com dados de cache local
        // O cache_until e last_check_date são separados para não quebrar a conferência HMAC do serverData
        const CACHE_8H = 8 * 60 * 60 * 1000;
        const now = new Date();
        const cachedResult: LicenseResult = {
          ...result,
          sig, // Garantimos que o campo sig/signature esteja presente para o storage
          cache_until: new Date(now.getTime() + CACHE_8H).toISOString(),
          last_check_date: now.toISOString().split('T')[0]
        };

        await browser.storage.local.set({ license_cache: cachedResult });
        this.memoryCache = cachedResult;
        return cachedResult;
      }
      return result;
    } catch (error) {
      console.error("License check failed:", error);
      return this.handleFailOpen();
    }
  }

  private static async handleFailOpen(): Promise<LicenseResult> {
    const { license_cache } = await browser.storage.local.get("license_cache");
    // Fail-open restrito ao mesmo dia e apenas para pagos
    if (license_cache?.plan === "paid" && this.isCacheValid(license_cache)) {
      return { ...license_cache, ok: true };
    }
    return { ok: false, reason: "network_error" };
  }

  static async getStatus(): Promise<LicenseResult> {
    return this.checkLicense();
  }

  static async updateDeviceName(name: string): Promise<LicenseResult> {
    return this.performLiveCheck("update_name", undefined, name);
  }
}
