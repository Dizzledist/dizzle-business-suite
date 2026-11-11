import { createApi } from '../../server/api';
import { localPorts } from '../../shared/local-ports';
import { TestImageGenerator } from '../fixtures/image-generator';
const server = createApi(undefined, { generator: new TestImageGenerator() });
server.listen(localPorts(process.env).api, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
