import React from "react";
import { AppSettings } from "../../../shared/types";
import { ChevronIcon } from "../ui/icons";

interface ReapMpaPanelProps {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const ReapMpaPanel: React.FC<ReapMpaPanelProps> = ({
  isOpen,
  onToggle,
}) => {
  const openSettingsPage = () => {
    browser.tabs.create({ url: browser.runtime.getURL("reap_mpa_settings.html") });
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
          <p className="section-description">Configurações de automação do formulário.</p>
        </div>
        <ChevronIcon isOpen={isOpen} />
      </button>

      <div className={`accordion-content ${isOpen ? "open" : "collapsed"}`}>
        <div className="section-content">
          <button type="button" className="btn btn-primary btn-full" onClick={openSettingsPage}>
            Configurações do REAP
          </button>
        </div>
      </div>
    </section>
  );
};

export default ReapMpaPanel;
