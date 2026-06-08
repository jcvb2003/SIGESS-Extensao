import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppSettings } from "../../../shared/types";
import { FULL_PORTAL_SPECIES } from "../../../shared/data/species";
import { MUNICIPIOS_LIST } from "../../../shared/data/municipios";

const IBAMA_PDF_FILENAME = "PT0048-051107.PDF";

const REAP_STATE_OPTIONS = [
  { value: 1, label: "RONDONIA", enabled: false },
  { value: 2, label: "ACRE", enabled: false },
  { value: 3, label: "AMAZONAS", enabled: false },
  { value: 4, label: "RORAIMA", enabled: false },
  { value: 5, label: "PARA", enabled: true },
  { value: 6, label: "AMAPA", enabled: false },
  { value: 7, label: "TOCANTINS", enabled: false },
  { value: 8, label: "MARANHAO", enabled: true },
  { value: 9, label: "PIAUI", enabled: false },
  { value: 10, label: "CEARA", enabled: false },
  { value: 11, label: "RIO GRANDE DO NORTE", enabled: false },
  { value: 12, label: "PARAIBA", enabled: false },
  { value: 13, label: "PERNAMBUCO", enabled: false },
  { value: 14, label: "ALAGOAS", enabled: false },
  { value: 15, label: "SERGIPE", enabled: false },
  { value: 16, label: "BAHIA", enabled: false },
  { value: 17, label: "MINAS GERAIS", enabled: false },
  { value: 18, label: "ESPIRITO SANTO", enabled: false },
  { value: 19, label: "RIO DE JANEIRO", enabled: false },
  { value: 20, label: "SAO PAULO", enabled: false },
  { value: 21, label: "PARANA", enabled: false },
  { value: 22, label: "SANTA CATARINA", enabled: false },
  { value: 23, label: "RIO GRANDE DO SUL", enabled: false },
  { value: 24, label: "MATO GROSSO DO SUL", enabled: false },
  { value: 25, label: "MATO GROSSO", enabled: false },
  { value: 26, label: "GOIAS", enabled: false },
  { value: 27, label: "DISTRITO FEDERAL", enabled: false },
  { value: 28, label: "EX", enabled: false },
] as const;

const WORK_RELATION_OPTIONS = [
  "Economia Familiar",
  "Individual/Autônomo",
];

const FISHING_LOCATION_OPTIONS = [
  { value: 6, label: "Rio" },
];

const FISHING_ENVIRONMENT_OPTIONS = [
  { value: 1, label: "Água Doce" },
];

const APETRECHOS_OPTIONS = [
  { value: 1, label: "Arrasto" },
  { value: 2, label: "Cerco" },
  { value: 3, label: "Covos" },
  { value: 4, label: "Emalhe" },
  { value: 5, label: "Espinhel" },
  { value: 6, label: "Linha de Mão" },
  { value: 7, label: "Linha e Anzol" },
  { value: 8, label: "Mariscagem" },
  { value: 9, label: "Matapi" },
  { value: 10, label: "Pesca Subaquática" },
  { value: 11, label: "Tarrafa" },
  { value: 12, label: "Vara" },
  { value: 13, label: "Outro" },
];

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const stateLabelById = new Map<number, string>(
  REAP_STATE_OPTIONS.map((option) => [option.value, option.label]),
);

const formatBRL = (raw: string) => {
  const n = parseFloat(raw);
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

interface ReapMpaSettingsFormProps {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
  onOpenFilePicker?: () => void;
}

interface SpeciesSearchProps {
  idx: number;
  selectedId?: number;
  disabledIds: number[];
  onChange: (id: number | undefined) => void;
}

interface CurrencyInputProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

const CurrencyInput: React.FC<CurrencyInputProps> = ({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className="gps-input"
      style={{ fontSize: "11px" }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? value : formatBRL(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        onChange(raw);
      }}
    />
  );
};

const SpeciesSearch: React.FC<SpeciesSearchProps> = ({
  idx,
  selectedId,
  disabledIds,
  onChange,
}) => {
  const selected = FULL_PORTAL_SPECIES.find((s) => s.id === selectedId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered =
    query.trim().length === 0
      ? FULL_PORTAL_SPECIES
      : FULL_PORTAL_SPECIES.filter(
          (s) =>
            s.nome.toLowerCase().includes(query.toLowerCase()) ||
            s.camposAdicionais.nomeCientifico.toLowerCase().includes(query.toLowerCase()),
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
    <div ref={containerRef} style={{ position: "relative", marginBottom: "8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid #ccc",
          borderRadius: "4px",
          background: "white",
          overflow: "hidden",
        }}
      >
        <input
          id={`specie-${idx}`}
          type="text"
          className="gps-input"
          style={{
            flex: 1,
            border: "none",
            fontSize: "11px",
            padding: "5px 6px",
            outline: "none",
          }}
          placeholder={selected ? selected.nome : "-- Buscar espécie --"}
          value={open ? query : selected ? selected.nome : ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {selectedId && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 6px",
              color: "#999",
              fontSize: "13px",
              lineHeight: 1,
            }}
            title="Limpar"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "white",
            border: "1px solid #ccc",
            borderRadius: "4px",
            maxHeight: "180px",
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: "8px",
                fontSize: "11px",
                color: "#888",
                textAlign: "center",
              }}
            >
              Nenhum resultado
            </div>
          )}
          {filtered.map((s) => {
            const isDisabled = disabledIds.includes(s.id) && s.id !== selectedId;
            return (
              <div
                key={s.id}
                onMouseDown={() => !isDisabled && handleSelect(s.id)}
                style={{
                  padding: "6px 8px",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  opacity: isDisabled ? 0.4 : 1,
                  background: s.id === selectedId ? "#e8f4fd" : "white",
                  borderBottom: "1px solid #f0f0f0",
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled) (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    s.id === selectedId ? "#e8f4fd" : "white";
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: "bold", color: "#333" }}>{s.nome}</div>
                <div style={{ fontSize: "9px", color: "#888", fontStyle: "italic" }}>
                  {s.camposAdicionais.nomeCientifico}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function MonthGrid({
  selectedMonths,
  onToggle,
}: {
  selectedMonths: number[];
  onToggle: (month: number) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "8px",
      }}
    >
      {MONTH_LABELS.map((label, index) => {
        const month = index + 1;
        const isSelected = selectedMonths.includes(month);
        return (
          <button
            key={month}
            type="button"
            onClick={() => onToggle(month)}
            style={{
              border: isSelected ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
              background: isSelected ? "var(--color-accent-soft)" : "white",
              color: isSelected ? "var(--color-accent-strong)" : "var(--color-text)",
              borderRadius: "10px",
              padding: "10px 6px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MultiStateSelector({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const toggle = (value: number) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "8px",
      }}
    >
      {REAP_STATE_OPTIONS.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px",
              borderRadius: "10px",
              border: checked ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
              background: checked ? "var(--color-accent-soft)" : "white",
              opacity: option.enabled ? 1 : 0.45,
              cursor: option.enabled ? "pointer" : "not-allowed",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              disabled={!option.enabled}
              checked={checked}
              onChange={() => toggle(option.value)}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function getMunicipiosByUf(ufCode?: number) {
  const ufLabel = ufCode ? stateLabelById.get(ufCode) : undefined;
  const ufSigla = ufLabel === "PARA" ? "PA" : ufLabel === "MARANHAO" ? "MA" : "";
  return MUNICIPIOS_LIST.filter((municipio) => municipio.camposAdicionais.siglaUf === ufSigla);
}

const ReapMpaSettingsForm: React.FC<ReapMpaSettingsFormProps> = ({
  settings,
  onUpdate,
  onOpenFilePicker,
}) => {
  const [cachedPdfFilename, setCachedPdfFilename] = useState<string | null>(null);

  useEffect(() => {
    browser.storage.local.get("sigessReapPdfCache").then((result: any) => {
      if (result.sigessReapPdfCache?.filename) {
        setCachedPdfFilename(result.sigessReapPdfCache.filename);
      }
    });

    const handleStorageChange = (changes: Record<string, any>) => {
      if ("sigessReapPdfCache" in changes) {
        setCachedPdfFilename(changes.sigessReapPdfCache.newValue?.filename ?? null);
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const residenceUf = settings.mpaResidenceUF ?? 5;
  const fishingUf = settings.mpaUF ?? 5;
  const defesoMonths = settings.mpaDefesoMonths ?? [1, 2, 3, 4];
  const commercializationStates = settings.mpaCommercializationStates ?? [5];
  const selectedSpeciesIds =
    settings.mpaSpecies?.map((s) => s.id).filter((id): id is number => id !== undefined) || [];
  const filled = settings.mpaSpecies?.filter((s) => s?.id).length ?? 0;
  const count = settings.mpaSpeciesCount ?? 5;
  const residenceMunicipios = useMemo(() => getMunicipiosByUf(residenceUf), [residenceUf]);
  const fishingMunicipios = useMemo(() => getMunicipiosByUf(fishingUf), [fishingUf]);

  const updateSpecie = (index: number, data: any) => {
    const current = settings.mpaSpecies || [];
    const next = [...current];
    for (let i = 0; i < 10; i++) {
      if (!next[i]) next[i] = {};
    }
    next[index] = { ...next[index], ...data };
    onUpdate({ mpaSpecies: next });
  };

  const toggleDefesoMonth = (month: number) => {
    const next = defesoMonths.includes(month)
      ? defesoMonths.filter((item) => item !== month)
      : [...defesoMonths, month].sort((a, b) => a - b);
    onUpdate({ mpaDefesoMonths: next });
  };

  return (
    <div className="stack" style={{ gap: "16px" }}>
      <section className="section" style={{ padding: "16px" }}>
        <div className="section-header">
          <h2 className="section-title">Página 1</h2>
          <p className="section-description">Identificação do pescador e dados de residência.</p>
        </div>

        <div className="stack" style={{ gap: "12px" }}>
          <div className="form-group">
            <label className="reap-label" htmlFor="mpaReferenceYear">Ano de referência do REAP</label>
            <select
              id="mpaReferenceYear"
              className="gps-select"
              value={settings.mpaReferenceYear || "2025"}
              onChange={(e) => onUpdate({ mpaReferenceYear: e.target.value })}
            >
              {Array.from({ length: Math.max(new Date().getFullYear() - 2025 + 1, 1) }, (_, index) => {
                const year = String(2025 + index);
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="form-group">
              <label className="reap-label" htmlFor="mpaResidenceUF">Estado de residência</label>
              <select
                id="mpaResidenceUF"
                className="gps-select"
                value={residenceUf}
                onChange={(e) =>
                  onUpdate({
                    mpaResidenceUF: Number(e.target.value),
                    mpaResidenceMunicipio: undefined,
                  })
                }
              >
                {REAP_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} disabled={!option.enabled}>
                    {option.label}{option.enabled ? "" : " (indisponível)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="reap-label" htmlFor="mpaResidenceMunicipio">Município de residência</label>
              <select
                id="mpaResidenceMunicipio"
                className="gps-select"
                value={settings.mpaResidenceMunicipio || ""}
                onChange={(e) => onUpdate({ mpaResidenceMunicipio: Number(e.target.value) })}
              >
                <option value="">Selecione um município...</option>
                {residenceMunicipios.map((municipio) => (
                  <option key={municipio.id} value={municipio.id}>
                    {municipio.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ padding: "16px" }}>
        <div className="section-header">
          <h2 className="section-title">Página 2</h2>
          <p className="section-description">Dados da atividade e estados de comercialização.</p>
        </div>

        <div className="stack" style={{ gap: "12px" }}>
          <div className="form-group">
            <label className="reap-label" htmlFor="mpaWorkRelation">Relação de trabalho</label>
            <select
              id="mpaWorkRelation"
              className="gps-select"
              value={settings.mpaWorkRelation || "Economia Familiar"}
              onChange={(e) => onUpdate({ mpaWorkRelation: e.target.value })}
            >
              {WORK_RELATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label">Estado de comercialização nos meses de referência</label>
            <MultiStateSelector
              selected={commercializationStates}
              onChange={(next) => onUpdate({ mpaCommercializationStates: next })}
            />
            <p className="reap-note">Somente Pará e Maranhão ficam habilitados por enquanto.</p>
          </div>
        </div>
      </section>

      <section className="section" style={{ padding: "16px" }}>
        <div className="section-header">
          <h2 className="section-title">Página 3</h2>
          <p className="section-description">Meses de defeso e perfil dos meses com pesca.</p>
        </div>

        <div className="stack" style={{ gap: "14px" }}>
          <div className="form-group">
            <label className="reap-label">Marque os meses do período de defeso.</label>
            <MonthGrid selectedMonths={defesoMonths} onToggle={toggleDefesoMonth} />
            <p className="reap-note">
              Meses marcados seguem o comportamento atual de defeso. Os demais seguem o fluxo de pesca.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="form-group">
              <label className="reap-label" htmlFor="mpaLocalPesca">Local da pesca</label>
              <select
                id="mpaLocalPesca"
                className="gps-select"
                value={settings.mpaLocalPesca ?? 6}
                onChange={(e) => onUpdate({ mpaLocalPesca: Number(e.target.value) })}
              >
                {FISHING_LOCATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="reap-label" htmlFor="mpaMetodoPesca">Método de pesca</label>
              <select
                id="mpaMetodoPesca"
                className="gps-select"
                value={settings.mpaMetodoPesca ?? settings.mpaPetrecho ?? 4}
                onChange={(e) => onUpdate({ mpaMetodoPesca: Number(e.target.value) })}
              >
                {APETRECHOS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="reap-label" htmlFor="mpaUF">UF</label>
              <select
                id="mpaUF"
                className="gps-select"
                value={fishingUf}
                onChange={(e) =>
                  onUpdate({
                    mpaUF: Number(e.target.value),
                    mpaMunicipio: undefined,
                  })
                }
              >
                {REAP_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} disabled={!option.enabled}>
                    {option.label}{option.enabled ? "" : " (indisponível)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="reap-label" htmlFor="mpaMunicipio">Município</label>
              <select
                id="mpaMunicipio"
                className="gps-select"
                value={settings.mpaMunicipio || ""}
                onChange={(e) => onUpdate({ mpaMunicipio: Number(e.target.value) })}
              >
                <option value="">Selecione um município...</option>
                {fishingMunicipios.map((municipio) => (
                  <option key={municipio.id} value={municipio.id}>
                    {municipio.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="reap-label" htmlFor="mpaPetrecho">Petrecho de pesca</label>
              <select
                id="mpaPetrecho"
                className="gps-select"
                value={settings.mpaPetrecho ?? 4}
                onChange={(e) => onUpdate({ mpaPetrecho: Number(e.target.value) })}
              >
                {APETRECHOS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="reap-label" htmlFor="mpaAmbiente">Ambiente de pesca</label>
              <select
                id="mpaAmbiente"
                className="gps-select"
                value={settings.mpaAmbiente ?? 1}
                onChange={(e) => onUpdate({ mpaAmbiente: Number(e.target.value) })}
              >
                {FISHING_ENVIRONMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ padding: "16px" }}>
        <div className="section-header">
          <h2 className="section-title">Espécies e Produção</h2>
          <p className="section-description">Parâmetros compartilhados pelos fluxos Iniciar e Turbo.</p>
        </div>

        <div className="stack" style={{ gap: "12px" }}>
          <div className="config-group" style={{ background: "var(--color-surface-alt)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
            <div className="form-item">
              <label htmlFor="mpaSpeciesCount" style={{ fontSize: "11px", fontWeight: "bold", display: "block", marginBottom: "4px", color: "var(--color-accent)" }}>
                QTD. DE PEIXES NO REAP:
              </label>
              <select
                id="mpaSpeciesCount"
                className="gps-input"
                style={{ width: "100%", padding: "6px" }}
                value={settings.mpaSpeciesCount ?? 5}
                onChange={(e) => onUpdate({ mpaSpeciesCount: Number(e.target.value) })}
              >
                {[4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} peixes
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="stack" style={{ gap: "10px" }}>
            {Array.from({ length: 10 }, (_, idx) => {
              const data = settings.mpaSpecies?.[idx] || {};
              const isOptional = idx >= 4;
              return (
                <div
                  key={idx}
                  style={{
                    background: "white",
                    padding: "8px",
                    borderRadius: "8px",
                    border: `1px solid ${isOptional ? "#e0e0e0" : "var(--color-border)"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label htmlFor={`specie-${idx}`} style={{ fontSize: "10px", fontWeight: "bold", color: "var(--color-accent)" }}>
                      ESPÉCIE {idx + 1}
                    </label>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: "bold",
                        padding: "2px 6px",
                        borderRadius: "10px",
                        background: isOptional ? "#f0f0f0" : "#e8f4fd",
                        color: isOptional ? "#888" : "#007bff",
                      }}
                    >
                      {isOptional ? "Opcional" : "Obrigatória"}
                    </span>
                  </div>

                  <SpeciesSearch
                    idx={idx}
                    selectedId={data.id}
                    disabledIds={selectedSpeciesIds}
                    onChange={(id) => updateSpecie(idx, { id })}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                    <div className="stack" style={{ gap: "2px" }}>
                      <span style={{ fontSize: "9px", fontWeight: "bold", color: "#888", textAlign: "center" }}>KG MÍN</span>
                      <input type="number" className="gps-input" style={{ width: "100%", textAlign: "center", fontSize: "11px" }} value={data.kgMin || ""} onChange={(e) => updateSpecie(idx, { kgMin: e.target.value })} placeholder="0" />
                    </div>
                    <div className="stack" style={{ gap: "2px" }}>
                      <span style={{ fontSize: "9px", fontWeight: "bold", color: "#888", textAlign: "center" }}>KG MÁX</span>
                      <input type="number" className="gps-input" style={{ width: "100%", textAlign: "center", fontSize: "11px" }} value={data.kgMax || ""} onChange={(e) => updateSpecie(idx, { kgMax: e.target.value })} placeholder="0" />
                    </div>
                    <div className="stack" style={{ gap: "2px" }}>
                      <span style={{ fontSize: "9px", fontWeight: "bold", color: "#888", textAlign: "center" }}>R$ MÍN</span>
                      <input type="number" className="gps-input" style={{ width: "100%", textAlign: "center", fontSize: "11px" }} value={data.priceMin || ""} onChange={(e) => updateSpecie(idx, { priceMin: e.target.value })} placeholder="0.00" step="0.01" />
                    </div>
                    <div className="stack" style={{ gap: "2px" }}>
                      <span style={{ fontSize: "9px", fontWeight: "bold", color: "#888", textAlign: "center" }}>R$ MÁX</span>
                      <input type="number" className="gps-input" style={{ width: "100%", textAlign: "center", fontSize: "11px" }} value={data.priceMax || ""} onChange={(e) => updateSpecie(idx, { priceMax: e.target.value })} placeholder="0.00" step="0.01" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filled < 4 && (
            <p style={{ fontSize: "10px", color: "#dc3545", textAlign: "center", margin: 0 }}>
              Preencha pelo menos 4 espécies para rodar o REAP.
            </p>
          )}
          {filled >= 4 && filled < count && (
            <p style={{ fontSize: "10px", color: "#856404", textAlign: "center", margin: 0 }}>
              Atenção: {filled} espécie(s) preenchida(s), mas {count} selecionada(s) para sorteio. Serão usadas todas as {filled}.
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div className="config-group" style={{ background: "var(--color-surface-alt)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
              <h3 style={{ fontSize: "10px", fontWeight: "bold", marginBottom: "8px", color: "var(--color-text)", textAlign: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "4px" }}>
                MASCULINO
              </h3>
              <div className="stack" style={{ gap: "8px" }}>
                <div>
                  <label htmlFor="mpaMascProdMin" style={{ fontSize: "9px", fontWeight: "bold", display: "block", marginBottom: "2px", color: "#666" }}>
                    Produção (R$)
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                    <CurrencyInput id="mpaMascProdMin" placeholder="Mín R$" value={settings.mpaMascProdMin || ""} onChange={(v) => onUpdate({ mpaMascProdMin: v })} />
                    <CurrencyInput ariaLabel="Produção Máxima Masculina" placeholder="Máx R$" value={settings.mpaMascProdMax || ""} onChange={(v) => onUpdate({ mpaMascProdMax: v })} />
                  </div>
                </div>
                <div>
                  <label htmlFor="mpaMascDaysMin" style={{ fontSize: "9px", fontWeight: "bold", display: "block", marginBottom: "2px", color: "#666" }}>
                    Dias Trab.
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                    <input id="mpaMascDaysMin" type="number" className="gps-input" style={{ fontSize: "11px" }} placeholder="Mín" value={settings.mpaMascDaysMin || ""} onChange={(e) => onUpdate({ mpaMascDaysMin: e.target.value })} />
                    <input type="number" className="gps-input" style={{ fontSize: "11px" }} aria-label="Dias Trabalhados Máximos Masculinos" placeholder="Máx" value={settings.mpaMascDaysMax || ""} onChange={(e) => onUpdate({ mpaMascDaysMax: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            <div className="config-group" style={{ background: "var(--color-surface-alt)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
              <h3 style={{ fontSize: "10px", fontWeight: "bold", marginBottom: "8px", color: "var(--color-text)", textAlign: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "4px" }}>
                FEMININO
              </h3>
              <div className="stack" style={{ gap: "8px" }}>
                <div>
                  <label htmlFor="mpaFemProdMin" style={{ fontSize: "9px", fontWeight: "bold", display: "block", marginBottom: "2px", color: "#666" }}>
                    Produção (R$)
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                    <CurrencyInput id="mpaFemProdMin" placeholder="Mín R$" value={settings.mpaFemProdMin || ""} onChange={(v) => onUpdate({ mpaFemProdMin: v })} />
                    <CurrencyInput ariaLabel="Produção Máxima Feminina" placeholder="Máx R$" value={settings.mpaFemProdMax || ""} onChange={(v) => onUpdate({ mpaFemProdMax: v })} />
                  </div>
                </div>
                <div>
                  <label htmlFor="mpaFemDaysMin" style={{ fontSize: "9px", fontWeight: "bold", display: "block", marginBottom: "2px", color: "#666" }}>
                    Dias Trab.
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                    <input id="mpaFemDaysMin" type="number" className="gps-input" style={{ fontSize: "11px" }} placeholder="Mín" value={settings.mpaFemDaysMin || ""} onChange={(e) => onUpdate({ mpaFemDaysMin: e.target.value })} />
                    <input type="number" className="gps-input" style={{ fontSize: "11px" }} aria-label="Dias Trabalhados Máximos Femininos" placeholder="Máx" value={settings.mpaFemDaysMax || ""} onChange={(e) => onUpdate({ mpaFemDaysMax: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ padding: "16px" }}>
        <div className="section-header">
          <h2 className="section-title">Documento Comprobatório</h2>
          <p className="section-description">Meses sem pesca.</p>
        </div>

        <div className="stack" style={{ gap: "10px" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            {(["manual", "local", "url"] as const).map((mode) => (
              <label
                key={mode}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  cursor: "pointer",
                  flex: 1,
                  justifyContent: "center",
                }}
              >
                <input
                  type="radio"
                  name="mpaDocumentoMode"
                  value={mode}
                  checked={(settings.mpaDocumentoMode || "manual") === mode}
                  onChange={() => onUpdate({ mpaDocumentoMode: mode })}
                />
                {mode === "manual" ? "Manual" : mode === "local" ? "Local" : "Internet"}
              </label>
            ))}
          </div>

          {(settings.mpaDocumentoMode || "manual") === "local" && (
            <div>
              <button
                type="button"
                onClick={() =>
                  onOpenFilePicker
                    ? onOpenFilePicker()
                    : browser.tabs.create({ url: browser.runtime.getURL("file_picker.html") })
                }
                className="btn btn-secondary btn-full"
                style={{ minHeight: "44px" }}
              >
                Selecionar PDF
              </button>
              {cachedPdfFilename ? (
                <p style={{ fontSize: "10px", color: "#28a745", marginTop: "4px" }}>✅ {cachedPdfFilename}</p>
              ) : (
                <p style={{ fontSize: "10px", color: "#999", marginTop: "4px" }}>Nenhum PDF selecionado</p>
              )}
            </div>
          )}

          {(settings.mpaDocumentoMode || "manual") === "url" && (
            <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0 }}>
              📡 {IBAMA_PDF_FILENAME} — baixado automaticamente pelo Turbo.
            </p>
          )}

          {(settings.mpaDocumentoMode || "manual") === "manual" && (
            <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0 }}>
              Anexe o PDF manualmente no portal após rodar o Turbo.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default ReapMpaSettingsForm;
