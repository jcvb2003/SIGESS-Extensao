import { describe, expect, it } from "vitest";
import { CADASTRO_PORTAL_REGISTRY } from "./portal-registry";
import { resolvePortalBridge } from "./portal-bridges";
import {
  ECAC_COLLECTION_URL,
  isEcacAuthUrl,
  isEcacCaepfCollectionUrl,
} from "../ecac/routes";
import {
  PESQBRASIL_MPA_URL,
  isPesqBrasilMpaUrl,
  isPesqBrasilUrl,
} from "../pesqbrasil/routes";
import { TSE_QUERY_URL, isTseAutoatendimentoUrl } from "../tse/routes";

describe("adaptadores dos portais restantes", () => {
  it("mantém a coleta do e-CAC restrita ao CAEPF id=89", () => {
    expect(CADASTRO_PORTAL_REGISTRY.ecac.collectionUrl).toBe(ECAC_COLLECTION_URL);
    expect(isEcacCaepfCollectionUrl(ECAC_COLLECTION_URL)).toBe(true);
    expect(isEcacCaepfCollectionUrl("https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=15")).toBe(false);
    expect(isEcacAuthUrl("https://cav.receita.fazenda.gov.br/autenticacao/login")).toBe(true);
  });

  it("mantém o PesqBrasil MPA como portal aberto pelo cadastro", () => {
    expect(CADASTRO_PORTAL_REGISTRY.pesqbrasil.entryUrl).toBe(PESQBRASIL_MPA_URL);
    expect(isPesqBrasilMpaUrl(PESQBRASIL_MPA_URL)).toBe(true);
    expect(isPesqBrasilUrl("https://pesqbrasil-pescadorprofissional.agro.gov.br/")).toBe(true);
  });

  it("mantém a rota específica de consulta do TSE", () => {
    expect(CADASTRO_PORTAL_REGISTRY.tse.entryUrl).toBe(TSE_QUERY_URL);
    expect(isTseAutoatendimentoUrl(TSE_QUERY_URL)).toBe(true);
    expect(isTseAutoatendimentoUrl("https://www.tse.jus.br/eleitor/titulo-de-eleitor")).toBe(false);
  });

  it("resolve bridges apenas pelos hosts canônicos", () => {
    expect(resolvePortalBridge("pesqbrasil-pescadorprofissional.mpa.gov.br")).toBe("assets/pesqbrasil_bridge.js");
    expect(resolvePortalBridge("cav.receita.fazenda.gov.br")).toBe("assets/caepf_bridge.js");
    expect(resolvePortalBridge("www.tse.jus.br")).toBe("assets/tse_bridge.js");
    expect(resolvePortalBridge("example.com")).toBeNull();
  });
});
