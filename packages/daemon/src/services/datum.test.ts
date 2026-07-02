import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatumService } from './datum.js';

function mockFetch(impl: () => unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.stubGlobal('fetch', vi.fn(impl as any));
}

const umbrelService = () =>
  new DatumService({
    apiUrl: 'http://umbrel:21000',
    timeoutMs: 1000,
    now: () => 1000,
    log: () => {},
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DatumService', () => {
  it('polls Umbrel JSON stats from /umbrel-api', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'three-stats',
            items: [
              { title: 'Connections', text: '3', subtext: 'Worker' },
              { title: 'Hashrate', text: '1.25', subtext: 'Ph/s' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new DatumService({ apiUrl: 'http://datum.local:7152' });
    const result = await service.poll();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://datum.local:7152/umbrel-api',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toMatchObject({
      reachable: true,
      connections: 3,
      hashrate_ph: 1.25,
      error: null,
    });
  });

  it('falls back to parsing StartOS Datum dashboard HTML when /umbrel-api is absent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<H1>Not found</H1>', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          `
            <html>
              <body>
                <table>
                  <tr><th>Total Work Subscriptions</th></tr>
                  <tr><td>7</td></tr>
                  <tr><th>Estimated Hashrate:</th></tr>
                  <tr><td>1234.50 Th/sec</td></tr>
                </table>
              </body>
            </html>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const service = new DatumService({ apiUrl: 'http://datum.startos:7152' });
    const result = await service.poll();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://datum.startos:7152/umbrel-api',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://datum.startos:7152/',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toMatchObject({
      reachable: true,
      connections: 7,
      hashrate_ph: 1.2345,
      error: null,
    });
  });
});

describe('DatumService.poll error hints (#310)', () => {
  it('parses the happy-path three-stats JSON', async () => {
    mockFetch(() => ({
      type: 'basic',
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          items: [
            { title: 'Connections', text: '3' },
            { title: 'Hashrate', text: '2.50', subtext: 'Ph/s' },
          ],
        }),
    }));
    const r = await umbrelService().poll();
    expect(r.reachable).toBe(true);
    expect(r.connections).toBe(3);
    expect(r.error).toBeNull();
  });

  it('flags an auth-proxy redirect (opaqueredirect) and points at the doc', async () => {
    mockFetch(() => ({ type: 'opaqueredirect', status: 0, ok: false, text: async () => '' }));
    const r = await umbrelService().poll();
    expect(r.reachable).toBe(false);
    expect(r.error).toMatch(/auth proxy/i);
    expect(r.error).toMatch(/setup-datum-api/);
  });

  it('flags an HTML login page returned with 200', async () => {
    mockFetch(() => ({
      type: 'basic',
      status: 200,
      ok: true,
      text: async () => '<!doctype html><html>login</html>',
    }));
    const r = await umbrelService().poll();
    expect(r.reachable).toBe(false);
    expect(r.error).toMatch(/HTML/i);
    expect(r.error).toMatch(/setup-datum-api/);
  });

  it('rewrites a bare "fetch failed" into a connection-refused hint with the URL', async () => {
    mockFetch(() => {
      throw new Error('fetch failed');
    });
    const r = await umbrelService().poll();
    expect(r.reachable).toBe(false);
    expect(r.error).toMatch(/connection refused/i);
    expect(r.error).toMatch(/http:\/\/umbrel:21000/);
    expect(r.error).toMatch(/setup-datum-api/);
  });
});
