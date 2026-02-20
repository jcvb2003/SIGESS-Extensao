import { PessoaData } from "../../../shared/types";

export function parseCadUnicoToken(token: string): Partial<PessoaData> | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const payload = JSON.parse(jsonPayload);

    return {
      nome: payload.name,
      telefone: payload.phone_number,
      email: payload.email,
    };
  } catch (e) {
    console.error("SIGESS: Erro ao parsear JWT do CadÚnico", e);
    return null;
  }
}
