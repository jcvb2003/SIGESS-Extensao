export function normalizeCpf(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(11, "0") : "";
}
