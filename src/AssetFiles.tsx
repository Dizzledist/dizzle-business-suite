import { useEffect, useState } from 'react';

export function ProtectedDocument({ path, identity }: { path: string; identity: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setText(''); setError('');
    fetch('/api' + path, { headers: { 'X-Demo-Identity': identity } }).then(async response => {
      if (!response.ok) throw new Error('Document preview unavailable.');
      return response.text();
    }).then(value => { if (active) setText(value); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [identity, path]);
  return <details className="document-preview"><summary>Preview document</summary>{error ? <p role="alert">{error}</p> : text ? <pre>{text}</pre> : <p role="status">Loading preview?</p>}</details>;
}

export function ProtectedImage({ path, identity, title }: { path: string; identity: string; title: string }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    setSource('');
    let active = true; let objectUrl = '';
    fetch(`/api${path}`, { headers: { 'X-Demo-Identity': identity } }).then(response => {
      if (!response.ok) throw new Error('Preview unavailable.'); return response.blob();
    }).then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setSource(objectUrl); else URL.revokeObjectURL(objectUrl); }).catch(() => { if (active) setSource(''); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, identity]);
  return source ? <img className="asset-preview" src={source} alt={title}/> : <span className="preview-placeholder" role="status">Preview unavailable</span>;
}

export function DownloadButton({ path, identity, fileName, onError }: { path: string; identity: string; fileName: string; onError: (message: string) => void }) {
  return <button className="download-button" title={`Download ${fileName}`} aria-label={`Download ${fileName}`} onClick={async () => {
    onError('');
    try {
      const response = await fetch(`/api${path}`, { headers: { 'X-Demo-Identity': identity } });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Download denied.');
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Download failed.'); }
  }}>↓</button>;
}
