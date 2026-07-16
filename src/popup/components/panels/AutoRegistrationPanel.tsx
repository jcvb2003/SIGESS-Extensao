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

  const formatCPF = (cpf?: string) => {
    if (!cpf) return "---";
    const clean = cpf.replace(/\D/g, "").padStart(11, "0");
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const formatDate = (date?: string) => {
    if (!date) return "---";
    if (date.includes("/")) return date; // Já formatado
    const [y, m, d] = date.split("-");
    if (y && m && d) return `${d}/${m}/${y}`;
    return date;
  };

  const sources = [
    { id: "cadunico", label: "CadÚnico" },
    { id: "pesqbrasil", label: "PesqBrasil" },
    { id: "tse", label: "TSE" },
    { id: "receita", label: "Receita Federal" },
  ];

  const handleClear = () => {
    if (confirm("Deseja realmente limpar todos os dados capturados?")) {
      onUpdate({
        pessoaData: {} as any,
        pessoaData_raw: {},
        pessoaData_snapshots: {}
      });
    }
  };

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ autoRegistrationEnabled: e.target.checked });
  };

  const openInspector = () => {
    const url = chrome.runtime.getURL('data_inspector.html');
    if (globalThis.browser) {
      browser.tabs.create({ url });
    } else {
      chrome.tabs.create({ url });
    }
  };

  const hasAnyData = Object.keys(data).length > 1; // mais do que apenas 'fontes'

  return (
    <div className="stack">
      {/* Toggle de Ativação Global */}
      <div className="info-card" style={{ marginBottom: '12px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: settings.autoRegistrationEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Database size={18} color={settings.autoRegistrationEnabled ? '#10b981' : '#64748b'} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Captura Automática</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {settings.autoRegistrationEnabled ? 'Ativada para sites GOV' : 'Desativada no momento'}
              </div>
            </div>
          </div>
          <label className="switch" htmlFor="auto-capture-toggle" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
            <span style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              borderWidth: 0
            }}>Ativar Captura Automática</span>
            <input
              id="auto-capture-toggle"
              type="checkbox"
              checked={!!settings.autoRegistrationEnabled}
              onChange={handleToggle}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span className="slider round" style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: settings.autoRegistrationEnabled ? '#10b981' : '#334155',
              transition: '.4s', borderRadius: '34px'
            }}>
              <span style={{
                position: 'absolute', height: '14px', width: '14px', left: '3px', bottom: '3px',
                backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                transform: settings.autoRegistrationEnabled ? 'translateX(16px)' : 'translateX(0)'
              }}></span>
            </span>
          </label>
        </div>
      </div>

      <div className="info-card">
        <div className="info-header">
          <Database size={16} className="info-icon" />
          <span className="info-title">Status da Coleta</span>
        </div>
        <div className="sources-grid">
          {sources.map((source) => {
            if (source.id === "receita") {
              const caiCaptured = !!(fontes.caepf?.capturado || fontes.esocial?.capturado);
              const ecacCaptured = !!(fontes.ecac_cpf?.capturado || fontes.ecac_caepf?.capturado);
              const anyCaptured = caiCaptured || ecacCaptured;

              return (
                <div key={source.id} className={`source-item ${anyCaptured ? "active" : ""}`} style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {caiCaptured ? <CheckCircle2 size={12} className="status-icon success" /> : <CircleDashed size={12} className="status-icon pending" />}
                      {ecacCaptured ? <CheckCircle2 size={12} className="status-icon success" /> : <CircleDashed size={12} className="status-icon pending" />}
                    </div>
                    <span className="source-label" style={{ fontSize: '10px', fontWeight: 700 }}>{source.label}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ color: caiCaptured ? '#10b981' : 'inherit' }}>• Inscrição (CAEPF)</span>
                    <span style={{ color: ecacCaptured ? '#10b981' : 'inherit' }}>• Dados Cadastrais</span>
                  </div>
                </div>
              );
            }

            let isCaptured = !!fontes[source.id]?.capturado;
            if (source.id === "cadunico") {
              isCaptured = isCaptured || !!fontes.cadunico_adv?.capturado;
            } else if (source.id === "pesqbrasil") {
              isCaptured = isCaptured || !!fontes.pesq_brasil?.capturado;
            }

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
              <span className="preview-value" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{formatCPF(data.cpf)}</span>
            </div>
            {data.dataDeNascimento && (
              <div className="preview-row">
                <span className="preview-label">Nasc.:</span>
                <span className="preview-value">{formatDate(data.dataDeNascimento)}</span>
              </div>
            )}
            {data.cidade && (
              <div className="preview-row">
                <span className="preview-label">Cidade:</span>
                <span className="preview-value">{`${data.cidade} / ${data.uf || ""}`}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={openInspector}
              style={{ padding: '8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Database size={14} />
              Comparativo
            </button>
            <button
              className="btn btn-secondary btn-danger"
              onClick={handleClear}
              style={{ padding: '8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Trash2 size={14} />
              Limpar
            </button>
          </div>
        </div>
      )}

      {!hasAnyData && (
        <p className="empty-state">
          {settings.autoRegistrationEnabled
            ? "Nenhum dado capturado ainda. Navegue pelos sites governamentais para iniciar a coleta automática."
            : "A coleta automática está desativada. Ative-a acima para capturar dados dos portais governamentais."}
        </p>
      )}
    </div>
  );
};

export default AutoRegistrationPanel;
