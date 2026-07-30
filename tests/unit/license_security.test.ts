import { describe, expect, it, vi } from "vitest";
import {
  isAuthoritativeLicenseRejection,
  LicenseService,
  shouldActivateDevice,
  verifyEntitlementToken,
} from "../../src/shared/services/license";
import { reconnectDelayMs } from "../../src/background/services/realtime-license";

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

async function createEntitlement(overrides: Record<string, unknown> = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = {
    ...await crypto.subtle.exportKey("jwk", pair.publicKey),
    kid: "test-v1",
  };
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: "test-v1" }));
  const claims = base64Url(JSON.stringify({
    sub: "license-test",
    fp: await sha256Hex("fingerprint-test"),
    plan: "paid",
    ver: 4,
    iss: "https://api.sigess.com.br",
    aud: "sigess-extension",
    exp: Math.floor(Date.now() / 1000) + 300,
    typ: "entitlement",
    ...overrides,
  }));
  const signed = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    new TextEncoder().encode(signed),
  ));
  return {
    token: `${signed}.${base64Url(signature)}`,
    publicJwk: publicJwk as JsonWebKey & { kid: string },
  };
}

describe("segurança da licença", () => {
  it("aplica jitter ao backoff sem criar polling de licença", () => {
    expect(reconnectDelayMs(0, () => 0)).toBe(4_000);
    expect(reconnectDelayMs(0, () => 1)).toBe(6_000);
    expect(reconnectDelayMs(10, () => 0.5)).toBe(60_000);
  });

  it("não reativa automaticamente um dispositivo revogado", () => {
    expect(shouldActivateDevice("status", false, true)).toBe(false);
    expect(shouldActivateDevice("status", false, false)).toBe(true);
    expect(shouldActivateDevice("activate", false, true)).toBe(true);
  });

  it("nunca aplica fail-open após uma rejeição autoritativa da API", () => {
    expect(isAuthoritativeLicenseRejection(401)).toBe(true);
    expect(isAuthoritativeLicenseRejection(403)).toBe(true);
    expect(isAuthoritativeLicenseRejection(409)).toBe(true);
    expect(isAuthoritativeLicenseRejection(429)).toBe(false);
    expect(isAuthoritativeLicenseRejection(500)).toBe(false);
    expect(isAuthoritativeLicenseRejection()).toBe(false);
  });

  it("reutiliza a chave de idempotencia enquanto a ativacao estiver pendente", async () => {
    const values = new Map<string, unknown>();
    const local = {
      get: vi.fn(async (keys: string | string[]) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(requested.map((key) => [key, values.get(key)]));
      }),
      set: vi.fn(async (entries: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(entries)) values.set(key, value);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
      }),
    };
    vi.stubGlobal("browser", { storage: { local } });
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await LicenseService.saveKey("SINP-TEST-TEST-TEST-TEST");
    await LicenseService.activate("Desktop");
    await LicenseService.activate("Desktop");

    const headers = fetchMock.mock.calls.map(([, init]) =>
      (init?.headers as Record<string, string>)["Idempotency-Key"]
    );
    expect(headers).toHaveLength(2);
    expect(headers[0]).toMatch(
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u,
    );
    expect(headers[1]).toBe(headers[0]);
    vi.unstubAllGlobals();
  });

  it("aceita um entitlement ES256 íntegro e vinculado ao dispositivo", async () => {
    const { token, publicJwk } = await createEntitlement();
    const claims = await verifyEntitlementToken(
      token,
      "fingerprint-test",
      "license-test",
      publicJwk,
    );
    expect(claims).toMatchObject({
      sub: "license-test",
      fp: await sha256Hex("fingerprint-test"),
      ver: 4,
    });
  });

  it("rejeita entitlement destinado a outro dispositivo", async () => {
    const { token, publicJwk } = await createEntitlement();
    await expect(
      verifyEntitlementToken(token, "fingerprint-adulterado", "license-test", publicJwk),
    ).resolves.toBeNull();
  });

  it("rejeita entitlement expirado", async () => {
    const { token, publicJwk } = await createEntitlement({
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    await expect(
      verifyEntitlementToken(token, "fingerprint-test", "license-test", publicJwk),
    ).resolves.toBeNull();
  });
});
