import { describe, expect, it } from "vitest";
import { CADASTRO_PORTAL_REGISTRY } from "./portal-registry";
import { resolvePortalBridge } from "./portal-bridges";
import {
  ESOCIAL_CAEPF_COLLECTION_URL,
  ESOCIAL_HOME_URL,
  isEsocialCaepfCollectionUrl,
  isEsocialCadastroDomesticoUrl,
  isEsocialHomeUrl,
} from "../esocial/routes";
import {
  PESQBRASIL_MPA_URL,
  isPesqBrasilMpaUrl,
  isPesqBrasilUrl,
} from "../pesqbrasil/routes";
import { TSE_QUERY_URL, isTseAutoatendimentoUrl } from "../tse/routes";

describe("adaptadores dos portais restantes", () => {
  it("entra no CAEPF pelo contexto autenticado do eSocial", () => {
    expect(CADASTRO_PORTAL_REGISTRY.esocial.collectionUrl).toBe(ESOCIAL_CAEPF_COLLECTION_URL);
    expect(isEsocialHomeUrl(ESOCIAL_HOME_URL)).toBe(true);
    expect(isEsocialCaepfCollectionUrl(ESOCIAL_CAEPF_COLLECTION_URL)).toBe(true);
    expect(isEsocialCaepfCollectionUrl("https://www.esocial.gov.br/portal/Home/Inicial")).toBe(false);
  });

  it("reconhece CadastroDomestico como evidência de ausência de CAEPF", () => {
    expect(isEsocialCadastroDomesticoUrl("https://www.esocial.gov.br/portal/Empregador/CadastroDomestico")).toBe(true);
    expect(isEsocialCadastroDomesticoUrl("https://www.esocial.gov.br/portal/Home/Inicial")).toBe(false);
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
    expect(resolvePortalBridge("caepf.receita.fazenda.gov.br")).toBe("assets/caepf_bridge.js");
    expect(resolvePortalBridge("www.esocial.gov.br")).toBe("assets/caepf_bridge.js");
    expect(resolvePortalBridge("www.tse.jus.br")).toBe("assets/tse_bridge.js");
    expect(resolvePortalBridge("example.com")).toBeNull();
  });
});
