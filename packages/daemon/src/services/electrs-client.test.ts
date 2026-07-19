import { createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { createElectrsClient } from './electrs-client.js';

/**
 * Minimal mock Electrum server driven by a per-line responder. Each JSON
 * line the client sends is parsed and handed to `onLine`, which writes
 * whatever response (or drops the socket) the test needs.
 */
function startMockElectrum(
  onLine: (socket: Socket, msg: { id: number; method: string; params: unknown[] }) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      // The mock destroys client sockets on purpose; swallow the
      // resulting ECONNRESET so the mock itself never throws.
      socket.on('error', () => {});
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          try {
            onLine(socket, JSON.parse(line));
          } catch {
            /* ignore malformed */
          }
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('bad server address');
      resolve({
        port: addr.port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

const ADDR = 'bc1qux2aehp5ny89l9spguf052x84zm8h9uyfqvgdg';

describe('createElectrsClient', () => {
  let stop: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await stop?.();
    stop = null;
  });

  it('completes the handshake and answers a balance query', async () => {
    const srv = await startMockElectrum((socket, msg) => {
      if (msg.method === 'server.version') {
        socket.write(JSON.stringify({ id: msg.id, result: ['MockElectrum', '1.4'] }) + '\n');
      } else if (msg.method === 'blockchain.scripthash.get_balance') {
        socket.write(
          JSON.stringify({ id: msg.id, result: { confirmed: 12345, unconfirmed: 6 } }) + '\n',
        );
      }
    });
    stop = srv.close;

    const client = await createElectrsClient({ host: '127.0.0.1', port: srv.port });
    const balance = await client.getBalance(ADDR);
    expect(balance).toEqual({ confirmed: 12345, unconfirmed: 6 });
    client.close();
  });

  it('rejects, never crashes, when the server drops the connection mid-session', async () => {
    // Handshake succeeds, then the server drops the socket right after
    // flushing the reply - modelling electrs restarting or dropping an
    // idle connection. The next call must reject via the socket's
    // persistent error handler; before the fix the write hit a dead pipe
    // with no listener and escalated to an uncaughtException ("write
    // EPIPE") that took the whole daemon down (and would crash this
    // vitest worker instead of failing the assertion).
    const srv = await startMockElectrum((socket, msg) => {
      if (msg.method === 'server.version') {
        socket.write(
          JSON.stringify({ id: msg.id, result: ['MockElectrum', '1.4'] }) + '\n',
          // Destroy only after the handshake bytes are flushed, so the
          // client resolves connect and the drop lands mid-session.
          () => socket.destroy(),
        );
      }
    });
    stop = srv.close;

    const client = await createElectrsClient({ host: '127.0.0.1', port: srv.port, timeoutMs: 1000 });
    await expect(client.getBalance(ADDR)).rejects.toThrow(/Electrs/);
    client.close();
  });
});
