import { PessoaData } from "../../../shared/types";

export function normalizeCapturedValue<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeCapturedValue(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeCapturedValue(item),
      ]),
    ) as T;
  }

  return value;
}

export function normalizePessoaData(data: Partial<PessoaData>): Partial<PessoaData> {
  return normalizeCapturedValue(data);
}
