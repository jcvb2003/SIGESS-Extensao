import { PessoaData } from "../../../shared/types";

/**
 * Normaliza o Título de Eleitor removendo hífens e zeros à esquerda.
 */
function normalizeTitulo(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/[-\s]/g, "").replace(/^0+/, "");
}

/**
 * Normaliza o Telefone combinando DDD e Número/Fax.
 */
function normalizeTelefone(dddRaw?: string, numRaw?: string): string | undefined {
  const ddd = (dddRaw || "").replace(/\D/g, "").replace(/^0+/, "");
  const num = (numRaw || "").replace(/\D/g, "");
  if (!ddd && !num) return undefined;
  return `${ddd}${num}`;
}

/**
 * Extrai dados da página "CPF - Dados Cadastrais" (id=15) no e-CAC.
 */
export function scrapeEcacCpfData(): Partial<PessoaData> | null {
  try {
    const miolo = document.querySelector(".divMiolo");
    if (!miolo) return null;

    const getTextAfter = (label: string): string => {
      const bTags = Array.from(miolo.querySelectorAll("b"));
      const b = bTags.find(el => el.textContent?.trim().toLowerCase().includes(label.toLowerCase()));
      if (!b) return "";
      
      // O valor pode estar distribuído em vários nós de texto após o <b> até o próximo elemento relevante (ex: <br> ou <b>)
      let text = "";
      let next = b.nextSibling;
      while (next && next.nodeName !== "B" && next.nodeName !== "BR") {
        if (next.nodeType === Node.TEXT_NODE) {
          text += next.textContent;
        }
        next = next.nextSibling;
      }
      return text.trim();
    };

    const ddd = getTextAfter("Ddd:");
    const fax = getTextAfter("Fax:");
    const tel = getTextAfter("Telefone:");

    const data: Partial<PessoaData> = {
      cpf: getTextAfter("Inscrição:").replace(/[.-]/g, ""),
      nome: getTextAfter("Nome:"),
      dataDeNascimento: getTextAfter("Data de Nascimento:"),
      sexo: getTextAfter("Sexo:") as any,
      mae: getTextAfter("Nome de Mãe:"),
      tituloEleitor: normalizeTitulo(getTextAfter("Titulo de Eleitor:")),
      cep: getTextAfter("CEP:").replace(/[.-]/g, ""),
      endereco: getTextAfter("Logradouro:"),
      numero: getTextAfter("Número:"),
      bairro: getTextAfter("Bairro:"),
      cidade: getTextAfter("Cidade:"),
      uf: getTextAfter("UF:"),
      telefone: normalizeTelefone(ddd, tel || fax)
    };

    // Filtra campos vazios
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== "" && v !== undefined)
    ) as Partial<PessoaData>;

    console.log("SIGESS: Dados extraídos via scraping e-CAC CPF", filtered);
    return Object.keys(filtered).length > 0 ? filtered : null;
  } catch (e) {
    console.error("[SIGESS] Erro no scraping e-CAC CPF", e);
    return null;
  }
}

/**
 * Extrai dados da tabela CAEPF (id=89) como fallback caso a API falhe.
 */
export function scrapeEcacCaepfTable(): Partial<PessoaData> | null {
  try {
    const table = document.querySelector("table.tabela");
    if (!table) return null;

    const row = table.querySelector("tbody tr");
    if (!row) return null;

    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 7) return null;

    const extracted = {
      caepf: cells[0].textContent?.trim().replace(/[./-]/g, ""),
      cei: cells[6].textContent?.trim().replace(/[./-]/g, "")
    };

    console.log("SIGESS: Dados extraídos via scraping e-CAC CAEPF", extracted);
    return extracted;
  } catch (e) {
    console.error("[SIGESS] Erro no scraping e-CAC CAEPF", e);
    return null;
  }
}
