/**
 * GET /api/payout-ledger
 *
 * Returns the operator's payouts from Ocean's own payout ledger
 * (`ocean_payouts`, fed by the earnpay endpoint) for the currently
 * configured payout address, oldest first. This is what the Price
 * chart draws its payout gems from (#323) - it supersedes the on-chain
 * `/api/reward-events` source, which was on-chain-only and so could
 * never plot a Lightning payout on the timeline.
 *
 * Each row carries its rail: on-chain payouts include `on_chain_txid`
 * (the chart deep-links it to a block explorer); Lightning payouts have
 * `on_chain_txid: null` and render a gem with no link.
 */

import type { FastifyInstance } from 'fastify';

import type { ConfigRepo } from '../../state/repos/config.js';
import type { OceanPayoutsRepo } from '../../state/repos/ocean_payouts.js';

export interface PayoutLedgerView {
  readonly id: number;
  readonly ts_ms: number;
  readonly on_chain_txid: string | null;
  readonly net_sat: number;
  /** 'unknown' = deduced payout still inside its 24h correction window (#343). */
  readonly rail: 'onchain' | 'lightning' | 'unknown';
  readonly is_generation: boolean;
  /**
   * #343: true when this payout was deduced from the unpaid-series
   * drop rather than read from Ocean's ledger (which doesn't return
   * Lightning payouts). Amount is approximate; the UI badges it.
   */
  readonly deduced: boolean;
}

export interface PayoutLedgerResponse {
  readonly payouts: readonly PayoutLedgerView[];
}

export interface PayoutLedgerDeps {
  readonly oceanPayoutsRepo: OceanPayoutsRepo;
  readonly configRepo: ConfigRepo;
}

export async function registerPayoutLedgerRoute(
  app: FastifyInstance,
  deps: PayoutLedgerDeps,
): Promise<void> {
  app.get('/api/payout-ledger', async (): Promise<PayoutLedgerResponse> => {
    const config = await deps.configRepo.get();
    const address = config?.btc_payout_address;
    if (!address) return { payouts: [] };
    const rows = await deps.oceanPayoutsRepo.listForAddressSince(address, 0);
    const payouts: PayoutLedgerView[] = rows.map((r) => ({
      id: Number(r.id),
      ts_ms: Number(r.ts),
      on_chain_txid: r.on_chain_txid,
      net_sat: Number(r.net_sat),
      rail: r.rail,
      is_generation: Number(r.is_generation) === 1,
      deduced: Number(r.deduced) === 1,
    }));
    return { payouts };
  });
}
