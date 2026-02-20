import React, { useState } from 'react';
import { AppSettings } from '../../shared/types';

interface ReapPanelProps {
    settings: AppSettings;
    onUpdate: (reapData: Record<string, string>) => void;
}

const ReapPanel: React.FC<ReapPanelProps> = ({ settings, onUpdate }) => {
    const [activeYear, setActiveYear] = useState('2021');
    const years = ['2021', '2022', '2023', '2024'];

    const handleDataChange = (year: string, data: string) => {
        const newData = { ...settings.reapData, [year]: data };
        onUpdate(newData);
    };

    return (
        <section className="section">
            <div className="section-header">
                <h2 className="section-title">REAP</h2>
                <p className="section-description">Configurações para preenchimento automático do REAP</p>
            </div>
            <div className="section-content">
                <div className="reap-tabs-container">
                    <div className="reap-tabs-header">
                        {years.map(year => (
                            <button
                                key={year}
                                className={`reap-tab ${activeYear === year ? 'active' : ''}`}
                                onClick={() => setActiveYear(year)}
                            >
                                {year}
                            </button>
                        ))}
                    </div>

                    <div className="reap-tab-content">
                        {years.map(year => (
                            <div key={year} className={`reap-tab-panel ${activeYear === year ? 'active' : 'hidden'}`}>
                                <label className="reap-label">Dados para {year}:</label>
                                <textarea
                                    className="reap-textarea"
                                    placeholder="Cole aqui os dados do Excel (Quantidade e Preço separados por TAB)"
                                    value={settings.reapData[year] || ''}
                                    onChange={(e) => handleDataChange(year, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ReapPanel;
