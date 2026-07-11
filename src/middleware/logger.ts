import { logger } from 'hono/logger';
import { log } from '../log.js';

/**
 * Hono built-in request logger, routed through our level-gated helper.
 * Skips GET /health at info so probes don’t drown real traffic.
 */
function print(message: string, ...rest: string[]): void {
  const line = rest.length ? `${message} ${rest.join(' ')}` : message;
  // Hono lines look like: `<-- GET /health` or `--> GET /health 200 1ms`
  if (/\bGET\s+\/health(?:\?|\s|$)/.test(line)) {
    log.debug('http', { line });
    return;
  }
  log.info('http', { line });
}

export const requestLogger = logger(print);
