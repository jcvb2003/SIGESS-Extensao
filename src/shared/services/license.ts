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
  | "limit_reached_agro"
  | "invalid_signature";

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
  updated_at?: string; // NOVO: Timestamp de última alteração no servidor
  reason?: LicenseReason;
  valid_until?: string;
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

  static async resetCache(): Promise<void> {
    await browser.storage.local.remove("license_cache");
    this.memoryCache = null;
    console.log("License cache has been reset.");
  }

  static async saveKey(key: string): Promise<void> {
    await browser.storage.local.set({ license_key: key });
    await this.resetCache();
  }

  private static getAppSecret(): string {
    // @ts-ignore: Vite injects this
    return (import.meta as any).env?.VITE_APP_SECRET || "";
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
      const secret = this.getAppSecret();
      
      // Reconstroi o objeto com campos em ordem fixa para garantir o mesmo hash JSON.stringify
      const msg = JSON.stringify({
        ok: data.ok,
        plan: data.plan,
        status: data.status,
        usage_manual: data.usage_manual,
        max_manual: data.max_manual,
        usage_turbo: data.usage_turbo,
        max_turbo: data.max_turbo,
        usage_agro: data.usage_agro,
        max_agro: data.max_agro,
        usage_count: data.usage_count,
        max_usage: data.max_usage,
        devices: data.devices,
        max_devices: data.max_devices,
        expires_at: data.expires_at,
        valid_until: data.valid_until,
        updated_at: data.updated_at
      });
      
      const encoder = new TextEncoder();
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
      const sigArray = new Uint8Array(
        sig.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)),
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
    usageType: 'manual' | 'turbo' | 'agro' | 'activate' = 'manual',
    deviceName?: string
  ): Promise<LicenseResult> {
    // Se não for para consumir e não houver obrigatoriedade de live check, tenta o cache
    if (!forceConsume && !forceLive) {
      const memory = await this.getMemoryCache(forceLive);
      if (memory) return memory;
      const storage = await this.getStorageCache(forceLive);
      if (storage) return storage;
    }
    
    // Ação: "check" (consome) ou "status" (apenas consulta/vincula)
    const action = forceConsume ? "check" : "status";
    
    return this.performLiveCheck(action, usageType, deviceName);
  }

  private static async getMemoryCache(forceLive: boolean): Promise<LicenseResult | null> {
    if (forceLive || !this.memoryCache) return null;
    if (!(await this.isCacheValid(this.memoryCache))) return null;
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
      
      if (isAuthentic && (await this.isCacheValid(license_cache))) {
        this.memoryCache = license_cache;
        return license_cache;
      }
    }
    return null;
  }

  /**
   * Verifica se o cache ainda é confiável.
   * Além do tempo de expiração local (8h), realiza um "Version Check" rápido via REST 
   * se o cache local estiver prestes a ser usado em uma sessão ativa.
   */
  private static async isCacheValid(cache: LicenseResult): Promise<boolean> {
    const now = new Date();
    
    // 1. Midnight Boundary (Deve ter sido validado na data de hoje local)
    const today = new Date().toISOString().split('T')[0];
    if (cache.last_check_date !== today) return false;

    // 2. Local Extended Cache (8h)
    if (cache.cache_until && new Date(cache.cache_until) < now) return false;

    // 3. Version Check (updated_at) - Otimizado via REST
    // Se temos a key e o fingerprint, verificamos se o servidor tem um updated_at mais novo
    if (cache.updated_at) {
      const remoteVersion = await this.checkRemoteVersion();
      if (remoteVersion && remoteVersion !== cache.updated_at) {
        console.log("License cache invalidated: server version mismatch.");
        return false;
      }
    }

    return true;
  }

  /**
   * Query REST direta para buscar apenas o updated_at.
   * Zero custo de Edge Function.
   */
  static async checkRemoteVersion(): Promise<string | null> {
    try {
      const key = await this.getSavedKey();
      if (!key) return null;

      const SUPABASE_URL = EDGE_FUNCTION_URL.split('/functions')[0];
      const ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";
      
      const response = await fetch(`${SUPABASE_URL}/rest/v1/licenses?select=updated_at&key=eq.${key}`, {
        headers: {
          "apikey": ANON_KEY,
          "Authorization": `Bearer ${ANON_KEY}`
        }
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data[0]?.updated_at || null;
    } catch (e) {
      console.error("Remote version check failed:", e);
      return null;
    }
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
          "x-app-secret": this.getAppSecret()
        },
        body: JSON.stringify({ 
           key, 
           fingerprint, 
           action, 
           usage_type: usageType,
           device_name: deviceName
        }),
      });

      const result = await response.json();
      const sig = result.signature || result.sig;

      if (result.ok && sig) {
        // Validação imediata da assinatura recebida
        const isValid = await this.verifySignature(result, sig);
        if (!isValid) {
          console.error('[SIGESS] Falha crítica: Assinatura do servidor inválida!');
          return { ok: false, reason: "invalid_signature" };
        }

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
    if (license_cache?.plan === "paid" && (await this.isCacheValid(license_cache))) {
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
