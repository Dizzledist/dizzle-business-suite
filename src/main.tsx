import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './sales-crm/styles.css';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && import.meta.env.DIZZLE_LOCAL_FIXTURES === true) {
  void import('./LocalApplication').then(({ LocalApplication }) => {
    root.render(<React.StrictMode><LocalApplication /></React.StrictMode>);
  });
} else {
  root.render(<main className="sales-crm-notice"><h1>Dizzle Business Suite</h1><p>Company access is pending setup.</p></main>);
}
