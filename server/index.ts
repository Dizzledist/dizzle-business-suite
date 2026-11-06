import { createApi } from './api';

if (process.env.NODE_ENV === 'production') throw new Error('Local fixture API cannot run in production mode.');
const server = createApi();
server.listen(3001, '127.0.0.1', () => console.log('Dizzle fixture API: http://127.0.0.1:3001'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
