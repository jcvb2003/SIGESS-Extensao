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
  | "internal_error";
export interface LicenseResult {
  ok: boolean;
  plan?: "trial" | "paid";
  usage_count?: number;
  max_usage?: number;
  devices?: number;
  max_devices?: number;
  expires_at?: string;
  reason?: LicenseReason;
  valid_until?: string;
  sig?: string;
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
  private static async verifySignature(
    data: any,
    sig: string,
  ): Promise<boolean> {
    if (!sig) return false;
    try {
      const msg = `${data.ok}${data.plan || ""}${data.usage_count || ""}${data.devices || ""}${data.max_devices || ""}${data.valid_until}`;
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
  ): Promise<LicenseResult> {
    // Se forceLive for verdadeiro, ignoramos o cache de memória e storage
    if (!forceConsume && !forceLive) {
      const memory = this.getMemoryCache(forceLive);
      if (memory) return memory;
      const storage = await this.getStorageCache(forceLive);
      if (storage) return storage;
    }
    return this.performLiveCheck(forceConsume ? "check" : "status");
  }
  private static getMemoryCache(forceLive: boolean): LicenseResult | null {
    if (!forceLive && this.memoryCache) {
      const isFresh =
        !this.memoryCache.valid_until ||
        new Date(this.memoryCache.valid_until) > new Date();
      if (isFresh) return this.memoryCache;
    }
    return null;
  }
  private static async getStorageCache(
    forceLive: boolean,
  ): Promise<LicenseResult | null> {
    if (forceLive) return null;
    const { license_cache } = await browser.storage.local.get("license_cache");
    if (license_cache?.sig) {
      const isAuthentic = await this.verifySignature(
        license_cache,
        license_cache.sig,
      );
      const isFresh =
        !license_cache.valid_until ||
        new Date(license_cache.valid_until) > new Date();
      if (isAuthentic && isFresh) {
        this.memoryCache = license_cache;
        return license_cache;
      }
    }
    return null;
  }
  private static async performLiveCheck(
    action: "check" | "status" = "status",
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
        body: JSON.stringify({ key, fingerprint, action }),
      });
      const result = await response.json();
      if (result.ok && result.sig) {
        await browser.storage.local.set({ license_cache: result });
        this.memoryCache = result;
      }
      return result;
    } catch (error) {
      console.error("License check failed:", error);
      return this.handleFailOpen();
    }
  }
  private static async handleFailOpen(): Promise<LicenseResult> {
    const { license_cache } = await browser.storage.local.get("license_cache");
    if (license_cache?.plan === "paid") {
      return { ...license_cache, ok: true };
    }
    return { ok: false, reason: "network_error" };
  }
  static async getStatus(): Promise<LicenseResult> {
    return this.checkLicense();
  }
}
