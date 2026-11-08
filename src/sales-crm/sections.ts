import { salesCrmPath } from '../../shared/sales-crm';

export const sections = [
  { path: salesCrmPath, label: 'Dashboard', icon: '▦' },
  { path: salesCrmPath + '/leads', label: 'Leads', icon: '◎' },
  { path: salesCrmPath + '/customers', label: 'Customers', icon: '◇' },
  { path: salesCrmPath + '/pipeline', label: 'Pipeline', icon: '⇥' },
  { path: salesCrmPath + '/tasks', label: 'Tasks', icon: '✓' },
  { path: salesCrmPath + '/assistant', label: 'AI Assistant', icon: '✧' },
  { path: salesCrmPath + '/reports', label: 'Reports', icon: '▤' },
  { path: salesCrmPath + '/field-sales', label: 'Field Sales', icon: '⌖' },
  { path: salesCrmPath + '/settings', label: 'Settings', icon: '⚙' },
];
