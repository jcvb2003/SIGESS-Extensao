import React, { useState } from "react";
import { AppSettings } from "../../shared/types";
interface ReapAgroPanelProps {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void;
  isOpen: boolean;
  onToggle: () => void;
}
const ReapAgroPanel: React.FC<ReapAgroPanelProps> = ({
  settings,
  onUpdate,
  isOpen,
  onToggle,
}) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) =>
    String(currentYear - 3 + i),
  );
  const [activeYear, setActiveYear] = useState(years.at(-1) || years[0]);
  const handleDataChange = (year: string, data: string) => {
    const newData = { ...settings.reapData, [year]: data };
    onUpdate({ reapData: newData });
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
          <h2 className="section-title">REAP AGRO</h2>
          <p className="section-description">
            Preenchimento automático para setor Agro
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
                    value={settings.reapData?.[year] || ""}
                    onChange={(e) => handleDataChange(year, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
export default ReapAgroPanel;
