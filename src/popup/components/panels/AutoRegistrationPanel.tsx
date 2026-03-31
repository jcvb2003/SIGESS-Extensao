import React from "react";
import { AppSettings } from "../../../shared/types";
import { Trash2, CheckCircle2, CircleDashed, User, Database } from "lucide-react";

interface AutoRegistrationPanelProps {
  settings: AppSettings;
  onUpdate: (s: Partial<AppSettings>) => void;
}

const AutoRegistrationPanel: React.FC<AutoRegistrationPanelProps> = ({ settings, onUpdate }) => {
  const data = settings.pessoaData || {};
  const fontes = data.fontes || {};

  const sources = [
    { id: "pesqbrasil", label: "PesqBrasil" },
    { id: "esocial", label: "eSocial" },
    { id: "cadunico", label: "CadÚnico" },
    { id: "ecac", label: "e-CAC" },
    { id: "tse", label: "Título" },
  ];

  const handleClear = () => {
    if (confirm("Deseja realmente limpar todos os dados capturados?")) {
      onUpdate({ pessoaData: undefined });
    }
  };

  const hasAnyData = Object.keys(data).length > 1; // mais do que apenas 'fontes'

  return (
    <div className="stack">
      <div className="info-card">
        <div className="info-header">
          <Database size={16} className="info-icon" />
          <span className="info-title">Status da Coleta</span>
        </div>
        <div className="sources-grid">
          {sources.map((source) => {
            const info = fontes[source.id];
            const isCaptured = info?.capturado;
            return (
              <div key={source.id} className={`source-item ${isCaptured ? "active" : ""}`}>
                {isCaptured ? (
                  <CheckCircle2 size={14} className="status-icon success" />
                ) : (
                  <CircleDashed size={14} className="status-icon pending" />
                )}
                <span className="source-label">{source.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {hasAnyData && (
        <div className="data-preview fade-in">
          <div className="preview-header">
            <User size={16} />
            <span>Resumo do Cadastro</span>
          </div>
          <div className="preview-content">
            <div className="preview-row">
              <span className="preview-label">Nome:</span>
              <span className="preview-value">{data.nome || "---"}</span>
            </div>
            <div className="preview-row">
              <span className="preview-label">CPF:</span>
              <span className="preview-value">{data.cpf || "---"}</span>
            </div>
            {data.cidade && (
              <div className="preview-row">
                <span className="preview-label">Cidade:</span>
                <span className="preview-value">{`${data.cidade} / ${data.uf || ""}`}</span>
              </div>
            )}
          </div>
          <button className="btn btn-secondary btn-full btn-danger mt-2" onClick={handleClear} style={{ marginTop: '12px' }}>
            <Trash2 size={14} />
            Limpar Dados
          </button>
        </div>
      )}

      {!hasAnyData && (
        <p className="empty-state">
          Nenhum dado capturado ainda. Navegue pelos sites governamentais para iniciar a coleta automática.
        </p>
      )}
    </div>
  );
};

export default AutoRegistrationPanel;
