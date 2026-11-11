import sharp from 'sharp';

export interface ImageRequest {
  prompt: string; width: number; height: number; requestKey: string;
  references: { body: Buffer; mimeType: string }[];
}
export interface GeneratedImage {
  body: Buffer; width: number; height: number; providerSize: string;
  requestId: string | null; usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
}
export interface ImageGenerator {
  readonly mode: 'openai' | 'test';
  readonly model: string;
  readonly quality: string;
  readonly ready: boolean;
  readonly message: string;
  generate(input: ImageRequest): Promise<GeneratedImage>;
}
export class ImageGenerationError extends Error {
  constructor(message: string, public retryable = false, public outcomeUnknown = false) { super(message); }
}

const models = ['gpt-image-1.5', 'gpt-image-2', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2.6-sunburst', 'gpt-image-2.6-flare'];
export class OpenAIImageGenerator implements ImageGenerator {
  readonly mode = 'openai' as const;
  readonly model: string;
  readonly quality: string;
  readonly ready: boolean;
  readonly message: string;
  private readonly apiKey: string;
  constructor(env: Record<string, string | undefined> = process.env, private transport: typeof fetch = fetch) {
    this.apiKey = env.OPENAI_API_KEY?.trim() ?? '';
    this.model = env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2.6-sunburst';
    this.quality = env.OPENAI_IMAGE_QUALITY?.trim() || 'medium';
    const valid = models.includes(this.model) && ['low', 'medium', 'high'].includes(this.quality);
    this.ready = !!this.apiKey && valid;
    this.message = !this.apiKey ? 'Add OPENAI_API_KEY to the local .env file and restart the API to enable image generation.'
      : !valid ? 'Check OPENAI_IMAGE_MODEL and OPENAI_IMAGE_QUALITY in the server configuration.' : 'OpenAI is configured. Model access and billing are verified when you generate. Each generation or retry may incur API charges.';
  }
  async generate(input: ImageRequest): Promise<GeneratedImage> {
    if (!this.ready) throw new ImageGenerationError(this.message);
    // Standard API sizes work across the supported model choices. Preserve the
    // complete image when fitting it to the requested export size (no cropping).
    const size = input.width === input.height ? '1024x1024' : input.width > input.height ? '1536x1024' : '1024x1536';
    const prompt = `${input.prompt}\n\nCreate campaign artwork for a ${input.width} by ${input.height} export. Keep important details inside the frame. References guide appearance; preserve product details as closely as possible.`;
    const fields = { model: this.model, prompt, n: 1, quality: this.quality, size, output_format: 'png' };
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, 'X-Client-Request-Id': input.requestKey };
    let body: string | FormData;
    if (input.references.length) {
      body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(key, String(value));
      for (const [index, reference] of input.references.entries()) {
        const png = await sharp(reference.body, { limitInputPixels: 24_000_000 }).rotate().png().toBuffer();
        body.append('image[]', new Blob([new Uint8Array(png)], { type: 'image/png' }), `reference-${index + 1}.png`);
      }
    } else { body = JSON.stringify(fields); headers['Content-Type'] = 'application/json'; }
    let response: Response;
    try {
      response = await this.transport(`https://api.openai.com/v1/images/${input.references.length ? 'edits' : 'generations'}`, {
        method: 'POST', headers, body, signal: AbortSignal.timeout(240_000), redirect: 'error',
      });
    } catch { throw new ImageGenerationError('The OpenAI connection ended without a confirmed result. Check OpenAI usage before starting another image.', false, true); }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) throw new ImageGenerationError('OpenAI rejected the API key. Update the local server key and restart the API.', true);
      if (response.status === 403) throw new ImageGenerationError('This OpenAI project cannot use the selected image model. Check model access and organization verification.', true);
      if (response.status === 429) throw new ImageGenerationError('OpenAI rate or quota limit reached. Check billing and limits before retrying.', true);
      if (response.status >= 500) throw new ImageGenerationError('OpenAI returned a server error. The generation outcome may be unknown; check usage before starting another image.', false, true);
      throw new ImageGenerationError('OpenAI rejected this image request. Check the prompt, references and selected model.');
    }
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing image response');
      const chunks: Uint8Array[] = []; let bytes = 0;
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 32_000_000) { await reader.cancel(); throw new Error('Image response too large'); } chunks.push(chunk.value); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const encoded = result.data?.[0]?.b64_json;
      if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Missing image');
      const original = Buffer.from(encoded, 'base64');
      const metadata = await sharp(original, { limitInputPixels: 24_000_000 }).metadata();
      if (metadata.format !== 'png' || metadata.pages && metadata.pages > 1) throw new Error('Invalid image');
      const image = await sharp(original, { limitInputPixels: 24_000_000 }).resize(input.width, input.height, {
        fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
      }).png().toBuffer();
      const usage = result.usage;
      const requestId = response.headers.get('x-request-id');
      return { body: image, width: input.width, height: input.height, providerSize: `${metadata.width}x${metadata.height}`,
        requestId: requestId && /^[\w-]{1,150}$/.test(requestId) ? requestId : null,
        usage: usage && [usage.input_tokens, usage.output_tokens, usage.total_tokens].every(value => Number.isSafeInteger(value) && value >= 0)
          ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens } : null };
    } catch { throw new ImageGenerationError('OpenAI returned an incomplete or invalid image. Check usage before starting another image.', false, true); }
  }
}
