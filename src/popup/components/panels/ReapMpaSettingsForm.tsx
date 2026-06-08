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
  onOpenFilePicker?: () => void;
}

const ReapMpaSettingsForm: React.FC<ReapMpaSettingsFormProps> = ({
  settings,
  onUpdate,
  onOpenFilePicker,
}) => {
  return (
    <div className="stack" style={{ gap: "16px" }}>
      <ReapPage1Section settings={settings} onUpdate={onUpdate} />
      <ReapPage2Section settings={settings} onUpdate={onUpdate} />
      <ReapPage3Section settings={settings} onUpdate={onUpdate} />
      <ReapSpeciesSection settings={settings} onUpdate={onUpdate} />
      <ReapDocumentSection
        settings={settings}
        onUpdate={onUpdate}
        onOpenFilePicker={onOpenFilePicker}
      />
    </div>
  );
};

export default ReapMpaSettingsForm;
