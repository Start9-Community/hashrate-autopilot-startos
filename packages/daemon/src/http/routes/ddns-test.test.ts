/**
 * #339: the DDNS "Test connection" push must send the daemon's detected
 * public IP explicitly (myip= / ip=). Omitting it lets the provider
 * record the source IP of the request - so testing from a VPN'd context
 * writes the VPN exit IP to the hostname. These tests pin the outgoing
 * URL for each provider so that regression can't silently return.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerDdnsTestRoute } from './ddns-test.js';
import type { PublicIpService } from '../../services/public-ip.js';
import type { DdnsUpdaterService } from '../../services/ddns-updater.js';

const DETECTED_IP = '179.24.82.194';

function makeApp(detectedIp: string | null): {
  app: FastifyInstance;
  recorded: unknown[];
  publicIpService: PublicIpService;
  ddnsUpdater: DdnsUpdaterService;
} {
  const recorded: unknown[] = [];
  const publicIpService = {
    getSnapshot: () => ({ ip: detectedIp, checked_at: 1, error: null }),
  } as unknown as PublicIpService;
  const ddnsUpdater = {
    recordExternalPush: (args: unknown) => recorded.push(args),
  } as unknown as DdnsUpdaterService;
  return { app: Fastify(), recorded, publicIpService, ddnsUpdater };
}

let capturedUrl = '';
beforeEach(() => {
  capturedUrl = '';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      capturedUrl = String(url);
      return new Response('good 179.24.82.194\n', { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/ddns/test sends the daemon IP explicitly (#339)', () => {
  it('No-IP push includes myip=<detected public IP>', async () => {
    const h = makeApp(DETECTED_IP);
    await registerDdnsTestRoute(h.app, {
      ddnsUpdater: h.ddnsUpdater,
      publicIpService: h.publicIpService,
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/ddns/test',
      payload: { provider: 'noip', hostname: 'alkimia.zapto.org', username: 'u', credential: 'c' },
    });
    expect(res.statusCode).toBe(200);
    expect(capturedUrl).toContain(`myip=${encodeURIComponent(DETECTED_IP)}`);
    await h.app.close();
  });

  it('DuckDNS push includes ip=<detected public IP>', async () => {
    const h = makeApp(DETECTED_IP);
    await registerDdnsTestRoute(h.app, {
      ddnsUpdater: h.ddnsUpdater,
      publicIpService: h.publicIpService,
    });
    // DuckDNS returns literal "OK".
    vi.mocked(globalThis.fetch).mockImplementation(async (url) => {
      capturedUrl = String(url);
      return new Response('OK', { status: 200 });
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/ddns/test',
      payload: { provider: 'duckdns', hostname: 'alkimia.duckdns.org', credential: 'tok' },
    });
    expect(res.statusCode).toBe(200);
    expect(capturedUrl).toContain(`ip=${encodeURIComponent(DETECTED_IP)}`);
    await h.app.close();
  });

  it('falls back to source-IP inference (no myip) when the public IP is unknown', async () => {
    const h = makeApp(null);
    await registerDdnsTestRoute(h.app, {
      ddnsUpdater: h.ddnsUpdater,
      publicIpService: h.publicIpService,
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/ddns/test',
      payload: { provider: 'noip', hostname: 'alkimia.zapto.org', username: 'u', credential: 'c' },
    });
    expect(res.statusCode).toBe(200);
    expect(capturedUrl).not.toContain('myip=');
    await h.app.close();
  });
});
