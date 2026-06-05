import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

const FilePicker = () => {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus(`Lendo ${file.name}...`);
    setError('');

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1];
      browser.storage.local
        .set({ sigessReapPdfCache: { b64, filename: file.name } })
        .then(() => {
          setStatus(`✅ ${file.name} salvo!`);
          setTimeout(() => window.close(), 800);
        })
        .catch((err: any) => setError(`Erro ao salvar: ${err.message}`));
    };
    reader.onerror = () => setError('Falha ao ler o arquivo.');
    reader.readAsDataURL(file);
  };

  return (
    <div className="card">
      <h2>Documento Comprobatório</h2>
      <p>Selecione o PDF que será anexado automaticamente nos meses sem pesca.</p>
      <label>
        📄 Selecionar PDF
        <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleChange} />
      </label>
      <div className={`status ${error ? 'error' : ''}`}>{error || status}</div>
    </div>
  );
};

const container = document.getElementById('root')!;
createRoot(container).render(<FilePicker />);
