import React, { useState } from "react";
import { AppSettings } from "../../shared/types";
interface ReapPanelProps {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void;
  isOpen: boolean;
  onToggle: () => void;
}
const ReapPanel: React.FC<ReapPanelProps> = ({
  settings,
  onUpdate,
  isOpen,
  onToggle,
}) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) =>
    String(currentYear - 3 + i),
  );
  const [activeYear, setActiveYear] = useState(years[years.length - 1]);
  const handleDataChange = (year: string, data: string) => {
    const newData = { ...(settings.reapData || {}), [year]: data };
    onUpdate({ reapData: newData });
  };

  const [turboLoading, setTurboLoading] = useState(false);
  const handleTurboFill = async () => {
    setTurboLoading(true);
    try {
      let config;
      try {
        config = JSON.parse(settings.reapTurboConfig || "{}");
      } catch(e) {
        alert("JSON Inválido na configuração do Turbo");
        return;
      }

      // Default payload demonstration se estiver vazio
      if (!config.meses) {
          config = {
             areaRealizacao: { localPesca: 6, uf: 5, municipio: 4718, petrechosPesca: [4], ambientePesca: 1 },
             meses: Array.from({length: 12}, (_, i) => ({
                 mes: i + 1,
                 houvePesca: (i+1) >= 5 && (i+1) <= 8, // Pesca de maio a agosto por exemplo
                 diasTrabalhados: ((i+1) >= 5 && (i+1) <= 8) ? 15 : undefined,
                 justificativa: ((i+1) >= 5 && (i+1) <= 8) ? undefined : 1,
                 especies: ((i+1) >= 5 && (i+1) <= 8) ? [{ especiePescado: 12, unidadeMedida: 1, quantidade: 10, valorMedioQuilo: 8.5 }] : []
             }))
          };
      }

      const res = await browser.runtime.sendMessage({ action: "turboFillReap", config });
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
          <h2 className="section-title">REAP MPA</h2>
          <p className="section-description">
            Preenchimento automático Simplificado e Turbo via API
          </p>
        </div>
        <span className={`accordion-icon ${isOpen ? "open" : ""}`}>▾</span>
      </button>
      <div className={`accordion-content ${isOpen ? "open" : "collapsed"}`}>
        <div className="section-content">
          <div className="reap-tabs-container">
            <div className="reap-tabs-header">
              {years.map((year) => (
                <button
                  key={year}
                  className={`reap-tab ${activeYear === year ? "active" : ""}`}
                  onClick={() => setActiveYear(year)}
                >
                  {year}
                </button>
              ))}
            </div>

            <div className="reap-tab-content">
              {years.map((year) => (
                <div
                  key={year}
                  className={`reap-tab-panel ${activeYear === year ? "active" : "hidden"}`}
                >
                  <label className="reap-label">Dados para {year}:</label>
                  <textarea
                    className="reap-textarea"
                    placeholder="Cole aqui os dados do Excel (Quantidade e Preço separados por TAB)"
                    value={(settings.reapData || {})[year] || ""}
                    onChange={(e) => handleDataChange(year, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
          
          <div className="reap-turbo-section" style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '15px' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '10px', color: '#B53030' }}>⚡ PREENCHIMENTO TURBO (Avançado)</h3>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
              Cole o JSON de configuração do Turbo para todos os meses. Deixe em branco para usar o exemplo padrão.
            </p>
            <textarea
               className="reap-textarea"
               placeholder='{"meses": [...], "areaRealizacao": {...}}'
               value={settings.reapTurboConfig || ""}
               onChange={(e) => onUpdate({ reapTurboConfig: e.target.value })}
               style={{ height: '80px', fontFamily: 'monospace', fontSize: '11px' }}
            />
            <button 
               onClick={handleTurboFill} 
               disabled={turboLoading}
               style={{
                 width: '100%', padding: '10px', marginTop: '10px',
                 backgroundColor: turboLoading ? '#ccc' : '#E53935', 
                 color: 'white', border: 'none', borderRadius: '4px',
                 fontWeight: 'bold', cursor: turboLoading ? 'wait' : 'pointer'
               }}
            >
               {turboLoading ? "EXECUTANDO TURBO..." : "⚡ CADASTRAR REAP TURBO"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
export default ReapPanel;
