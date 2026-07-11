import type { ImageContent } from '@earendil-works/pi-ai';
import { resizeImage } from '@earendil-works/pi-coding-agent';
import { log } from './log.js';

/** Skip / shrink images larger than this before sending to the model. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid';
  }
}

function mimeFromContentType(header: string | null): string {
  const raw = header?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (raw.startsWith('image/')) return raw;
  return 'image/jpeg';
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Download a Wassist-hosted (or other) image URL into a Pi `ImageContent`
 * (base64 + mime). Returns null on fetch/size failure so the turn can continue.
 */
export async function fetchImageContent(url: string): Promise<ImageContent | null> {
  if (!isHttpUrl(url)) {
    log.debug('media.skip', { reason: 'invalid_url', preview: url.slice(0, 40) });
    return null;
  }

  const host = hostOf(url);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warn('media.fetch_fail', { host, status: res.status });
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    let mimeType = mimeFromContentType(res.headers.get('content-type'));
    let data = buf.toString('base64');

    if (buf.byteLength > MAX_IMAGE_BYTES) {
      const resized = await resizeImage(new Uint8Array(buf), mimeType, {
        maxBytes: MAX_IMAGE_BYTES,
      });
      if (!resized) {
        log.warn('media.too_large', { host, bytes: buf.byteLength });
        return null;
      }
      data = resized.data;
      mimeType = resized.mimeType;
      log.info('media.resized', { host, fromBytes: buf.byteLength, mimeType });
    }

    log.info('media.fetch_ok', { host, bytes: buf.byteLength, mimeType });
    return { type: 'image', data, mimeType };
  } catch (e) {
    log.warn('media.fetch_error', {
      host,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
