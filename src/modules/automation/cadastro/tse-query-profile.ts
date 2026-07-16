import { AppSettings, PessoaData } from "../../../shared/types";

export interface TseQueryProfile extends Partial<PessoaData> {
  isSufficient: boolean;
}

/**
 * Monta somente o perfil necessário para a consulta eleitoral. Dados do INSS
 * podem suprir lacunas para a consulta, mas não são promovidos ao cadastro.
 */
export function resolveTseQueryProfile(
  settings: Pick<AppSettings, "pessoaData" | "pessoaData_raw">,
): TseQueryProfile {
  const consolidated = settings.pessoaData || {};
  const inss = (settings.pessoaData_raw?.inss || {}) as Partial<PessoaData>;
  const profile: Partial<PessoaData> = {
    cpf: consolidated.cpf || inss.cpf,
    dataDeNascimento: consolidated.dataDeNascimento || inss.dataDeNascimento,
    mae: consolidated.mae || inss.mae,
    pai: consolidated.pai || inss.pai,
  };

  return {
    ...profile,
    isSufficient: Boolean(
      profile.cpf &&
      profile.dataDeNascimento &&
      (profile.mae || profile.pai),
    ),
  };
}
