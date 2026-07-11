import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchImageContent, isAllowedImageUrl } from '../src/media.js';

describe('isAllowedImageUrl', () => {
  it('allows https wassist hosts', () => {
    expect(isAllowedImageUrl('https://media.wassist.app/x.jpg')).toBe(true);
    expect(isAllowedImageUrl('https://wassist.app/x.jpg')).toBe(true);
  });
  it('rejects http, private IPs, and unknown hosts', () => {
    expect(isAllowedImageUrl('http://media.wassist.app/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://127.0.0.1/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://192.168.1.1/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://evil.example/x.jpg')).toBe(false);
  });
});

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

  it('does not fetch blocked SSRF hosts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchImageContent('https://169.254.169.254/latest/meta-data')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips unsubstituted %IMAGE_URL% without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchImageContent('%IMAGE_URL%')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
