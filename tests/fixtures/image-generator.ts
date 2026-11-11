import sharp from 'sharp';
import type { ImageGenerator, ImageRequest } from '../../server/image-generation';

// Imported by isolated test servers only. Runtime never selects this via an env flag.
export class TestImageGenerator implements ImageGenerator {
  readonly mode = 'test' as const;
  readonly model = 'isolated-raster-test';
  readonly quality = 'low';
  readonly ready = true;
  readonly message = 'Isolated PNG test adapter. No OpenAI calls or charges.';
  calls: ImageRequest[] = [];
  async generate(input: ImageRequest) {
    this.calls.push(input);
    const body = await sharp({ create: { width: input.width, height: input.height, channels: 3, background: '#892c3b' } }).png().toBuffer();
    return { body, width: input.width, height: input.height, providerSize: `${input.width}x${input.height}`, requestId: 'test-request', usage: null };
  }
}
