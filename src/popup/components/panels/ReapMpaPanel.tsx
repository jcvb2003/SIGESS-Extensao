import React from "react";
import { AppSettings } from "../../../shared/types";
import { FULL_PORTAL_SPECIES } from "../../../shared/data/species";
import { MUNICIPIOS_LIST } from "../../../shared/data/municipios";

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
  const updateSpecie = (index: number, data: any) => {
    const current = settings.mpaSpecies || [];
    const next = [...current];
    for (let i = 0; i < 5; i++) {
        if (!next[i]) next[i] = {};
    }
    next[index] = { ...next[index], ...data };
    onUpdate({ mpaSpecies: next });
  };

  const selectedSpeciesIds = settings.mpaSpecies?.map(s => s.id).filter(id => id !== undefined) || [];

  const rarities = [
    "Menos Raro (1ª)",
    "Raridade 2",
    "Raridade 3",
    "Raridade 4",
    "Mais Raro (5ª)"
  ];

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
            Configurações e Parâmetros para Pesca
          </p>
        </div>
        <ChevronIcon isOpen={isOpen} />
      </button>

      <div className={`accordion-content ${isOpen ? "open" : "collapsed"}`}>
        <div className="section-content">
          <div className="stack" style={{ gap: '12px' }}>
            
            {/* LOCALIZAÇÃO */}
            <div className="config-group" style={{ background: 'var(--color-surface-alt)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div className="form-item">
                <label htmlFor="mpaMunicipioSelect" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: 'var(--color-accent)' }}>MUNICÍPIO:</label>
                <select 
                  id="mpaMunicipioSelect"
                  className="gps-input"
                  style={{ width: '100%', padding: '6px' }}
                  value={settings.mpaMunicipio || ""}
                  onChange={(e) => onUpdate({ mpaMunicipio: Number(e.target.value) })}
                >
                  <option value="">Selecione um município...</option>
                  {MUNICIPIOS_LIST.map(m => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* CONFIGURAÇÃO DE ESPÉCIES */}
            <div className="stack" style={{ gap: '10px' }}>
              {[0, 1, 2, 3, 4].map(idx => {
                const data = settings.mpaSpecies?.[idx] || {};
                return (
                  <div key={idx} style={{ background: 'white', padding: '8px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label htmlFor={`specie-${idx}`} style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-accent)' }}>ESPÉCIE - {rarities[idx]}</label>
                    </div>
                    
                    <select 
                      id={`specie-${idx}`}
                      className="gps-input"
                      style={{ width: '100%', fontSize: '11px', marginBottom: '8px' }}
                      value={data.id || ""}
                      onChange={(e) => updateSpecie(idx, { id: Number(e.target.value) })}
                    >
                      <option value="">-- Selecione a Espécie --</option>
                      {FULL_PORTAL_SPECIES.map(s => (
                        <option 
                          key={s.id} 
                          value={s.id}
                          disabled={selectedSpeciesIds.includes(s.id) && data.id !== s.id}
                        >
                          {s.nome}
                        </option>
                      ))}
                    </select>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                      <div className="stack" style={{ gap: '2px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#888', textAlign: 'center' }}>KG MÍN</span>
                        <input type="number" className="gps-input" style={{ width: '100%', textAlign: 'center', fontSize: '11px' }} value={data.kgMin || ""} onChange={(e) => updateSpecie(idx, { kgMin: e.target.value })} placeholder="0" />
                      </div>
                      <div className="stack" style={{ gap: '2px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#888', textAlign: 'center' }}>KG MÁX</span>
                        <input type="number" className="gps-input" style={{ width: '100%', textAlign: 'center', fontSize: '11px' }} value={data.kgMax || ""} onChange={(e) => updateSpecie(idx, { kgMax: e.target.value })} placeholder="0" />
                      </div>
                      <div className="stack" style={{ gap: '2px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#888', textAlign: 'center' }}>VAL MÍN</span>
                        <input type="number" className="gps-input" style={{ width: '100%', textAlign: 'center', fontSize: '11px' }} value={data.priceMin || ""} onChange={(e) => updateSpecie(idx, { priceMin: e.target.value })} placeholder="0.00" step="0.01" />
                      </div>
                      <div className="stack" style={{ gap: '2px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#888', textAlign: 'center' }}>VAL MÁX</span>
                        <input type="number" className="gps-input" style={{ width: '100%', textAlign: 'center', fontSize: '11px' }} value={data.priceMax || ""} onChange={(e) => updateSpecie(idx, { priceMax: e.target.value })} placeholder="0.00" step="0.01" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PARÂMETROS POR GÊNERO */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {/* MASCULINO */}
              <div className="config-group" style={{ background: 'var(--color-surface-alt)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--color-text)', textAlign: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>MASCULINO</h3>
                <div className="stack" style={{ gap: '8px' }}>
                  <div>
                    <label htmlFor="mpaMascProdMin" style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: '#666' }}>Produção (kg)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <input id="mpaMascProdMin" type="number" className="gps-input" style={{fontSize: '11px'}} placeholder="Mín" value={settings.mpaMascProdMin || ""} onChange={(e) => onUpdate({ mpaMascProdMin: e.target.value })} />
                      <input type="number" className="gps-input" style={{fontSize: '11px'}} aria-label="Produção Máxima Masculina" placeholder="Máx" value={settings.mpaMascProdMax || ""} onChange={(e) => onUpdate({ mpaMascProdMax: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="mpaMascDaysMin" style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: '#666' }}>Dias Trab.</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <input id="mpaMascDaysMin" type="number" className="gps-input" style={{fontSize: '11px'}} placeholder="Mín" value={settings.mpaMascDaysMin || ""} onChange={(e) => onUpdate({ mpaMascDaysMin: e.target.value })} />
                      <input type="number" className="gps-input" style={{fontSize: '11px'}} aria-label="Dias Trabalhados Máximos Masculinos" placeholder="Máx" value={settings.mpaMascDaysMax || ""} onChange={(e) => onUpdate({ mpaMascDaysMax: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              {/* FEMININO */}
              <div className="config-group" style={{ background: 'var(--color-surface-alt)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--color-text)', textAlign: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>FEMININO</h3>
                <div className="stack" style={{ gap: '8px' }}>
                  <div>
                    <label htmlFor="mpaFemProdMin" style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: '#666' }}>Produção (kg)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <input id="mpaFemProdMin" type="number" className="gps-input" style={{fontSize: '11px'}} placeholder="Mín" value={settings.mpaFemProdMin || ""} onChange={(e) => onUpdate({ mpaFemProdMin: e.target.value })} />
                      <input type="number" className="gps-input" style={{fontSize: '11px'}} aria-label="Produção Máxima Feminina" placeholder="Máx" value={settings.mpaFemProdMax || ""} onChange={(e) => onUpdate({ mpaFemProdMax: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="mpaFemDaysMin" style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: '#666' }}>Dias Trab.</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <input id="mpaFemDaysMin" type="number" className="gps-input" style={{fontSize: '11px'}} placeholder="Mín" value={settings.mpaFemDaysMin || ""} onChange={(e) => onUpdate({ mpaFemDaysMin: e.target.value })} />
                      <input type="number" className="gps-input" style={{fontSize: '11px'}} aria-label="Dias Trabalhados Máximos Femininos" placeholder="Máx" value={settings.mpaFemDaysMax || ""} onChange={(e) => onUpdate({ mpaFemDaysMax: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '4px', textAlign: 'center' }}>
              * Os parâmetros acima definem os intervalos de geração para o robô.
            </p>
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
