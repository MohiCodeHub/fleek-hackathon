import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchImageContent } from '../src/media.js';

describe('fetchImageContent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns base64 ImageContent from a successful fetch', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // tiny jpeg-ish
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k === 'content-type' ? 'image/jpeg; charset=binary' : null) },
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    vi.stubGlobal('fetch', fetchMock);

    const img = await fetchImageContent('https://media.wassist.app/sample.jpg');
    expect(img).toEqual({
      type: 'image',
      data: bytes.toString('base64'),
      mimeType: 'image/jpeg',
    });
  });

  it('falls back to image/jpeg when Content-Type is missing', async () => {
    const bytes = Buffer.from('png-bytes');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      }),
    );

    const img = await fetchImageContent('https://media.wassist.app/no-ct');
    expect(img?.mimeType).toBe('image/jpeg');
    expect(img?.data).toBe(bytes.toString('base64'));
  });

  it('returns null when the HTTP fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );
    expect(await fetchImageContent('https://media.wassist.app/missing.png')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await fetchImageContent('https://media.wassist.app/x.png')).toBeNull();
  });
});
