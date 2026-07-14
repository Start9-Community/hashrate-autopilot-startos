import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerSecurityRoutes, type SecurityRouteDeps } from './security.js';
import { hashPassword } from '../../config/password-hash.js';

// Mock the Braiins client so token validation doesn't hit the network:
// "GOOD" authenticates, anything else is rejected.
vi.mock('@hashrate-autopilot/braiins-client', () => ({
  createBraiinsClient: (cfg: { ownerToken?: string; readOnlyToken?: string }) => ({
    getBalance: async () => {
      const tok = cfg.ownerToken ?? cfg.readOnlyToken;
      if (tok === 'GOOD') return { available_sat: 0 };
      throw new Error('grpc: unauthenticated');
    },
  }),
}));

const CURRENT = 'current-pw-123';

function build(source: 'env' | 'sops' | 'db') {
  const applied: string[] = [];
  const setBraiinsToken = vi.fn(async () => true);
  const setDashboardPassword = vi.fn(async (_pw: string) => hashPassword('irrelevant'));
  const deps: SecurityRouteDeps = {
    secretsRepo: { setDashboardPassword, setBraiinsToken } as never,
    secretSource: source,
    getCurrentPassword: () => hashPassword(CURRENT),
    setDashboardPassword: (h) => applied.push(h),
  };
  const app: FastifyInstance = Fastify();
  return { app, deps, applied, setBraiinsToken, setDashboardPassword };
}

describe('security routes (#332)', () => {
  let app: FastifyInstance;
  afterEach(async () => { await app?.close(); });

  it('reports editable=true for a db source', async () => {
    const h = build('db'); app = h.app;
    await registerSecurityRoutes(app, h.deps); await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/security/state' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ secret_source: 'db', editable: true });
  });

  it('reports editable=false and refuses edits for env/SOPS', async () => {
    const h = build('env'); app = h.app;
    await registerSecurityRoutes(app, h.deps); await app.ready();
    expect((await app.inject({ method: 'GET', url: '/api/security/state' })).json().editable).toBe(false);
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      payload: { current_password: CURRENT, new_password: 'longenough1' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('managed_externally');
  });

  it('rejects a wrong current password (403)', async () => {
    const h = build('db'); app = h.app;
    await registerSecurityRoutes(app, h.deps); await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      payload: { current_password: 'wrong', new_password: 'longenough1' },
    });
    expect(res.statusCode).toBe(403);
    expect(h.applied).toHaveLength(0);
  });

  it('rejects a too-short new password (422)', async () => {
    const h = build('db'); app = h.app;
    await registerSecurityRoutes(app, h.deps); await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      payload: { current_password: CURRENT, new_password: 'short' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('changes the password and hot-applies the new hash', async () => {
    const h = build('db'); app = h.app;
    await registerSecurityRoutes(app, h.deps); await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      payload: { current_password: CURRENT, new_password: 'a-good-new-password' },
    });
    expect(res.statusCode).toBe(200);
    expect(h.setDashboardPassword).toHaveBeenCalledOnce();
    // The hash returned by the repo is what got hot-applied to the verifier.
    expect(h.applied).toHaveLength(1);
    expect(h.applied[0]!.startsWith('scrypt$')).toBe(true);
  });

  it('rotates a valid Braiins token (validated against Braiins), applies on restart', async () => {
    const h = build('db'); app = h.app;
    await registerSecurityRoutes(app, h.deps); await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/api/security/braiins-token',
      payload: { kind: 'owner', current_password: CURRENT, token: 'GOOD' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, applies_on_restart: true });
    expect(h.setBraiinsToken).toHaveBeenCalledWith('owner', 'GOOD');
  });

  it('refuses a Braiins token that fails validation (422), stores nothing', async () => {
    const h = build('db'); app = h.app;
    await registerSecurityRoutes(app, h.deps); await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/api/security/braiins-token',
      payload: { kind: 'owner', current_password: CURRENT, token: 'TYPO' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('Braiins rejected this token');
    expect(h.setBraiinsToken).not.toHaveBeenCalled();
  });
});
