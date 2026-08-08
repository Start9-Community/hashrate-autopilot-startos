/**
 * #358: the daemon used to register CORS as `origin: true, credentials:
 * true`, which reflects ANY origin back in Access-Control-Allow-Origin
 * and tells browsers that any website may make credentialed calls here
 * and read the replies. Browsers attach cached HTTP-auth credentials to
 * cross-origin fetches, so an operator with a live dashboard session
 * could have authenticated endpoints driven from another tab - most
 * usefully POST /api/electrs/test, which connects to an arbitrary
 * host:port and so scans the daemon's network.
 *
 * These tests pin the replacement policy: reflect the origin only when
 * it matches the Host the request arrived on, never otherwise, and leave
 * origin-less (non-browser) callers alone.
 */
import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sameOriginCorsDelegator } from './server.js';

const HOST = 'autopilot.local:3010';

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  await app.register(fastifyCors, sameOriginCorsDelegator);
  app.get('/api/status', async () => ({ ok: true }));
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('daemon CORS policy (#358)', () => {
  it('reflects an Origin that matches the Host the request arrived on', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: HOST, origin: `http://${HOST}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(`http://${HOST}`);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sends no allow-origin for a foreign site, so it cannot read the reply', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: HOST, origin: 'https://evil.example' },
    });

    // The handler still runs - CORS is enforced in the browser, not here -
    // but without the header the calling page is denied the response body.
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not grant a cross-origin preflight', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/electrs/test',
      headers: {
        host: HOST,
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('grants a same-origin preflight', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/electrs/test',
      headers: {
        host: HOST,
        origin: `http://${HOST}`,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(res.headers['access-control-allow-origin']).toBe(`http://${HOST}`);
  });

  it('leaves origin-less callers (curl, scripts, monitoring) working', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: HOST },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('treats a same-host origin on a different port as cross-origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: HOST, origin: 'http://autopilot.local:9999' },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not fall over on a malformed Origin header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: HOST, origin: 'not a url' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
