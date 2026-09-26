import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LicenseService } from "./license";

describe("LicenseService.checkLicenseForBridgeStatus", () => {
  const values: Record<string, unknown> = {};
  let storageGet: (keys: string | string[]) => Promise<Record<string, unknown>>;
  let storageSet: (next: Record<string, unknown>) => Promise<void>;
  let storageRemove: (keys: string | string[]) => Promise<void>;

  beforeEach(() => {
    for (const key of Object.keys(values)) delete values[key];
    storageGet = vi.fn(async (keys: string | string[]): Promise<Record<string, unknown>> => {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter((key) => key in values).map((key) => [key, values[key]]));
    });
    storageSet = vi.fn(async (next: Record<string, unknown>): Promise<void> => {
      Object.assign(values, next);
    });
    storageRemove = vi.fn(async (keys: string | string[]): Promise<void> => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    });
    vi.stubGlobal("browser", {
      storage: { local: { get: storageGet, set: storageSet, remove: storageRemove } },
    });
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports an unactivated license without attempting activation when no key is saved", async () => {
    const result = await LicenseService.checkLicenseForBridgeStatus();

    expect(result).toEqual({ ok: false, reason: "no_key" });
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
  });

  it("does not activate a saved key when the device has not been linked", async () => {
    values.license_key = "saved-key";

    const result = await LicenseService.checkLicenseForBridgeStatus();

    expect(result).toEqual({ ok: false, reason: "no_key" });
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
  });

  it("reports a revoked device from local state without retrying activation", async () => {
    values.license_key = "saved-key";
    values.license_device_revoked = true;

    const result = await LicenseService.checkLicenseForBridgeStatus();

    expect(result).toEqual({ ok: false, reason: "wrong_device" });
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
  });
});
