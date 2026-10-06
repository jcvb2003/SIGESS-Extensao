import React from "react";
import { AppSettings } from "../../../shared/types";
import { ReapDocumentSection } from "./reap-mpa-settings/DocumentSection";
import {
  ReapPage1Section,
  ReapPage2Section,
  ReapPage3Section,
} from "./reap-mpa-settings/PageSections";
import { ReapSpeciesSection } from "./reap-mpa-settings/SpeciesSection";

interface ReapMpaSettingsFormProps {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
  presetId?: string;
}

const ReapMpaSettingsForm: React.FC<ReapMpaSettingsFormProps> = ({
  settings,
  onUpdate,
  presetId,
}) => {
  return (
    <div className="stack" style={{ gap: "16px" }}>
      <div className="reap-intro-grid">
        <ReapPage1Section settings={settings} onUpdate={onUpdate} />
        <ReapPage2Section settings={settings} onUpdate={onUpdate} />
      </div>
      <ReapPage3Section settings={settings} onUpdate={onUpdate} />
      <ReapSpeciesSection settings={settings} onUpdate={onUpdate} />
      <ReapDocumentSection
        settings={settings}
        onUpdate={onUpdate}
        presetId={presetId}
      />
    </div>
  );
};

export default ReapMpaSettingsForm;
