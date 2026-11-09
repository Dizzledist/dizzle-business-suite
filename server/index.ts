import { createApi } from './api';
import { localPorts } from '../shared/local-ports';
const { api } = localPorts(process.env);

if (process.env.NODE_ENV === 'production') throw new Error('Local fixture API cannot run in production mode.');
const server = createApi();
server.listen(api, '127.0.0.1', () => console.log(`Dizzle fixture API: http://127.0.0.1:${api}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
