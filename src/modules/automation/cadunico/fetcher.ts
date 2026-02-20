import { PessoaData } from "../../../shared/types";

/**
 * Realiza a extração avançada de dados do CadÚnico via API transacional.
 * Retorna os dados consolidados ou null em caso de falha.
 */
export async function fetchCadUnicoAdvanced(
  payload: CadUnicoAdvPayload
): Promise<Partial<PessoaData> | null> {
  const { cpf, bearer, xsrf, cnas } = payload;
  console.log("SIGESS: Iniciando extração avançada CadÚnico para CPF: " + cpf);

  const headers: CadUnicoHeaders = {
    'Authorization': bearer,
    'X-XSRF-TOKEN': xsrf,
    'CnasVersao': cnas || '1.36.02',
    'Accept': 'application/json',
    'Referer': 'https://cadunico.dataprev.gov.br/'
  };

  try {
    const perfil = await fetchPerfil(cpf, headers);
    if (!perfil) {
      console.warn("SIGESS: Perfil não encontrado para CPF " + cpf);
      return null;
    }

    const [details, family, address] = await Promise.all([
      fetchDetails(perfil.identificador, cpf, headers),
      fetchFamily(perfil.numeroFamiliar, headers),
      fetchAddress(perfil.numeroFamiliar, headers)
    ]);

    return { ...details, ...family, ...address };
  } catch (e) {
    console.error("SIGESS: Falha na extração avançada CadÚnico", e);
    return null;
  }
}

// ── Tipos ────────────────────────────────────────────────────────────────

export interface CadUnicoAdvPayload {
  cpf: string;
  bearer: string;
  xsrf: string;
  cnas: string;
}

type CadUnicoHeaders = Record<string, string>;

interface PerfilResult {
  identificador: number;
  numeroFamiliar: number;
}

// ── Funções internas de fetch ────────────────────────────────────────────

async function fetchPerfil(cpf: string, headers: CadUnicoHeaders): Promise<PerfilResult | null> {
  const res = await fetch(
    `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/pessoa/${cpf}/tipos-perfil`,
    { headers }
  );
  if (!res.ok) throw new Error(`Erro Perfil (HTTP ${res.status}): ${res.url}`);

  const text = await res.text();
  if (!text) return null;

  try {
    const data = JSON.parse(text);
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error("SIGESS: Erro ao parsear Perfil", e);
    return null;
  }
}

async function fetchDetails(pessoaId: number, cpf: string, headers: CadUnicoHeaders): Promise<Partial<PessoaData>> {
  const res = await fetch(
    `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/pessoa/${pessoaId}/informacoes-detalhadas`,
    { headers }
  );
  if (!res.ok) return {};

  const text = await res.text();
  if (!text) return {};

  let detalhes;
  try {
    detalhes = JSON.parse(text);
  } catch {
    return {};
  }

  const c = detalhes.pessoaDadosCadastroDTO || {};
  const esc = detalhes.pessoaEscolaridadeDTO || {};
  const rgRaw = String(c.numeroIdentidade || '');
  const rgClean = rgRaw.replace(/^0+/, '') || undefined;

  let sexo: "MASCULINO" | "FEMININO" | undefined;
  if (c.tipoSexoPessoa?.codigo === 1) sexo = 'MASCULINO';
  else if (c.tipoSexoPessoa?.codigo === 2) sexo = 'FEMININO';

  return {
    nome: c.nomePessoa,
    cpf: c.numeroCpfPessoa ? String(c.numeroCpfPessoa) : cpf,
    nit: c.numeroNisPisPasepPessoa ? String(c.numeroNisPisPasepPessoa) : undefined,
    dataDeNascimento: c.dataNascimentoPessoa?.split('T')[0],
    sexo,
    mae: c.filiacao1 || c.nomeMaePessoa,
    pai: c.filiacao2 || c.nomePaiPessoa,
    naturalidade: c.nomeIbgeMunicipioNascimento || c.nomeMunicipioNascimentoPessoa,
    ufNaturalidade: c.siglaUFNascimento || c.siglaUfNascimentoPessoa,
    nacionalidade: c.nomePaisOrigem === 'BRASIL' ? 'BRASILEIRO(A)' : (c.nomePaisOrigem || c.tipoNacionalidadePessoa?.descricao),
    estadoCivil: mapEstadoCivil(c.tipoEstadoCivil?.codigo || c.tipoEstadoCivilPessoa?.codigo),
    rg: rgClean,
    dataExpedicaoRg: c.dataEmissaoIdentidade?.split('T')[0],
    ufRg: c.siglaUfIdentidade,
    orgaoEmissorRg: c.siglaOrgaoEmissor,
    tituloEleitor: c.numeroTituloEleitorPessoa ? String(c.numeroTituloEleitorPessoa) : undefined,
    zonaEleitoral: c.numeroZonaTituloEleitorPessoa?.toString().padStart(3, '0'),
    secaoEleitoral: c.numeroSecaoTituloEleitorPessoa?.toString().padStart(4, '0'),
    ctps: c.numeroCtps ? `${c.numeroCtps}/${c.numeroSerieCtps || ''}`.replace(/\/$/, '') : undefined,
    ctpsUf: c.ufEmissoraCtps,
    alfabetizado: mapAlfabetizado(esc.sabeLerEEscrever?.codigo),
    escolaridade: mapEscolaridade(
      esc.cursoMaisElevadoQueFrequentou?.codigo,
      esc.concluiuOCursoQueFrequentou?.codigo,
      esc.sabeLerEEscrever?.codigo
    ),
  };
}

async function fetchFamily(familiaId: number, headers: CadUnicoHeaders): Promise<Partial<PessoaData>> {
  if (!familiaId) return {};
  const res = await fetch(
    `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/familia/${familiaId}/membros`,
    { headers }
  );
  if (!res.ok) return {};

  const text = await res.text();
  if (!text) return {};

  let membros;
  try {
    membros = JSON.parse(text);
  } catch {
    return {};
  }
  const municipio = membros?.familiaCadastroDTO?.municipioCadastro;
  const uf = membros?.familiaCadastroDTO?.ufCadastro;

  if (municipio && uf) {
    return { cidade: municipio, uf };
  }
  return {};
}

async function fetchAddress(familiaId: number, headers: CadUnicoHeaders): Promise<Partial<PessoaData>> {
  if (!familiaId) return {};
  const res = await fetch(
    `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/familia/${familiaId}/endereco`,
    { headers }
  );
  if (!res.ok) return {};

  const text = await res.text();
  if (!text) return {};

  let e;
  try {
    e = JSON.parse(text);
  } catch {
    return {};
  }

  return {
    endereco: `${e.nomeTipologradouro || e.tipoLogradouro || ''} ${e.nomeLogradouro || e.logradouro || ''}`.trim(),
    numero: e.complementoNumero || e.numero || 'SN',
    cep: e.cepLogradouro || e.cep || undefined,
    cidade: e.municipio || e.nomeMunicipio,
    uf: e.uf || e.siglaUf,
    bairro: e.localidade || e.nomeBairro
  };
}

// ── Mappers ──────────────────────────────────────────────────────────────

function mapAlfabetizado(codigo: number | undefined): "SIM" | "NÃO" | undefined {
  if (codigo === 1) return "SIM";
  if (codigo === 2) return "NÃO";
  return undefined;
}

function mapEstadoCivil(codigo: number | undefined): string | undefined {
  const map: Record<number, string> = {
    1: "SOLTEIRO(A)",
    2: "CASADO(A)",
    3: "DIVORCIADO(A)",
    4: "VIÚVO(A)",
    5: "UNIÃO ESTÁVEL"
  };
  return (codigo && map[codigo]) ? map[codigo] : undefined;
}

function mapEscolaridade(
  cursoCodigo: number | undefined,
  concluiuCodigo: number | undefined,
  sabeLerCodigo: number | undefined
): string | undefined {
  const concluiu = concluiuCodigo === 1;

  switch (cursoCodigo) {
    case 3:
    case 9:
      return "LÊ E ESCREVE";
    case 4:
      return "ENSINO FUNDAMENTAL INCOMPLETO";
    case 5:
      return concluiu ? "ENSINO FUNDAMENTAL COMPLETO" : "ENSINO FUNDAMENTAL INCOMPLETO";
    case 6:
      return concluiu ? "ENSINO MÉDIO COMPLETO" : "ENSINO MÉDIO INCOMPLETO";
    case 7:
      return concluiu ? "ENSINO SUPERIOR COMPLETO" : "ENSINO SUPERIOR INCOMPLETO";
    case 8:
      return "ENSINO SUPERIOR COMPLETO";
    case 10:
      return sabeLerCodigo === 1 ? "LÊ E ESCREVE" : "ANALFABETO";
    default:
      return undefined;
  }
}
