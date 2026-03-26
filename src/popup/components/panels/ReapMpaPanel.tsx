import React, { useState } from "react";
import { AppSettings, TurboReapConfig } from "../../../shared/types";

interface ReapMpaPanelProps {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const ReapMpaPanel: React.FC<ReapMpaPanelProps> = ({
  settings,
  onUpdate,
  isOpen,
  onToggle,
}) => {
  const [turboLoading, setTurboLoading] = useState(false);

  const handleTurboFill = async () => {
    setTurboLoading(true);
    try {
      const config: TurboReapConfig = {
        areaRealizacao: {
          localPesca: settings.mpaLocalPesca || 6,
          uf: settings.mpaUF || 5,
          municipio: settings.mpaMunicipio || 4718,
          petrechosPesca: [settings.mpaPetrecho || 4],
          ambientePesca: settings.mpaAmbiente || 1,
        },
        meses: Array.from({ length: 12 }, (_, i) => ({
          mes: i + 1,
          houvePesca: true,
          diasTrabalhados: 15,
          especies: [
            {
              especiePescado: settings.mpaEspeciePescado || 12,
              unidadeMedida: 1,
              quantidade: 10,
              valorMedioQuilo: 8.5,
            },
          ],
        })),
      };

      const res = await browser.runtime.sendMessage({
        action: "turboFillReap",
        config,
      });
      if (!res.success) {
        alert("Falha no Turbo: " + res.error);
      }
    } finally {
      setTurboLoading(false);
    }
  };

  return (
    <section className="section accordion">
      <button
        type="button"
        className="accordion-header"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <div className="section-header">
          <h2 className="section-title">REAP MPA (Pesca)</h2>
          <p className="section-description">
            Configurações e Preenchimento Turbo para Pesca
          </p>
        </div>
        <ChevronIcon isOpen={isOpen} />
      </button>

      <div className={`accordion-content ${isOpen ? "open" : "collapsed"}`}>
        <div className="section-content">
          <div className="stack" style={{ gap: '15px' }}>
            <div className="config-group" style={{ background: '#f9f9f9', padding: '12px', borderRadius: '8px', border: '1px solid #eee' }}>
              <h3 style={{ fontSize: '13px', marginBottom: '10px', color: '#B53030' }}>⚙️ CONFIGURAÇÕES DE AUTOMAÇÃO</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-item">
                  <label htmlFor="mpaEspecie" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Espécie (ID):</label>
                  <input 
                    id="mpaEspecie"
                    type="number"
                    className="gps-input"
                    value={settings.mpaEspeciePescado || ""}
                    onChange={(e) => onUpdate({ mpaEspeciePescado: Number.parseInt(e.target.value, 10) || undefined })}
                    placeholder="Ex: 12"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-item">
                  <label htmlFor="mpaMunicipio" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Município (ID):</label>
                  <input 
                    id="mpaMunicipio"
                    type="number"
                    className="gps-input"
                    value={settings.mpaMunicipio || ""}
                    onChange={(e) => onUpdate({ mpaMunicipio: Number.parseInt(e.target.value, 10) || undefined })}
                    placeholder="Ex: 4718"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-item">
                  <label htmlFor="mpaUF" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>UF (ID):</label>
                  <input 
                    id="mpaUF"
                    type="number"
                    className="gps-input"
                    value={settings.mpaUF || ""}
                    onChange={(e) => onUpdate({ mpaUF: Number.parseInt(e.target.value, 10) || undefined })}
                    placeholder="Ex: 5"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-item">
                  <label htmlFor="mpaLocal" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Local (ID):</label>
                  <input 
                    id="mpaLocal"
                    type="number"
                    className="gps-input"
                    value={settings.mpaLocalPesca || ""}
                    onChange={(e) => onUpdate({ mpaLocalPesca: Number.parseInt(e.target.value, 10) || undefined })}
                    placeholder="Ex: 6"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>

            <div className="reap-turbo-section" style={{ marginTop: '5px' }}>
               <button 
                  onClick={handleTurboFill} 
                  disabled={turboLoading}
                  className="btn btn-primary"
                  style={{
                    width: '100%', padding: '12px',
                    backgroundColor: turboLoading ? '#ccc' : '#E53935', 
                    color: 'white', border: 'none', borderRadius: '4px',
                    fontWeight: 'bold', cursor: turboLoading ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
               >
                  {turboLoading ? "EXECUTANDO..." : "⚡ CADASTRAR REAP TURBO (12 MESES)"}
               </button>
               <p style={{ fontSize: '10px', color: '#666', marginTop: '8px', textAlign: 'center' }}>
                 * O preenchimento turbo utiliza as configurações acima para todos os meses.
               </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`accordion-icon ${isOpen ? "open" : ""}`}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default ReapMpaPanel;
