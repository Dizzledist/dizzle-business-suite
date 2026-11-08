import React from 'react';
import { salesCrmPath } from '../shared/sales-crm';
import { App } from './App';
import { salesCrmDevEnabled } from './sales-crm/access';

const SalesCrm = salesCrmDevEnabled ? React.lazy(() => import('./sales-crm/SalesCrm')) : undefined;

export function LocalApplication() {
  const path = window.location.pathname;
  const isSalesCrmPath = path === salesCrmPath || path.startsWith(salesCrmPath + '/');
  return SalesCrm && isSalesCrmPath ? (
    <React.Suspense fallback={<div className="sales-crm-notice" role="status">Loading workspace…</div>}>
      <SalesCrm />
    </React.Suspense>
  ) : <App />;
}
