import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localPorts } from './shared/local-ports';
const ports = localPorts(process.env);

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: ports.web, strictPort: true, proxy: { '/api': `http://127.0.0.1:${ports.api}` } },
});
