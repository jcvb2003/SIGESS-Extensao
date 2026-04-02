import React, { useState, useRef, useEffect } from "react";
import { AppSettings } from "../../../shared/types";
import { FULL_PORTAL_SPECIES } from "../../../shared/data/species";
import { MUNICIPIOS_LIST } from "../../../shared/data/municipios";

interface ReapMpaPanelProps {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void;
  isOpen: boolean;
  onToggle: () => void;
}

interface SpeciesSearchProps {
  idx: number;
  selectedId?: number;
  disabledIds: number[];
  onChange: (id: number | undefined) => void;
}

const formatBRL = (raw: string) => {
  const n = parseFloat(raw);
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

interface CurrencyInputProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

const CurrencyInput: React.FC<CurrencyInputProps> = ({ id, value, onChange, placeholder, ariaLabel }) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className="gps-input"
      style={{ fontSize: '11px' }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? value : formatBRL(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => {
        // allow digits, dot and comma; normalize comma to dot
        const raw = e.target.value.replace(",", ".");
        onChange(raw);
      }}
    />
  );
};

const SpeciesSearch: React.FC<SpeciesSearchProps> = ({ idx, selectedId, disabledIds, onChange }) => {
  const selected = FULL_PORTAL_SPECIES.find(s => s.id === selectedId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim().length === 0
    ? FULL_PORTAL_SPECIES
    : FULL_PORTAL_SPECIES.filter(s =>
        s.nome.toLowerCase().includes(query.toLowerCase()) ||
        s.camposAdicionais.nomeCientifico.toLowerCase().includes(query.toLowerCase())
      );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (id: number) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    setQuery("");
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: '8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid #ccc',
          borderRadius: '4px',
          background: 'white',
          overflow: 'hidden',
        }}
      >
        <input
          id={`specie-${idx}`}
          type="text"
          className="gps-input"
          style={{ flex: 1, border: 'none', fontSize: '11px', padding: '5px 6px', outline: 'none' }}
          placeholder={selected ? selected.nome : "-- Buscar espécie --"}
          value={open ? query : (selected ? selected.nome : "")}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
        {selectedId && (
          <button
            type="button"
            onClick={handleClear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px', color: '#999', fontSize: '13px', lineHeight: 1 }}
            title="Limpar"
          >×</button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          maxHeight: '180px',
          overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '8px', fontSize: '11px', color: '#888', textAlign: 'center' }}>Nenhum resultado</div>
          )}
          {filtered.map(s => {
            const isDisabled = disabledIds.includes(s.id) && s.id !== selectedId;
            return (
              <div
                key={s.id}
                onMouseDown={() => !isDisabled && handleSelect(s.id)}
                style={{
                  padding: '6px 8px',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  opacity: isDisabled ? 0.4 : 1,
                  background: s.id === selectedId ? '#e8f4fd' : 'white',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={e => { if (!isDisabled) (e.currentTarget as HTMLDivElement).style.background = '#f5f5f5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = s.id === selectedId ? '#e8f4fd' : 'white'; }}
              >
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#333' }}>{s.nome}</div>
                <div style={{ fontSize: '9px', color: '#888', fontStyle: 'italic' }}>{s.camposAdicionais.nomeCientifico}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ReapMpaPanel: React.FC<ReapMpaPanelProps> = ({
  settings,
  onUpdate,
  isOpen,
  onToggle,
}) => {
  const updateSpecie = (index: number, data: any) => {
    const current = settings.mpaSpecies || [];
    const next = [...current];
    for (let i = 0; i < 10; i++) {
      if (!next[i]) next[i] = {};
    }
    next[index] = { ...next[index], ...data };
    onUpdate({ mpaSpecies: next });
  };

  const selectedSpeciesIds = settings.mpaSpecies?.map(s => s.id).filter(id => id !== undefined) || [];
  const filled = settings.mpaSpecies?.filter(s => s?.id).length ?? 0;
  const count = settings.mpaSpeciesCount ?? 5;

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

            {/* QUANTIDADE DE PEIXES NO REAP */}
            <div className="config-group" style={{ background: 'var(--color-surface-alt)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div className="form-item">
                <label htmlFor="mpaSpeciesCount" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: 'var(--color-accent)' }}>QTD. DE PEIXES NO REAP:</label>
                <select
                  id="mpaSpeciesCount"
                  className="gps-input"
                  style={{ width: '100%', padding: '6px' }}
                  value={settings.mpaSpeciesCount ?? 5}
                  onChange={(e) => onUpdate({ mpaSpeciesCount: Number(e.target.value) })}
                >
                  {[3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n} peixes</option>
                  ))}
                </select>
              </div>
            </div>

            {/* CONFIGURAÇÃO DE ESPÉCIES */}
            <div className="stack" style={{ gap: '10px' }}>
              {Array.from({ length: 10 }, (_, idx) => {
                const data = settings.mpaSpecies?.[idx] || {};
                const isOptional = idx >= 5;
                return (
                  <div key={idx} style={{ background: 'white', padding: '8px', borderRadius: '8px', border: `1px solid ${isOptional ? '#e0e0e0' : 'var(--color-border)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label htmlFor={`specie-${idx}`} style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-accent)' }}>ESPÉCIE {idx + 1}</label>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        background: isOptional ? '#f0f0f0' : '#e8f4fd',
                        color: isOptional ? '#888' : '#007bff',
                      }}>
                        {isOptional ? 'Opcional' : 'Obrigatória'}
                      </span>
                    </div>

                    <SpeciesSearch
                      idx={idx}
                      selectedId={data.id}
                      disabledIds={selectedSpeciesIds as number[]}
                      onChange={(id) => updateSpecie(idx, { id })}
                    />

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
                        <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#888', textAlign: 'center' }}>R$ MÍN</span>
                        <input type="number" className="gps-input" style={{ width: '100%', textAlign: 'center', fontSize: '11px' }} value={data.priceMin || ""} onChange={(e) => updateSpecie(idx, { priceMin: e.target.value })} placeholder="0.00" step="0.01" />
                      </div>
                      <div className="stack" style={{ gap: '2px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#888', textAlign: 'center' }}>R$ MÁX</span>
                        <input type="number" className="gps-input" style={{ width: '100%', textAlign: 'center', fontSize: '11px' }} value={data.priceMax || ""} onChange={(e) => updateSpecie(idx, { priceMax: e.target.value })} placeholder="0.00" step="0.01" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AVISOS DE VALIDAÇÃO */}
            {filled < 5 && (
              <p style={{ fontSize: '10px', color: '#dc3545', textAlign: 'center', margin: '0' }}>
                Preencha pelo menos 5 espécies (obrigatórias) para rodar o REAP.
              </p>
            )}
            {filled >= 5 && filled < count && (
              <p style={{ fontSize: '10px', color: '#856404', textAlign: 'center', margin: '0' }}>
                Atenção: {filled} espécie(s) preenchida(s), mas {count} selecionada(s) para sorteio. Serão usadas todas as {filled}.
              </p>
            )}

            {/* PARÂMETROS POR GÊNERO */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {/* MASCULINO */}
              <div className="config-group" style={{ background: 'var(--color-surface-alt)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--color-text)', textAlign: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>MASCULINO</h3>
                <div className="stack" style={{ gap: '8px' }}>
                  <div>
                    <label htmlFor="mpaMascProdMin" style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: '#666' }}>Produção (R$)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <CurrencyInput id="mpaMascProdMin" placeholder="Mín R$" value={settings.mpaMascProdMin || ""} onChange={v => onUpdate({ mpaMascProdMin: v })} />
                      <CurrencyInput ariaLabel="Produção Máxima Masculina" placeholder="Máx R$" value={settings.mpaMascProdMax || ""} onChange={v => onUpdate({ mpaMascProdMax: v })} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="mpaMascDaysMin" style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: '#666' }}>Dias Trab.</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <input id="mpaMascDaysMin" type="number" className="gps-input" style={{ fontSize: '11px' }} placeholder="Mín" value={settings.mpaMascDaysMin || ""} onChange={(e) => onUpdate({ mpaMascDaysMin: e.target.value })} />
                      <input type="number" className="gps-input" style={{ fontSize: '11px' }} aria-label="Dias Trabalhados Máximos Masculinos" placeholder="Máx" value={settings.mpaMascDaysMax || ""} onChange={(e) => onUpdate({ mpaMascDaysMax: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              {/* FEMININO */}
              <div className="config-group" style={{ background: 'var(--color-surface-alt)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--color-text)', textAlign: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>FEMININO</h3>
                <div className="stack" style={{ gap: '8px' }}>
                  <div>
                    <label htmlFor="mpaFemProdMin" style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: '#666' }}>Produção (R$)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <CurrencyInput id="mpaFemProdMin" placeholder="Mín R$" value={settings.mpaFemProdMin || ""} onChange={v => onUpdate({ mpaFemProdMin: v })} />
                      <CurrencyInput ariaLabel="Produção Máxima Feminina" placeholder="Máx R$" value={settings.mpaFemProdMax || ""} onChange={v => onUpdate({ mpaFemProdMax: v })} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="mpaFemDaysMin" style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: '#666' }}>Dias Trab.</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <input id="mpaFemDaysMin" type="number" className="gps-input" style={{ fontSize: '11px' }} placeholder="Mín" value={settings.mpaFemDaysMin || ""} onChange={(e) => onUpdate({ mpaFemDaysMin: e.target.value })} />
                      <input type="number" className="gps-input" style={{ fontSize: '11px' }} aria-label="Dias Trabalhados Máximos Femininos" placeholder="Máx" value={settings.mpaFemDaysMax || ""} onChange={(e) => onUpdate({ mpaFemDaysMax: e.target.value })} />
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
