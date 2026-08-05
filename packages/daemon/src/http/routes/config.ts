import type { FastifyInstance } from 'fastify';

import {
  isValidBtcPayoutAddress,
  isSensitiveConfigField,
  CONFIG_WRITE_ONLY_FIELDS,
  CONFIG_VALUE_REDACTED,
} from '@hashrate-autopilot/shared';

import { AppConfigInvariantsSchema, type AppConfig } from '../../config/schema.js';
import type { HttpServerDeps } from '../server.js';
import type { ConfigResponse } from '../types.js';

/**
 * #331 (GHSA-wvpp): credential config fields are write-only over the
 * API. GET returns them blanked plus a `credentials_set` flag so the UI
 * can show "configured"; the raw value never leaves the daemon.
 */
export function maskCredentials(config: AppConfig): {
  config: AppConfig;
  credentials_set: Record<string, boolean>;
} {
  const masked = { ...config } as Record<string, unknown>;
  const credentials_set: Record<string, boolean> = {};
  for (const f of CONFIG_WRITE_ONLY_FIELDS) {
    const v = (config as Record<string, unknown>)[f];
    credentials_set[f] = typeof v === 'string' && v.length > 0;
    if (f in masked) masked[f] = '';
  }
  return { config: masked as AppConfig, credentials_set };
}

/**
 * #331: a blank sensitive field on save means "keep the stored value" -
 * the GET masked it, so the dashboard never had the real value to send
 * back. Never overwrite a set credential with empty.
 */
export function keepCredentials(next: AppConfig, prev: AppConfig): AppConfig {
  const merged = { ...next } as Record<string, unknown>;
  for (const f of CONFIG_WRITE_ONLY_FIELDS) {
    const nv = (next as Record<string, unknown>)[f];
    const pv = (prev as Record<string, unknown>)[f];
    if (nv === '' && typeof pv === 'string' && pv.length > 0) merged[f] = pv;
  }
  return merged as AppConfig;
}

export async function registerConfigRoutes(
  app: FastifyInstance,
  deps: HttpServerDeps,
): Promise<void> {
  app.get('/api/config', async (_req, reply): Promise<ConfigResponse | { error: string }> => {
    const config = await deps.configRepo.get();
    if (!config) {
      reply.code(503);
      return { error: 'config not seeded - run setup CLI' };
    }
    return maskCredentials(config);
  });

  app.put<{ Body: AppConfig }>(
    '/api/config',
    async (req, reply): Promise<ConfigResponse | { error: string; details?: string }> => {
      const parsed = AppConfigInvariantsSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(422);
        return {
          error: 'schema validation failed',
          details: parsed.error.issues
            .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
            .join('\n'),
        };
      }
      // #309: write-side gate on the BTC payout address. The field used
      // to accept any non-empty string, so a stray `c` got saved, the
      // worker identity became `c.<label>`, and Ocean credited the
      // rented hashrate to nobody. Validate here (the write path) rather
      // than in the schema, which also runs on read/boot - a refine
      // there would brick startup while an already-bad value is stored.
      // Trim first so trailing whitespace can't corrupt the Ocean lookup.
      const payoutAddress = parsed.data.btc_payout_address.trim();
      if (!isValidBtcPayoutAddress(payoutAddress)) {
        reply.code(422);
        return {
          error: 'invalid BTC payout address',
          details: `btc_payout_address: "${payoutAddress}" is not a valid mainnet Bitcoin address (expected a bech32 "bc1q…" or Taproot "bc1p…" address)`,
        };
      }
      const cleaned: AppConfig =
        payoutAddress === parsed.data.btc_payout_address
          ? parsed.data
          : { ...parsed.data, btc_payout_address: payoutAddress };

      // Snapshot the previous config BEFORE upsert so the
      // onConfigSaved callback can diff and decide what to kick
      // (e.g. DDNS updater on hostname/credential change).
      const prev = await deps.configRepo.get().catch(() => null);
      // #331: blank credential fields mean "keep existing" (write-only
      // API). Applied before the diff so leaving a masked field blank
      // isn't recorded as a change and never blanks a set secret.
      const saved = prev ? keepCredentials(cleaned, prev) : cleaned;
      await deps.configRepo.upsert(saved);

      // #318: record one config-change event per changed field, for the
      // unified History log. Best-effort - never fails the save.
      if (prev) {
        const fmtVal = (v: unknown): string | null =>
          v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
        const now = Date.now();
        const changes = (Object.keys(saved) as Array<keyof AppConfig>)
          .map((k) => ({ field: String(k), oldV: fmtVal(prev[k]), newV: fmtVal(saved[k]) }))
          .filter((c) => c.oldV !== c.newV)
          .map((c) => {
            // Security (GHSA-x8x9): never persist a credential's value into
            // the audit log. We still record that the field changed, but
            // replace both values with a redaction marker so the raw secret
            // never reaches system_events / the API / the Timeline export.
            const redact = isSensitiveConfigField(c.field);
            return {
              occurred_at: now,
              kind: 'config_change' as const,
              field: c.field,
              old_value: redact ? CONFIG_VALUE_REDACTED : c.oldV,
              new_value: redact ? CONFIG_VALUE_REDACTED : c.newV,
            };
          });
        if (changes.length > 0) {
          void deps.systemEventsRepo
            .insertMany(changes)
            .catch((err) => deps.log?.(`[config] system-events insert failed: ${(err as Error).message}`));
        }
      }

      if (deps.onConfigSaved) {
        // Best-effort - don't fail the save if a side-effect throws,
        // but log the error so an "I saved config but DDNS didn't
        // move" report is correlatable against the daemon log.
        try {
          await deps.onConfigSaved(saved, prev);
        } catch (err) {
          deps.log?.(
            `[config] onConfigSaved threw: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      return maskCredentials(saved);
    },
  );
}
