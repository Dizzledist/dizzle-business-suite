import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { isLocalFixtureEnabled, isSalesCrmEnabled } from './shared/sales-crm.ts';
import { isSalesAuthEnabled } from './shared/sales-auth.ts';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    'import.meta.env.SALES_CRM_ENABLED': JSON.stringify(command === 'serve' && isSalesCrmEnabled(process.env)),
    'import.meta.env.SALES_CRM_AUTH_ENABLED': JSON.stringify(command === 'serve' && isSalesAuthEnabled(process.env)),
    'import.meta.env.DIZZLE_LOCAL_FIXTURES': JSON.stringify(command === 'serve' && isLocalFixtureEnabled(process.env)),
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3001' },
    fs: {
      // Keep Vite's default exclusions when adding the private reporting directory.
      deny: [
        '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/.sales-reporting-demo/**', '**/.sales-auth-private/**',
      ],
    },
  },
}));
