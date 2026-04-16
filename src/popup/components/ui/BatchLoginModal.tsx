import React, { useState } from "react";
import { UserCredentials } from "../../../shared/types";
interface BatchLoginModalProps {
  type: "pesqbrasil" | "esocial";
  onConfirm: (creds: UserCredentials[]) => void;
  onCancel: () => void;
}
const BatchLoginModal: React.FC<BatchLoginModalProps> = ({
  type,
  onConfirm,
  onCancel,
}) => {
  const [text, setText] = useState("");
  const handleProcess = () => {
    if (!text.trim()) return;
    const credentials: UserCredentials[] = [];
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l);
    lines.forEach((line) => {
      const parts = line.split(/[ \t]+/).map((item) => item.trim());
      for (let i = 0; i < parts.length; i += 2) {
        const cpf = parts[i];
        const senha = parts[i + 1];
        if (cpf && senha) {
          credentials.push({ cpf, senha });
        }
      }
    });
    if (credentials.length > 0) {
      onConfirm(credentials);
    } else {
      alert(
        "Nenhuma credencial válida encontrada. Use o formato: CPF [TAB ou ESPAÇO] SENHA",
      );
    }
  };
  return (
    <div className="modal-overlay">
      <div className="section modal-card fade-in">
        <div className="modal-header">
          <h3 className="section-title">
            Login em Lote {type === "pesqbrasil" ? "PesqBrasil" : "eSocial"}
          </h3>
          <p className="section-description">Importação de credenciais</p>
        </div>

        <div className="modal-body">
          <div className="modal-note">
            Cole os dados do Excel ou texto abaixo. <br />
            Formato: <strong>CPF [ESPAÇO ou TAB] SENHA</strong>
          </div>

          <textarea
            className="reap-textarea modal-textarea"
            placeholder={`000.000.000-00 Senha123\n111.111.111-11\tSenha456`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="modal-actions">
            <button onClick={onCancel} className="btn btn-secondary">
              Cancelar
            </button>
            <button onClick={handleProcess} className="btn btn-primary">
              Iniciar Lote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default BatchLoginModal;
