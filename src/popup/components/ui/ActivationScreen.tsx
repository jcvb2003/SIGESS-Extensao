import React, { useState } from "react";

export function getLicenseErrorMessage(reason?: string): string {
  switch (reason) {
    case "trial_expired":
      return "Trial Expirado";
    case "expired":
      return "Licença Expirada";
    case "wrong_device":
      return "Vinculada a outro dispositivo";
    case "invalid_key":
      return "Chave Inválida";
    default:
      return "Erro na ativação";
  }
}

export const ActivationScreen: React.FC<{
  license: any;
  activating: boolean;
  onActivate: (key: string) => void;
}> = ({ license, activating, onActivate }) => {
  const [activationKey, setActivationKey] = useState("");

  const handleActivateClick = () => {
    onActivate(activationKey);
  };

  return (
    <div className="container activation-screen">
      <header className="header">
        <div className="header-content">
          <img src="../../icon.png" alt="SIGESS" className="logo" />
          <h1 className="title">SIGESS</h1>
        </div>
      </header>
      <main className="main-content activation-main">
        <div className="activation-card">
          <div className="icon-lock">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2>Ativação Necessária</h2>
          <p>Insira sua chave de acesso para começar a usar a extensão.</p>

          <div className="form-group">
            <input
              type="text"
              className="input-key"
              placeholder="SINP-XXXX-XXXX"
              value={activationKey}
              onChange={(e) => setActivationKey(e.target.value)}
              disabled={activating}
            />
            <button
               className="btn btn-primary btn-activate"
               onClick={handleActivateClick}
               disabled={activating || !activationKey}
            >
              {activating ? "Ativando..." : "Ativar Agora"}
            </button>
          </div>

          {license?.reason && license.reason !== "no_key" && (
            <div className="error-message">
              {getLicenseErrorMessage(license.reason)}
            </div>
          )}

          <div className="support-section">
            <p>Não tem uma chave? Entre em contato:</p>
            <a
               href="https://wa.me/5591993193461"
               target="_blank"
               rel="noopener noreferrer"
               className="btn-whatsapp"
            >
              WhatsApp: (91) 99319-3461
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};
