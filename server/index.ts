import { createApi } from './api';

if (process.env.NODE_ENV === 'production') throw new Error('Local fixture API cannot run in production mode.');
const server = createApi();
const port = Number(process.env.LOCAL_API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local API port.');
server.listen(port, '127.0.0.1', () => console.log(`Dizzle fixture API: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
