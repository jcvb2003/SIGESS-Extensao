import { describe, expect, it } from "vitest";
import { getValidSpeciesPool, normalizeProductionRange, normalizePriceBounds } from "./reap-settings";

describe("REAP MPA production settings", () => {
  it("recalculates the real exported range for four selected species", () => {
    expect(normalizeProductionRange(3436, 4120, 1744, 3352)).toEqual([3052, 3352]);
  });

  it("uses the complete available range when it is narrower than R$ 300", () => {
    expect(normalizeProductionRange(0, 500, 1000, 1100)).toEqual([1000, 1100]);
  });

  it("rejects inverted and integer-empty envelopes", () => {
    expect(() => normalizeProductionRange(0, 1, 100, 50)).toThrow(RangeError);
    expect(() => normalizeProductionRange(0, 1, 1000.6, 1000.9)).toThrow(RangeError);
  });

  it("reorders saved endpoints and sanitizes invalid span values", () => {
    expect(normalizeProductionRange(3200, 3500, 1744, 3352, -50)).toEqual([3052, 3352]);
    expect(normalizeProductionRange(3200, 3500, 1744, 3352, Number.NaN)).toEqual([3052, 3352]);
  });

  it("normalizes price bounds without creating a value outside the interval", () => {
    expect(normalizePriceBounds(12.3, 12.4)).toBeNull();
    expect(normalizePriceBounds(12.3, 12.6)).toEqual([12.5, 12.5]);
  });

  it("discards invalid price steps from the species pool", () => {
    const pool = getValidSpeciesPool([
      { id: 12, kgMin: "5", kgMax: "5", priceMin: "12.30", priceMax: "12.40" },
      { id: 21, kgMin: "5", kgMax: "9", priceMin: "10", priceMax: "13" },
    ]);
    expect(pool.map((species) => species.id)).toEqual([21]);
  });

  it("requires at least three reais of effective price range", () => {
    const pool = getValidSpeciesPool([
      { id: 21, kgMin: "5", kgMax: "9", priceMin: "10", priceMax: "12.9" },
      { id: 26, kgMin: "5", kgMax: "9", priceMin: "10", priceMax: "13" },
    ]);
    expect(pool.map((species) => species.id)).toEqual([26]);
  });
});
