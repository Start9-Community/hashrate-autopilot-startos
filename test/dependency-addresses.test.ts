import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDependencyEnv } from '../startos/dependency-addresses.ts'

describe('buildDependencyEnv', () => {
  it('maps resolved bridge addresses to daemon environment overrides', () => {
    deepStrictEqual(
      buildDependencyEnv({
        bitcoindRpc: '10.0.3.1:18001',
        datumApi: '10.0.3.1:18002',
        electrs: '10.0.3.1:18003',
      }),
      {
        BHA_BITCOIND_RPC_URL: 'http://10.0.3.1:18001',
        BHA_DATUM_API_URL: 'http://10.0.3.1:18002',
        BHA_ELECTRS_HOST: '10.0.3.1',
        BHA_ELECTRS_PORT: '18003',
        BHA_PAYOUT_SOURCE: 'electrs',
      },
    )
  })

  it('splits a bracketed IPv6 Electrs address', () => {
    deepStrictEqual(
      buildDependencyEnv({
        bitcoindRpc: null,
        datumApi: null,
        electrs: '[fd00::1234]:50001',
      }),
      {
        BHA_ELECTRS_HOST: 'fd00::1234',
        BHA_ELECTRS_PORT: '50001',
        BHA_PAYOUT_SOURCE: 'electrs',
      },
    )
  })

  it('omits overrides for unresolved dependencies', () => {
    deepStrictEqual(
      buildDependencyEnv({ bitcoindRpc: null, datumApi: null, electrs: null }),
      {},
    )
  })
})
