import { useRef } from "react";
import { AppSettings } from "../../../../shared/types";
import { CurrencyInput, SpeciesSearch } from "./SharedFields";

function AnnualRangeSlider({
  absMin,
  absMax,
  value,
  onChange,
}: {
  absMin: number;
  absMax: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"lo" | "hi" | null>(null);
  const [lo, hi] = value;

  if (absMin >= absMax) {
    return (
      <div style={{ fontSize: "10px", color: "var(--color-muted)", marginTop: "4px", textAlign: "center" }}>
        Total/ano: {absMin} dias
      </div>
    );
  }

  const valueFromPointer = (e: React.PointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(absMin + pct * (absMax - absMin));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const v = valueFromPointer(e);
    draggingRef.current = Math.abs(v - lo) <= Math.abs(v - hi) ? "lo" : "hi";
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (draggingRef.current === "lo") onChange([Math.min(v, hi), hi]);
    else onChange([lo, Math.max(v, lo)]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const v = valueFromPointer(e);
    if (draggingRef.current === "lo") onChange([Math.min(v, hi), hi]);
    else onChange([lo, Math.max(v, lo)]);
  };

  const onPointerUp = () => { draggingRef.current = null; };

  const pctLo = ((lo - absMin) / (absMax - absMin)) * 100;
  const pctHi = ((hi - absMin) / (absMax - absMin)) * 100;

  const handle = (pct: number): React.CSSProperties => ({
    position: "absolute",
    top: "50%",
    left: `${pct}%`,
    transform: "translate(-50%, -50%)",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: "var(--color-accent)",
    border: "2px solid var(--color-page)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
    cursor: "grab",
    pointerEvents: "none",
  });

  return (
    <div style={{ marginTop: "6px" }}>
      <div style={{ fontSize: "10px", color: "var(--color-muted)", textAlign: "center", marginBottom: "4px" }}>
        Total/ano: <strong style={{ color: "var(--color-accent)" }}>{lo}–{hi}</strong> dias
      </div>
      <div
        ref={trackRef}
        style={{ position: "relative", height: "18px", cursor: "pointer", userSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div style={{ position: "absolute", top: "7px", left: 0, right: 0, height: "3px", background: "var(--color-border)", borderRadius: "2px" }} />
        <div style={{ position: "absolute", top: "7px", left: `${pctLo}%`, width: `${pctHi - pctLo}%`, height: "3px", background: "var(--color-accent)", borderRadius: "2px" }} />
        <div style={handle(pctLo)} />
        <div style={handle(pctHi)} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-muted)", marginTop: "1px" }}>
        <span>{absMin}</span><span>{absMax}</span>
      </div>
    </div>
  );
}

export function ReapSpeciesSection({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}) {
  const selectedSpeciesIds =
    settings.mpaSpecies?.map((s) => s.id).filter((id): id is number => id !== undefined) || [];
  const filled = settings.mpaSpecies?.filter((s) => s?.id).length ?? 0;
  const count = settings.mpaSpeciesCount ?? 5;

  const updateSpecie = (index: number, data: any) => {
    const current = settings.mpaSpecies || [];
    const next = [...current];
    for (let i = 0; i < 10; i++) {
      if (!next[i]) next[i] = {};
    }
    next[index] = { ...next[index], ...data };
    onUpdate({ mpaSpecies: next });
  };

  return (
    <section className="section">
      <div className="section-header">
        <span className="section-num">04</span>
        <div>
          <h2 className="section-title">Espécies e Produção</h2>
          <p className="section-description">Espécies declaradas, kg e preço por gênero.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="form-group">
          <label className="reap-label" htmlFor="mpaSpeciesCount">Qtd. de espécies no REAP</label>
          <select
            id="mpaSpeciesCount"
            className="gps-select"
            value={settings.mpaSpeciesCount ?? 5}
            onChange={(e) => onUpdate({ mpaSpeciesCount: Number(e.target.value) })}
          >
            {[4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n} espécies</option>
            ))}
          </select>
        </div>

        <div className="stack" style={{ gap: "8px" }}>
          {Array.from({ length: 10 }, (_, idx) => {
            const data = settings.mpaSpecies?.[idx] || {};
            const isOptional = idx >= 4;
            return (
              <div
                key={idx}
                style={{
                  background: "var(--color-surface-alt)",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  borderLeft: isOptional
                    ? "3px solid var(--color-border-strong)"
                    : "3px solid var(--color-accent)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{
                    fontFamily: "var(--mono)",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: isOptional ? "var(--color-muted)" : "var(--color-accent)",
                  }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: isOptional ? "transparent" : "var(--color-accent-soft)",
                    color: isOptional ? "var(--color-muted)" : "var(--color-accent-strong)",
                    border: isOptional ? "1px solid var(--color-border)" : "none",
                  }}>
                    {isOptional ? "opcional" : "obrigatória"}
                  </span>
                </div>

                <SpeciesSearch
                  idx={idx}
                  selectedId={data.id}
                  disabledIds={selectedSpeciesIds}
                  onChange={(id) => updateSpecie(idx, { id })}
                />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                  {[
                    { key: "kgMin", label: "KG MÍN" },
                    { key: "kgMax", label: "KG MÁX" },
                    { key: "priceMin", label: "R$ MÍN" },
                    { key: "priceMax", label: "R$ MÁX" },
                  ].map(({ key, label }) => (
                    <div key={key} className="stack" style={{ gap: "3px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-muted)", textAlign: "center" }}>
                        {label}
                      </span>
                      <input
                        type="number"
                        className="gps-input"
                        style={{ textAlign: "center", fontSize: "12px", padding: "6px 4px" }}
                        value={(data as any)[key] || ""}
                        onChange={(e) => updateSpecie(idx, { [key]: e.target.value })}
                        placeholder="0"
                        step={key.startsWith("price") ? "0.01" : "1"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {filled < 4 && (
          <p style={{ fontSize: "11px", color: "var(--color-danger)", textAlign: "center", margin: 0 }}>
            Preencha ao menos 4 espécies.
          </p>
        )}
        {filled >= 4 && filled < count && (
          <p style={{ fontSize: "11px", color: "var(--color-warning)", textAlign: "center", margin: 0 }}>
            {filled} preenchida(s) / {count} selecionada(s) — serão usadas {filled}.
          </p>
        )}

        {(() => {
          const fishingCount = 12 - (settings.mpaDefesoMonths || []).length;
          const mascMin = Number(settings.mpaMascDaysMin) || 0;
          const mascMax = Number(settings.mpaMascDaysMax) || 0;
          const femMin = Number(settings.mpaFemDaysMin) || 0;
          const femMax = Number(settings.mpaFemDaysMax) || 0;

          const mascAbsMin = fishingCount * mascMin;
          const mascAbsMax = fishingCount * mascMax;
          const femAbsMin = fishingCount * femMin;
          const femAbsMax = fishingCount * femMax;

          const mascAnnualMin = settings.mpaMascAnnualMin ?? mascAbsMin;
          const mascAnnualMax = settings.mpaMascAnnualMax ?? mascAbsMax;
          const femAnnualMin = settings.mpaFemAnnualMin ?? femAbsMin;
          const femAnnualMax = settings.mpaFemAnnualMax ?? femAbsMax;

          const hasMasc = mascMin > 0 && mascMax > 0 && fishingCount > 0;
          const hasFem = femMin > 0 && femMax > 0 && fishingCount > 0;

          const panelColors: Record<string, { accent: string; soft: string }> = {
            MASCULINO: { accent: "#2563eb", soft: "rgba(37,99,235,0.08)" },
            FEMININO:  { accent: "#db2777", soft: "rgba(219,39,119,0.08)" },
          };

          const panelStyle = (_label: string): React.CSSProperties => ({
            background: "var(--color-surface-alt)",
            padding: "0",
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          });

          const panelHeader = (label: string): React.CSSProperties => ({
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderBottom: "1px solid var(--color-border)",
            background: panelColors[label]?.soft ?? "var(--color-surface-alt)",
          });

          const panelBody: React.CSSProperties = {
            padding: "12px",
          };

          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {[
                {
                  label: "MASCULINO",
                  prodMinKey: "mpaMascProdMin" as const,
                  prodMaxKey: "mpaMascProdMax" as const,
                  daysMinKey: "mpaMascDaysMin" as const,
                  daysMaxKey: "mpaMascDaysMax" as const,
                  daysMinId: "mpaMascDaysMin",
                  daysMaxLabel: "Dias Trabalhados Máximos Masculinos",
                  absMin: mascAbsMin,
                  absMax: mascAbsMax,
                  annualMin: mascAnnualMin,
                  annualMax: mascAnnualMax,
                  has: hasMasc,
                  onAnnualChange: ([lo, hi]: [number, number]) => onUpdate({ mpaMascAnnualMin: lo, mpaMascAnnualMax: hi }),
                  onDaysMinChange: (v: string) => onUpdate({ mpaMascDaysMin: v, mpaMascAnnualMin: undefined, mpaMascAnnualMax: undefined }),
                  onDaysMaxChange: (v: string) => onUpdate({ mpaMascDaysMax: v, mpaMascAnnualMin: undefined, mpaMascAnnualMax: undefined }),
                  onProdMinChange: (v: string) => onUpdate({ mpaMascProdMin: v }),
                  onProdMaxChange: (v: string) => onUpdate({ mpaMascProdMax: v }),
                  prodMinVal: settings.mpaMascProdMin || "",
                  prodMaxVal: settings.mpaMascProdMax || "",
                  daysMinVal: settings.mpaMascDaysMin || "",
                  daysMaxVal: settings.mpaMascDaysMax || "",
                },
                {
                  label: "FEMININO",
                  prodMinKey: "mpaFemProdMin" as const,
                  prodMaxKey: "mpaFemProdMax" as const,
                  daysMinKey: "mpaFemDaysMin" as const,
                  daysMaxKey: "mpaFemDaysMax" as const,
                  daysMinId: "mpaFemDaysMin",
                  daysMaxLabel: "Dias Trabalhados Máximos Femininos",
                  absMin: femAbsMin,
                  absMax: femAbsMax,
                  annualMin: femAnnualMin,
                  annualMax: femAnnualMax,
                  has: hasFem,
                  onAnnualChange: ([lo, hi]: [number, number]) => onUpdate({ mpaFemAnnualMin: lo, mpaFemAnnualMax: hi }),
                  onDaysMinChange: (v: string) => onUpdate({ mpaFemDaysMin: v, mpaFemAnnualMin: undefined, mpaFemAnnualMax: undefined }),
                  onDaysMaxChange: (v: string) => onUpdate({ mpaFemDaysMax: v, mpaFemAnnualMin: undefined, mpaFemAnnualMax: undefined }),
                  onProdMinChange: (v: string) => onUpdate({ mpaFemProdMin: v }),
                  onProdMaxChange: (v: string) => onUpdate({ mpaFemProdMax: v }),
                  prodMinVal: settings.mpaFemProdMin || "",
                  prodMaxVal: settings.mpaFemProdMax || "",
                  daysMinVal: settings.mpaFemDaysMin || "",
                  daysMaxVal: settings.mpaFemDaysMax || "",
                },
              ].map((panel) => (
                <div key={panel.label} style={panelStyle(panel.label)}>
                  <div style={panelHeader(panel.label)}>
                    <span style={{
                      width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                      background: panelColors[panel.label]?.accent ?? "var(--color-accent)",
                    }} />
                    <span style={{
                      fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em",
                      color: panelColors[panel.label]?.accent ?? "var(--color-text-strong)",
                    }}>
                      {panel.label}
                    </span>
                  </div>
                  <div className="stack" style={{ ...panelBody, gap: "10px" }}>
                    <div>
                      <label htmlFor={`${panel.daysMinId}-prod`} className="reap-label" style={{ marginBottom: "4px" }}>
                        Produção (R$)
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                        <CurrencyInput
                          id={`${panel.daysMinId}-prod`}
                          placeholder="Mín"
                          value={panel.prodMinVal}
                          onChange={panel.onProdMinChange}
                        />
                        <CurrencyInput
                          ariaLabel={`Produção Máxima ${panel.label}`}
                          placeholder="Máx"
                          value={panel.prodMaxVal}
                          onChange={panel.onProdMaxChange}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor={panel.daysMinId} className="reap-label" style={{ marginBottom: "4px" }}>
                        Dias/Mês
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                        <input
                          id={panel.daysMinId}
                          type="number"
                          className="gps-input"
                          style={{ fontSize: "12px" }}
                          placeholder="Mín"
                          min={7}
                          max={27}
                          value={panel.daysMinVal}
                          onChange={(e) => panel.onDaysMinChange(e.target.value)}
                        />
                        <input
                          type="number"
                          className="gps-input"
                          style={{ fontSize: "12px" }}
                          aria-label={panel.daysMaxLabel}
                          placeholder="Máx"
                          min={7}
                          max={27}
                          value={panel.daysMaxVal}
                          onChange={(e) => panel.onDaysMaxChange(e.target.value)}
                        />
                      </div>
                      {panel.has ? (
                        <AnnualRangeSlider
                          absMin={panel.absMin}
                          absMax={panel.absMax}
                          value={[panel.annualMin, panel.annualMax]}
                          onChange={panel.onAnnualChange}
                        />
                      ) : (
                        <div style={{ fontSize: "10px", color: "var(--color-muted)", marginTop: "4px", textAlign: "center" }}>—</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
