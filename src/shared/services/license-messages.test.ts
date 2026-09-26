import { describe, expect, it } from "vitest";
import { getLicenseOperationState } from "./license-messages";

describe("license operation state normalization", () => {
  it.each([
    ["no_key", "license_not_activated"],
    ["wrong_device", "license_unlinked"],
    ["expired", "license_expired"],
    ["blocked", "license_blocked"],
    ["invalid_key", "license_invalid_key"],
    ["device_limit", "license_device_limit"],
    ["network_error", "license_network_error"],
    ["database_error", "license_database_error"],
    ["rate_limited", "license_rate_limited"],
    ["unauthorized_access", "license_unauthorized_access"],
    ["invalid_signature", "license_invalid_signature"],
    ["missing_parameters", "license_missing_parameters"],
    ["internal_error", "license_internal_error"],
  ])("maps %s to the specific UI state", (reason, expectedState) => {
    expect(getLicenseOperationState(reason)).toBe(expectedState);
  });

  it("uses an explicit unknown state for missing or unexpected reasons", () => {
    expect(getLicenseOperationState()).toBe("license_unknown_error");
    expect(getLicenseOperationState("unrecognized_reason")).toBe("license_unknown_error");
  });
});
