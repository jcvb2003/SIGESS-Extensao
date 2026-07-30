import { getFingerprint } from "../utils/fingerprint";

const LICENSE_API_URL = "https://api.sigess.com.br";
const ENTITLEMENT_ISSUER = LICENSE_API_URL;
const ENTITLEMENT_AUDIENCE = "sigess-extension";
const ENTITLEMENT_PUBLIC_JWK: JsonWebKey & { kid: string } = {
  kty: "EC",
  crv: "P-256",
  x: "L9ph2MQ6R7lePSmTe-qB6-9DoI_QjQwUwGhMkGW2dSk",
  y: "scbHSnog8t9ehk2OzCPtZHm5r7sphnMmHupJnYCtNys",
  kid: "sigess-license-2026-07-v1",
  use: "sig",
  alg: "ES256",
};

const STORAGE_KEYS = {
  cache: "license_cache",
  key: "license_key",
  licenseId: "license_api_id",
  deviceToken: "license_device_token",
} as const;

export type LicenseReason =
  | "invalid_key" | "wrong_device" | "expired" | "blocked" | "no_key"
  | "network_error" | "database_error" | "unauthorized_access"
  | "missing_parameters" | "internal_error" | "invalid_signature"
  | "device_limit";

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
  device_name?: string;
  entitlement?: string;
  entitlement_expires_at?: string;
  auth_version?: number;
}

type DeviceCredentials = {
  licenseId: string;
  deviceToken: string;
};

type EntitlementClaims = {
  sub: string;
  fp: string;
  plan: string;
  ver: number;
  iss: string;
  aud: string;
  exp: number;
  typ: string;
};

type ApiSuccess = {
  ok: true;
  license_id?: string;
  device_token?: string;
  entitlement: string;
  entitlement_expires_at: string;
  auth_version?: number;
  websocket_url?: string;
  license?: {
    plan?: "paid";
    status?: string;
    devices?: number;
    max_devices?: number;
    expires_at?: string | null;
    device_name?: string;
    auth_version?: number;
  };
};

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function isAuthoritativeLicenseRejection(status?: number): boolean {
  return status !== undefined && status >= 400 && status < 500;
}

export async function verifyEntitlementToken(
  token: string,
  expectedFingerprint: string,
  expectedLicenseId?: string,
  publicJwk: JsonWebKey & { kid: string } = ENTITLEMENT_PUBLIC_JWK,
): Promise<EntitlementClaims | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[0])),
    ) as { alg?: string; kid?: string };
    if (header.alg !== "ES256" || header.kid !== publicJwk.kid) return null;

    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[1])),
    ) as EntitlementClaims;
    if (
      claims.iss !== ENTITLEMENT_ISSUER ||
      claims.aud !== ENTITLEMENT_AUDIENCE ||
      claims.typ !== "entitlement" ||
      claims.exp <= Math.floor(Date.now() / 1000) ||
      (expectedLicenseId && claims.sub !== expectedLicenseId) ||
      claims.fp !== await sha256Hex(expectedFingerprint)
    ) return null;

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      decodeBase64Url(parts[2]) as BufferSource,
      signed,
    );
    return valid ? claims : null;
  } catch {
    return null;
  }
}

export class LicenseService {
  private static memoryCache: LicenseResult | null = null;
  private static startupValidation: Promise<LicenseResult> | null = null;

  static async getSavedKey(): Promise<string | null> {
    const stored = await browser.storage.local.get(STORAGE_KEYS.key);
    return stored[STORAGE_KEYS.key] || null;
  }

  static async getDeviceCredentials(): Promise<DeviceCredentials | null> {
    const stored = await browser.storage.local.get([
      STORAGE_KEYS.licenseId,
      STORAGE_KEYS.deviceToken,
    ]);
    const licenseId = stored[STORAGE_KEYS.licenseId];
    const deviceToken = stored[STORAGE_KEYS.deviceToken];
    return typeof licenseId === "string" && typeof deviceToken === "string"
      ? { licenseId, deviceToken }
      : null;
  }

  static async resetCache(): Promise<void> {
    await browser.storage.local.remove(STORAGE_KEYS.cache);
    this.memoryCache = null;
  }

  private static async resetDeviceCredentials(): Promise<void> {
    await browser.storage.local.remove([
      STORAGE_KEYS.licenseId,
      STORAGE_KEYS.deviceToken,
    ]);
  }

  static async saveKey(key: string): Promise<void> {
    const normalized = key.trim();
    const previous = await this.getSavedKey();
    await browser.storage.local.set({ [STORAGE_KEYS.key]: normalized });
    if (previous !== normalized) await this.resetDeviceCredentials();
    await this.resetCache();
  }

  private static async verifyEntitlement(
    token: string,
    expectedLicenseId?: string,
  ): Promise<EntitlementClaims | null> {
    return verifyEntitlementToken(
      token,
      await getFingerprint(),
      expectedLicenseId,
    );
  }

  static isLocallyActive(cache: LicenseResult | null | undefined): boolean {
    if (!cache?.ok || cache.status === "blocked") return false;
    if (cache.expires_at && Date.parse(cache.expires_at) <= Date.now()) return false;
    return Boolean(
      cache.entitlement_expires_at &&
      Date.parse(cache.entitlement_expires_at) > Date.now(),
    );
  }

  private static async isCacheValid(cache: LicenseResult): Promise<boolean> {
    if (!this.isLocallyActive(cache) || !cache.entitlement) return false;
    const credentials = await this.getDeviceCredentials();
    const claims = await this.verifyEntitlement(
      cache.entitlement,
      credentials?.licenseId,
    );
    return Boolean(
      claims &&
      (cache.auth_version === undefined || claims.ver === cache.auth_version),
    );
  }

  private static async getMemoryCache(): Promise<LicenseResult | null> {
    if (!this.memoryCache || !(await this.isCacheValid(this.memoryCache))) return null;
    return this.memoryCache;
  }

  private static async getStorageCache(): Promise<LicenseResult | null> {
    const stored = await browser.storage.local.get(STORAGE_KEYS.cache);
    const cache = stored[STORAGE_KEYS.cache] as LicenseResult | undefined;
    if (!cache || !(await this.isCacheValid(cache))) return null;
    this.memoryCache = cache;
    return cache;
  }

  static async checkLicense(
    forceLive = false,
    _legacyForceConsume?: boolean,
    _legacyUsageType?: string,
    deviceName?: string,
  ): Promise<LicenseResult> {
    if (!forceLive && this.startupValidation) return this.startupValidation;
    if (!forceLive) {
      const memory = await this.getMemoryCache();
      if (memory) return memory;
      const storage = await this.getStorageCache();
      if (storage) return storage;
    }
    return this.performLiveCheck("status", deviceName);
  }

  private static mapApiError(code?: string): LicenseReason {
    switch (code) {
      case "invalid_license": return "invalid_key";
      case "device_limit": return "device_limit";
      case "device_already_activated":
      case "invalid_device": return "wrong_device";
      case "license_inactive": return "blocked";
      case "invalid_request": return "missing_parameters";
      case "upstream_error":
      case "upstream_network_error": return "database_error";
      default: return "internal_error";
    }
  }

  private static async apiRequest(
    path: string,
    body: Record<string, unknown>,
  ): Promise<ApiSuccess> {
    const response = await fetch(`${LICENSE_API_URL}${path}`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as ApiSuccess & {
      error?: { code?: string };
    };
    if (!response.ok || !payload.ok) {
      const code = payload.error?.code;
      const error = new Error(code || "api_error") as Error & {
        reason?: LicenseReason;
        status?: number;
      };
      error.reason = this.mapApiError(code);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  private static async cacheApiResult(
    payload: ApiSuccess,
    fallback?: LicenseResult,
  ): Promise<LicenseResult> {
    const credentials = await this.getDeviceCredentials();
    const claims = await this.verifyEntitlement(
      payload.entitlement,
      payload.license_id || credentials?.licenseId,
    );
    if (!claims) return { ok: false, reason: "invalid_signature" };

    const license = payload.license;
    const cachedResult: LicenseResult = {
      ...fallback,
      ok: true,
      plan: license?.plan ?? fallback?.plan ?? "paid",
      status: license?.status ?? fallback?.status ?? "active",
      devices: license?.devices ?? fallback?.devices,
      max_devices: license?.max_devices ?? fallback?.max_devices,
      expires_at: license?.expires_at ?? fallback?.expires_at,
      device_name: license?.device_name ?? fallback?.device_name,
      entitlement: payload.entitlement,
      entitlement_expires_at: payload.entitlement_expires_at,
      auth_version: license?.auth_version ?? payload.auth_version ?? claims.ver,
    };
    await browser.storage.local.set({ [STORAGE_KEYS.cache]: cachedResult });
    this.memoryCache = cachedResult;
    return cachedResult;
  }

  private static async performLiveCheck(
    action: "status" | "activate" | "update_name" = "status",
    deviceName?: string,
  ): Promise<LicenseResult> {
    const key = await this.getSavedKey();
    if (!key) return { ok: false, reason: "no_key" };
    try {
      const fingerprint = await getFingerprint();
      const credentials = await this.getDeviceCredentials();

      if (action === "update_name" && credentials) {
        const payload = await this.apiRequest("/v1/licenses/device", {
          license_id: credentials.licenseId,
          device_token: credentials.deviceToken,
          fingerprint,
          device_name: deviceName,
        });
        return this.cacheApiResult(payload, this.memoryCache ?? undefined);
      }

      if (action === "activate" || !credentials) {
        const payload = await this.apiRequest("/v1/licenses/activate", {
          key,
          fingerprint,
          device_name: deviceName,
        });
        if (!payload.license_id || !payload.device_token) {
          return { ok: false, reason: "internal_error" };
        }
        await browser.storage.local.set({
          [STORAGE_KEYS.licenseId]: payload.license_id,
          [STORAGE_KEYS.deviceToken]: payload.device_token,
        });
        return this.cacheApiResult(payload);
      }

      const payload = await this.apiRequest("/v1/licenses/refresh", {
        license_id: credentials.licenseId,
        device_token: credentials.deviceToken,
        fingerprint,
      });
      return this.cacheApiResult(payload, this.memoryCache ?? undefined);
    } catch (error) {
      const apiError = error as Error & { reason?: LicenseReason; status?: number };
      if (apiError.status === 401) {
        await this.resetDeviceCredentials();
        await this.resetCache();
      }
      if (isAuthoritativeLicenseRejection(apiError.status)) {
        await this.resetCache();
        return { ok: false, reason: apiError.reason ?? "unauthorized_access" };
      }
      const cached = await this.handleFailOpen();
      if (cached.ok) return cached;
      return { ok: false, reason: apiError.reason ?? "network_error" };
    }
  }

  private static async handleFailOpen(): Promise<LicenseResult> {
    const stored = await browser.storage.local.get(STORAGE_KEYS.cache);
    const cache = stored[STORAGE_KEYS.cache] as LicenseResult | undefined;
    if (cache?.plan === "paid" && (await this.isCacheValid(cache))) {
      return { ...cache, ok: true };
    }
    return { ok: false, reason: "network_error" };
  }

  static async getStatus(): Promise<LicenseResult> {
    return this.checkLicense();
  }

  static beginStartupValidation(): Promise<LicenseResult> {
    if (this.startupValidation) return this.startupValidation;
    this.startupValidation = (async () => {
      await browser.storage.local.set({ license_startup_validation: true });
      const result = await this.performLiveCheck("status");
      if (!result.ok) await this.resetCache();
      await browser.storage.local.set({ license_startup_validation: false });
      return result;
    })().finally(() => {
      this.startupValidation = null;
    });
    return this.startupValidation;
  }

  static async activate(deviceName?: string): Promise<LicenseResult> {
    return this.performLiveCheck("activate", deviceName);
  }

  static async updateDeviceName(name: string): Promise<LicenseResult> {
    return this.performLiveCheck("update_name", name);
  }

  static async createSessionUrl(): Promise<string | null> {
    const credentials = await this.getDeviceCredentials();
    if (!credentials) return null;
    try {
      const payload = await this.apiRequest("/v1/licenses/session-ticket", {
        license_id: credentials.licenseId,
        device_token: credentials.deviceToken,
        fingerprint: await getFingerprint(),
      });
      return payload.websocket_url || null;
    } catch {
      return null;
    }
  }
}
