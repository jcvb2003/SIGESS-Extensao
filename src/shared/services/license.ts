import { getFingerprint } from "../utils/fingerprint";

const EDGE_FUNCTION_URL = "https://vdwupmfpfkaempsiqfgb.supabase.co/functions/v1/check-license";

export type LicenseReason =
  | "invalid_key" | "wrong_device" | "expired" | "blocked" | "no_key"
  | "network_error" | "database_error" | "unauthorized_access"
  | "missing_parameters" | "internal_error" | "invalid_signature";

export interface LicenseResult {
  ok: boolean;
  plan?: "paid";
  status?: string;
  devices?: number;
  max_devices?: number;
  expires_at?: string;
  updated_at?: string;
  reason?: LicenseReason;
  valid_until?: string;
  sig?: string;
  device_name?: string;
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
  }

  static async saveKey(key: string): Promise<void> {
    await browser.storage.local.set({ license_key: key });
    await this.resetCache();
  }

  private static getAppSecret(): string {
    return (import.meta as any).env?.VITE_APP_SECRET || "";
  }

  private static async verifySignature(data: LicenseResult, sig: string): Promise<boolean> {
    if (!sig) return false;
    try {
      const message = JSON.stringify({
        ok: data.ok, plan: data.plan, status: data.status, devices: data.devices,
        max_devices: data.max_devices, expires_at: data.expires_at,
        valid_until: data.valid_until, updated_at: data.updated_at,
      });
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        "raw", encoder.encode(this.getAppSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
      );
      const sigArray = new Uint8Array(sig.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
      return crypto.subtle.verify("HMAC", cryptoKey, sigArray, encoder.encode(message));
    } catch (error) {
      console.error("Signature verification error:", error);
      return false;
    }
  }

  static isLocallyActive(cache: LicenseResult | null | undefined): boolean {
    if (!cache?.ok || cache.status === "blocked") return false;
    return !cache.expires_at || new Date(cache.expires_at) > new Date();
  }

  private static async isCacheValid(cache: LicenseResult): Promise<boolean> {
    const now = new Date();
    if (cache.last_check_date !== now.toISOString().split("T")[0]) return false;
    if (cache.cache_until && new Date(cache.cache_until) < now) return false;
    return this.isLocallyActive(cache);
  }

  private static async getMemoryCache(): Promise<LicenseResult | null> {
    if (!this.memoryCache || !(await this.isCacheValid(this.memoryCache))) return null;
    return this.memoryCache;
  }

  private static async getStorageCache(): Promise<LicenseResult | null> {
    const { license_cache } = await browser.storage.local.get("license_cache");
    const sig = license_cache?.signature || license_cache?.sig;
    if (!license_cache || !sig || !(await this.verifySignature(license_cache, sig))) return null;
    if (!(await this.isCacheValid(license_cache))) return null;
    this.memoryCache = license_cache;
    return license_cache;
  }

  static async checkLicense(
    forceLive = false,
    _legacyForceConsume?: boolean,
    _legacyUsageType?: string,
    deviceName?: string,
  ): Promise<LicenseResult> {
    if (!forceLive) {
      const memory = await this.getMemoryCache();
      if (memory) return memory;
      const storage = await this.getStorageCache();
      if (storage) return storage;
    }
    return this.performLiveCheck("status", deviceName);
  }

  private static async performLiveCheck(
    action: "status" | "update_name" = "status", deviceName?: string,
  ): Promise<LicenseResult> {
    const key = await this.getSavedKey();
    if (!key) return { ok: false, reason: "no_key" };
    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-secret": this.getAppSecret() },
        body: JSON.stringify({ key, fingerprint: await getFingerprint(), action, device_name: deviceName }),
      });
      const result = await response.json();
      const sig = result.signature || result.sig;
      if (!result.ok || !sig) return result;
      if (!(await this.verifySignature(result, sig))) return { ok: false, reason: "invalid_signature" };
      const now = new Date();
      const cachedResult: LicenseResult = {
        ...result, sig,
        cache_until: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        last_check_date: now.toISOString().split("T")[0],
      };
      await browser.storage.local.set({ license_cache: cachedResult });
      this.memoryCache = cachedResult;
      return cachedResult;
    } catch (error) {
      console.error("License check failed:", error);
      return this.handleFailOpen();
    }
  }

  private static async handleFailOpen(): Promise<LicenseResult> {
    const { license_cache } = await browser.storage.local.get("license_cache");
    if (license_cache?.plan === "paid" && (await this.isCacheValid(license_cache))) {
      return { ...license_cache, ok: true };
    }
    return { ok: false, reason: "network_error" };
  }

  static async getStatus(): Promise<LicenseResult> { return this.checkLicense(); }
  static async updateDeviceName(name: string): Promise<LicenseResult> {
    return this.performLiveCheck("update_name", name);
  }
}
