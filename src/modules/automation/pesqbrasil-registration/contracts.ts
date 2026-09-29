export interface PesqBrasilCadastroAreaConfig {
  localPesca: string;
  uf: string;
  municipio: string;
  nomeLocal?: string;
}

export interface PesqBrasilCadastroFiliacaoConfig {
  cnpj: string;
  email: string;
}

export interface PesqBrasilCadastroConfig {
  gruposAlvo: string[];
  ambientesPesca: string[];
  areaPesca: PesqBrasilCadastroAreaConfig;
  categoria: string;
  formaAtuacao: "EMBARCADO" | "DESEMBARCADO" | "";
  filiacao: PesqBrasilCadastroFiliacaoConfig;
  nacionalidade: "Brasileira";
}

/**
 * Dados individuais enviados pelo Web para o cadastro corrente.
 * O formato acompanha os campos já disponíveis no cadastro de associado,
 * sem promovê-los ao contrato global de PessoaData.
 */
export interface PesqBrasilCadastroMemberData {
  cpf?: string;
  nome?: string;
  apelido?: string;
  dataDeNascimento?: string;
  sexo?: string;
  pai?: string;
  mae?: string;
  alfabetizado?: string;
  escolaridade?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  rg?: string;
  ufRg?: string;
  dataExpedicaoRg?: string;
  nit?: string;
}

export interface PesqBrasilCadastroPayload {
  member?: PesqBrasilCadastroMemberData;
  [key: string]: unknown;
}

export interface PesqBrasilCadastroContext {
  payload: PesqBrasilCadastroPayload;
  receivedAt: number;
}

export const DEFAULT_PESQBRASIL_CADASTRO_CONFIG: PesqBrasilCadastroConfig = {
  gruposAlvo: [],
  ambientesPesca: [],
  areaPesca: {
    localPesca: "",
    uf: "",
    municipio: "",
    nomeLocal: "",
  },
  categoria: "",
  formaAtuacao: "",
  filiacao: {
    cnpj: "",
    email: "",
  },
  nacionalidade: "Brasileira",
};
