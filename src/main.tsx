import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { salesCrmPath } from '../shared/sales-crm';
import { salesCrmDevEnabled } from './sales-crm/access';
import './styles.css';
import './sales-crm/styles.css';

const SalesCrm = salesCrmDevEnabled ? React.lazy(() => import('./sales-crm/SalesCrm')) : undefined;
const path = window.location.pathname;
const isSalesCrmPath = path === salesCrmPath || path.startsWith(salesCrmPath + '/');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {SalesCrm && isSalesCrmPath ? (
      <React.Suspense fallback={<div className="sales-crm-notice" role="status">Loading workspace…</div>}>
        <SalesCrm />
      </React.Suspense>
    ) : <App />}
  </React.StrictMode>,
);
