export function getLicenseErrorMessage(reason?: string): string {
  switch (reason) {
    case "expired":
      return "A validade desta licença terminou. Entre em contato para renovar.";
    case "device_limit":
      return "Todos os acessos desta licença estão ocupados. Libere um acesso em Configurações > Extensão no sistema web e tente novamente.";
    case "wrong_device":
      return "Este computador foi desvinculado da licença. Informe a chave para vinculá-lo novamente.";
    case "blocked":
      return "Esta licença está bloqueada. Entre em contato com o responsável pela licença.";
    case "invalid_key":
      return "A chave informada não é válida. Confira o código e tente novamente.";
    case "network_error":
    case "database_error":
      return "Não foi possível validar a licença agora. Verifique sua conexão e tente novamente.";
    case "rate_limited":
      return "Foram feitas muitas tentativas. Aguarde um minuto e tente novamente.";
    case "unauthorized_access":
    case "invalid_signature":
      return "Não foi possível confirmar a licença neste dispositivo. Tente novamente.";
    default:
      return "Falha na validação da licença. Tente novamente.";
  }
}
