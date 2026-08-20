/**
 * #366: on the BIP110 chain the earnpay API can never sync (Ocean
 * provides no API for that chain), so P&L `collected` must come from
 * the on-chain reward_events ledger instead - and the rebuild /
 * hard-reset buttons must act on that ledger, not on the earnpay
 * store whose fetch-before-delete makes them silent no-ops there.
 * These tests pin that routing; the mainstream path is pinned too so
 * the fix can't regress it.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerFinanceRoute, type FinanceDeps } from './finance.js';

const ADDRESS = 'bc1q0nrf6vu2gl0vga5uhnfh0ay8fxv8tya2cth9cp';

interface StubOverrides {
  ocean_chain?: 'mainstream' | 'bip110';
  historical_payouts_offset_sat?: number;
  payoutObserver?: FinanceDeps['payoutObserver'];
  rewardEventsSum?: number;
  backfillError?: string | null;
}

function makeApp(overrides: StubOverrides = {}): {
  app: FastifyInstance;
  calls: string[];
} {
  const calls: string[] = [];
  const rewardEventsSum = overrides.rewardEventsSum ?? 597_000_000;

  const payoutObserver =
    'payoutObserver' in overrides
      ? overrides.payoutObserver!
      : ({
          getLastSnapshot: () => null,
          getCollectedStatus: () => 'ready' as const,
          runHistoricalBackfill: async () => {
            calls.push('backfill');
            return {
              inserted: 3,
              withMatchingOutputs: 3,
              txSeen: 60,
              durationMs: 5,
              error: overrides.backfillError ?? null,
            };
          },
        } as unknown as FinanceDeps['payoutObserver']);

  const deps: FinanceDeps = {
    ownedBidsRepo: {
      sumLifetimeConsumedSat: async () => 18_000_000,
    } as unknown as FinanceDeps['ownedBidsRepo'],
    configRepo: {
      get: async () => ({
        btc_payout_address: ADDRESS,
        ocean_chain: overrides.ocean_chain ?? 'bip110',
        spent_scope: 'autopilot',
        historical_payouts_offset_sat:
          overrides.historical_payouts_offset_sat ?? 0,
      }),
    } as unknown as FinanceDeps['configRepo'],
    payoutObserver,
    // Chain-gated client behavior on bip110: every call resolves null.
    oceanClient: null,
    accountSpend: null,
    hashpriceCache: null,
    tickMetricsRepo: {} as unknown as FinanceDeps['tickMetricsRepo'],
    oceanPayoutsRepo: {
      sumNetUpTo: async () => {
        calls.push('earnpay-sum');
        return 42;
      },
      sumNetByRail: async () => ({ onchain: 40, lightning: 2 }),
    } as unknown as FinanceDeps['oceanPayoutsRepo'],
    oceanPayoutsService: {
      getCollectedStatus: () => 'computing' as const,
      requestFullBackfill: async () => {
        calls.push('earnpay-backfill');
        return { payouts: 0, collected_sat: 0 };
      },
      hardReset: async () => {
        calls.push('earnpay-hard-reset');
        return { payouts: 0, collected_sat: 0 };
      },
    } as unknown as FinanceDeps['oceanPayoutsService'],
    rewardEventsRepo: {
      sumPaidUpTo: async () => rewardEventsSum,
      countNonReorged: async () => 60,
      deleteAll: async () => {
        calls.push('delete-reward-events');
      },
    } as unknown as FinanceDeps['rewardEventsRepo'],
  };

  const app = Fastify();
  void registerFinanceRoute(app, deps);
  return { app, calls };
}

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
  vi.restoreAllMocks();
});

describe('GET /api/finance on the BIP110 chain (#366)', () => {
  it('derives collected from reward_events, not the earnpay store', async () => {
    const made = makeApp();
    app = made.app;
    const res = await app.inject({ method: 'GET', url: '/api/finance' });
    const body = res.json();
    expect(body.collected_sat).toBe(597_000_000);
    expect(body.collected_onchain_sat).toBe(597_000_000);
    // Lightning is untrackable on bip110: null ("unknown"), never 0.
    expect(body.collected_lightning_sat).toBeNull();
    expect(body.collected_status).toBe('ready');
    // The earnpay store must not have been consulted.
    expect(made.calls).not.toContain('earnpay-sum');
  });

  it('computes net without the structurally-null unpaid term', async () => {
    const made = makeApp({ historical_payouts_offset_sat: 1_000 });
    app = made.app;
    const body = (await app.inject({ method: 'GET', url: '/api/finance' })).json();
    expect(body.expected_sat).toBeNull();
    expect(body.net_sat).toBe(597_000_000 + 1_000 - 18_000_000);
  });

  it('reports idle (not a misleading 0) when no on-chain scanner is wired', async () => {
    const made = makeApp({ payoutObserver: null });
    app = made.app;
    const body = (await app.inject({ method: 'GET', url: '/api/finance' })).json();
    expect(body.collected_sat).toBeNull();
    expect(body.collected_status).toBe('idle');
  });

  it('mainstream path still reads the earnpay store and nulls net without unpaid', async () => {
    const made = makeApp({ ocean_chain: 'mainstream' });
    app = made.app;
    const body = (await app.inject({ method: 'GET', url: '/api/finance' })).json();
    expect(body.collected_sat).toBe(42);
    expect(body.collected_lightning_sat).toBe(2);
    // oceanClient is null here -> expected unavailable -> net stays null.
    expect(body.net_sat).toBeNull();
    expect(made.calls).toContain('earnpay-sum');
  });
});

describe('P&L rebuild / hard reset on the BIP110 chain (#366)', () => {
  it('rebuild re-scans the address history instead of fetching earnpay', async () => {
    const made = makeApp();
    app = made.app;
    const res = await app.inject({ method: 'POST', url: '/api/finance/payouts/rebuild' });
    const body = res.json();
    expect(body).toMatchObject({ ok: true, payouts: 60, collected_sat: 597_000_000 });
    expect(made.calls).toContain('backfill');
    expect(made.calls).not.toContain('earnpay-backfill');
  });

  it('hard reset wipes reward_events only after a successful probe scan', async () => {
    const made = makeApp();
    app = made.app;
    const body = (
      await app.inject({ method: 'POST', url: '/api/finance/hard-reset' })
    ).json();
    expect(body.ok).toBe(true);
    // Probe backfill runs BEFORE the wipe (fetch-before-delete).
    expect(made.calls.indexOf('backfill')).toBeLessThan(
      made.calls.indexOf('delete-reward-events'),
    );
    expect(made.calls).not.toContain('earnpay-hard-reset');
  });

  it('hard reset aborts without deleting when the scan errors', async () => {
    const made = makeApp({ backfillError: 'electrs unreachable' });
    app = made.app;
    const body = (
      await app.inject({ method: 'POST', url: '/api/finance/hard-reset' })
    ).json();
    expect(body.ok).toBe(false);
    expect(made.calls).not.toContain('delete-reward-events');
  });

  it('rebuild reports an error (not a fake success) without a scanner backend', async () => {
    const made = makeApp({ payoutObserver: null });
    app = made.app;
    const body = (
      await app.inject({ method: 'POST', url: '/api/finance/payouts/rebuild' })
    ).json();
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain('balance-check backend');
  });
});
