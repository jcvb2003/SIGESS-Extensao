import type { PessoaData } from "../../../shared/types";

export function saveCapturedPessoaData(
  data: Partial<PessoaData>,
  fonte: string,
  snapshot?: unknown,
): void {
  console.log(`SIGESS: Dados extraídos de ${fonte}`, data);
  const api = (globalThis.browser || globalThis.chrome) as any;
  api?.runtime?.sendMessage?.({ action: "SAVE_PESSOA_DATA", data, fonte, snapshot });
  globalThis.dispatchEvent(new CustomEvent("SIGESS_DATA_UPDATED"));
}
