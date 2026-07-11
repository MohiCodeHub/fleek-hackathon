import type { ImageContent } from '@earendil-works/pi-ai';
import { resizeImage } from '@earendil-works/pi-coding-agent';
import { log } from './log.js';

/** Skip / shrink images larger than this before sending to the model. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

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

/** True for IPv4 private / link-local / loopback ranges. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
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
 * Allow only HTTPS image URLs on Wassist (and common CDN) hosts.
 * Rejects private IPs and arbitrary hosts (SSRF guard).
 */
export function isAllowedImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '::1' || host.startsWith('[') || isPrivateIpv4(host)) return false;

  return (
    host === 'wassist.app' ||
    host.endsWith('.wassist.app') ||
    host.endsWith('.amazonaws.com') ||
    host.endsWith('.cloudfront.net') ||
    host.endsWith('.googleusercontent.com')
  );
}

/**
 * Download a Wassist-hosted (or allowlisted CDN) image URL into a Pi `ImageContent`
 * (base64 + mime). Returns null on fetch/size/SSRF failure so the turn can continue.
 */
export async function fetchImageContent(url: string): Promise<ImageContent | null> {
  if (!isHttpUrl(url)) {
    log.debug('media.skip', { reason: 'invalid_url', preview: url.slice(0, 40) });
    return null;
  }

  const host = hostOf(url);
  if (!isAllowedImageUrl(url)) {
    log.warn('media.ssrf_blocked', { host });
    return null;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
