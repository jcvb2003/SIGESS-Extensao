import { parsePesqBrasilRSC } from "../pesqbrasil/extractor";
import { parseCaepfData } from "../caepf/extractor";
import { parseCadUnicoToken } from "../cadunico/extractor";
import { processCadUnicoAdvancedCollection, type CadUnicoAdvancedPayload } from "../cadunico/portal";
import { parseTseData } from "../tse/extractor";
import { parseInssData } from "../inss/extractor";
import { reportCadastroPortalOutcome } from "./portal-outcome-reporter";
import { saveCapturedPessoaData } from "./capture-data-reporter";

export function routePortalBridgeMessage(event: MessageEvent, enabled: boolean): void {
  if (!enabled || event.origin !== globalThis.location.origin) return;
  const { type, payload } = event.data || {};
  if (typeof type !== "string" || !type.startsWith("SIGESS_")) return;

  console.log(`SIGESS: Mensagem recebida da página -> ${type}`);
  if (type === "SIGESS_PESQBRASIL_RAW_DATA") {
    const data = parsePesqBrasilRSC(payload as string);
    if (data) saveCapturedPessoaData(data, "pesqbrasil");
  } else if (type === "SIGESS_CAEPF_RAW_DATA") {
    const data = parseCaepfData(payload);
    if (data) saveCapturedPessoaData(data, "ecac_caepf", payload);
  } else if (type === "SIGESS_CAEPF_NOT_FOUND") {
    reportCadastroPortalOutcome("esocial", "not_found", "caepf_pesquisa_vazia");
  } else if (type === "SIGESS_CADUNICO_RAW_TOKEN") {
    const data = parseCadUnicoToken(payload as string);
    if (data) saveCapturedPessoaData(data, "cadunico");
  } else if (type === "SIGESS_CADUNICO_ADV_TOKENS") {
    void processCadUnicoAdvancedCollection(
      payload as CadUnicoAdvancedPayload,
      saveCapturedPessoaData,
      (outcome, reason) => reportCadastroPortalOutcome("cadunico", outcome, reason),
    );
  } else if (type === "SIGESS_TSE_RAW_DATA") {
    const data = parseTseData(payload);
    if (data) saveCapturedPessoaData(data, "tse", payload);
  } else if (type === "SIGESS_INSS_RAW_DATA") {
    const data = parseInssData(payload);
    if (data) saveCapturedPessoaData(data, "inss", payload);
  }
}
