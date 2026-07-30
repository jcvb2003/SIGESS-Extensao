import { describe, expect, it } from "vitest";
import {
  isAuthoritativeLicenseRejection,
  verifyEntitlementToken,
} from "../../src/shared/services/license";

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
  it("nunca aplica fail-open após uma rejeição autoritativa da API", () => {
    expect(isAuthoritativeLicenseRejection(401)).toBe(true);
    expect(isAuthoritativeLicenseRejection(403)).toBe(true);
    expect(isAuthoritativeLicenseRejection(409)).toBe(true);
    expect(isAuthoritativeLicenseRejection(500)).toBe(false);
    expect(isAuthoritativeLicenseRejection()).toBe(false);
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
