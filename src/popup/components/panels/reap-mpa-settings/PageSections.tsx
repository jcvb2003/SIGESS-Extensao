import { useEffect, useState } from "react";
import { AppSettings } from "../../../../shared/types";
import {
  APETRECHOS_OPTIONS,
  FISHING_LOCATION_OPTIONS,
  MONTH_LABELS,
  REAP_COMMERCIALIZATION_STATE_OPTIONS,
  REAP_STATE_OPTIONS,
  WORK_RELATION_OPTIONS,
} from "./constants";
import { getMunicipiosByUf } from "./helpers";

const ALPHABETICAL_STATE_OPTIONS = [...REAP_STATE_OPTIONS].sort((a, b) =>
  a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
);
const ALPHABETICAL_COMMERCIALIZATION_OPTIONS = [...REAP_COMMERCIALIZATION_STATE_OPTIONS].sort((a, b) =>
  a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
);

type SearchableOption = { value: number; label: string; disabled?: boolean };

function SearchableSelect({
  id,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  value?: number;
  options: SearchableOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value?: number) => void;
}) {
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected?.label, value]);

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
  );
  const visibleOptions = filtered.slice(0, 100);

  return (
    <div
      className="searchable-select"
      onBlur={() => window.setTimeout(() => setOpen(false), 120)}
    >
      <div className={`searchable-select-control${open ? " is-open" : ""}`}>
        <input
          id={id}
          className="searchable-select-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            if (!nextQuery) onChange(undefined);
          }}
        />
        <button
          type="button"
          className="searchable-select-trigger"
          aria-label={open ? "Ocultar opções" : "Exibir opções"}
          aria-controls={`${id}-listbox`}
          aria-expanded={open}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true" />
        </button>
      </div>
      {open && !disabled && (
        <div id={`${id}-listbox`} className="searchable-select-menu" role="listbox">
          {visibleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="searchable-select-option"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(option.label);
                setOpen(false);
                onChange(option.value);
              }}
            >
              {option.label}{option.disabled ? " (indisponível)" : ""}
            </button>
          ))}
          {visibleOptions.length === 0 && <span className="searchable-select-empty">Nenhum resultado.</span>}
          {filtered.length > visibleOptions.length && (
            <span className="searchable-select-empty">Digite para refinar a busca.</span>
          )}
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  selectedMonths,
  onToggle,
}: {
  selectedMonths: number[];
  onToggle: (month: number) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "5px" }}>
      {MONTH_LABELS.map((label, index) => {
        const month = index + 1;
        const isSelected = selectedMonths.includes(month);
        return (
          <button
            key={month}
            type="button"
            onClick={() => onToggle(month)}
            style={{
              border: isSelected ? "1px solid var(--color-accent-strong)" : "1px solid var(--color-border)",
              background: isSelected ? "var(--color-accent)" : "var(--color-surface-alt)",
              color: isSelected ? "#ffffff" : "var(--color-text)",
              borderRadius: "6px",
              padding: "9px 4px",
              fontSize: "10px",
              fontFamily: "var(--mono)",
              fontWeight: 600,
              letterSpacing: "0.06em",
              cursor: "pointer",
              transition: "all 0.12s",
            }}
          >
            {label.slice(0, 3).toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export function ReapPage1Section({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}) {
  const residenceUf = settings.mpaResidenceUF;
  const residenceMunicipios = getMunicipiosByUf(residenceUf);

  return (
    <section className="section reap-intro-section" style={{ border: "none" }}>
      <div className="section-header">
        <span className="section-num">01</span>
        <div>
          <h2 className="section-title">Identificação</h2>
          <p className="section-description">Ano de referência, estado e município de residência.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="form-group">
          <label className="reap-label" htmlFor="mpaReferenceYear">Ano de referência</label>
          <select
            id="mpaReferenceYear"
            className="gps-select"
            value={settings.mpaReferenceYear || ""}
            onChange={(e) => onUpdate({ mpaReferenceYear: e.target.value })}
          >
            <option value="">Selecione...</option>
            {Array.from({ length: Math.max(new Date().getFullYear() - 2025 + 1, 1) }, (_, index) => {
              const year = String(2025 + index);
              return <option key={year} value={year}>{year}</option>;
            })}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group">
            <label className="reap-label" htmlFor="mpaResidenceUF">Estado</label>
            <SearchableSelect
              id="mpaResidenceUF"
              value={residenceUf}
              options={ALPHABETICAL_STATE_OPTIONS}
              placeholder="Selecione o estado"
              onChange={(value) => onUpdate({ mpaResidenceUF: value, mpaResidenceMunicipio: undefined })}
            />
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaResidenceMunicipio">Município</label>
            <SearchableSelect
              id="mpaResidenceMunicipio"
              value={settings.mpaResidenceMunicipio}
              options={residenceMunicipios.map((municipio) => ({ value: municipio.id, label: municipio.nome }))}
              placeholder={residenceUf ? "Pesquisar município" : "Selecione o estado primeiro"}
              disabled={!residenceUf}
              onChange={(value) => onUpdate({ mpaResidenceMunicipio: value })}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReapPage2Section({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}) {
  const commercializationState = settings.mpaCommercializationStates?.[0];

  return (
    <section className="section reap-intro-section" style={{ border: "none" }}>
      <div className="section-header">
        <span className="section-num">02</span>
        <div>
          <h2 className="section-title">Atividade</h2>
          <p className="section-description">Relação de trabalho e estados de comercialização.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="form-group">
          <label className="reap-label" htmlFor="mpaWorkRelation">Relação de trabalho</label>
          <select
            id="mpaWorkRelation"
            className="gps-select"
            value={settings.mpaWorkRelation || ""}
            onChange={(e) => onUpdate({ mpaWorkRelation: e.target.value })}
          >
            <option value="">Selecione...</option>
            {WORK_RELATION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="reap-label">Estados de comercialização</label>
          <SearchableSelect
            id="mpaCommercializationState"
            value={commercializationState}
            options={ALPHABETICAL_COMMERCIALIZATION_OPTIONS}
            placeholder="Pesquisar estado"
            onChange={(value) => onUpdate({
              mpaCommercializationStates: value === undefined ? [] : [value],
            })}
          />
        </div>
      </div>
    </section>
  );
}

export function ReapPage3Section({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}) {
  const fishingUf = settings.mpaUF;
  const fishingMunicipios = getMunicipiosByUf(fishingUf);
  const defesoMonths = settings.mpaDefesoMonths ?? [];

  const toggleDefesoMonth = (month: number) => {
    const next = defesoMonths.includes(month)
      ? defesoMonths.filter((item) => item !== month)
      : [...defesoMonths, month].sort((a, b) => a - b);
    onUpdate({ mpaDefesoMonths: next });
  };

  return (
    <section className="section">
      <div className="section-header">
        <span className="section-num">03</span>
        <div>
          <h2 className="section-title">Locais de Pesca</h2>
          <p className="section-description">Defeso, método, área e município de captura.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "14px" }}>
        <div className="form-group">
          <label className="reap-label">Meses de defeso</label>
          <MonthGrid selectedMonths={defesoMonths} onToggle={toggleDefesoMonth} />
          {defesoMonths.length === 0 && (
            <p className="reap-note">Selecione ao menos um mês.</p>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group">
            <label className="reap-label" htmlFor="mpaLocalPesca">Local</label>
            <SearchableSelect
              id="mpaLocalPesca"
              value={settings.mpaLocalPesca}
              options={FISHING_LOCATION_OPTIONS}
              placeholder="Selecione..."
              onChange={(value) => onUpdate({ mpaLocalPesca: value })}
            />
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaMetodoPesca">Petrecho</label>
            <SearchableSelect
              id="mpaMetodoPesca"
              value={settings.mpaMetodoPesca ?? settings.mpaPetrecho}
              options={APETRECHOS_OPTIONS}
              placeholder="Selecione..."
              onChange={(value) => onUpdate({ mpaMetodoPesca: value })}
            />
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaUF">UF</label>
            <SearchableSelect
              id="mpaUF"
              value={fishingUf}
              options={ALPHABETICAL_STATE_OPTIONS}
              placeholder="Selecione..."
              onChange={(value) => onUpdate({ mpaUF: value, mpaMunicipio: undefined })}
            />
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaMunicipio">Município</label>
            <SearchableSelect
              id="mpaMunicipio"
              value={settings.mpaMunicipio}
              options={fishingMunicipios.map((municipio) => ({ value: municipio.id, label: municipio.nome }))}
              placeholder={fishingUf ? "Pesquisar município" : "Selecione o estado primeiro"}
              disabled={!fishingUf}
              onChange={(value) => onUpdate({ mpaMunicipio: value })}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
