export interface DependencyBridgeAddresses {
  bitcoindRpc: string | null;
  datumApi: string | null;
  electrs: string | null;
}

export type DependencyEnv = Partial<
  Record<
    | 'BHA_BITCOIND_RPC_URL'
    | 'BHA_DATUM_API_URL'
    | 'BHA_ELECTRS_HOST'
    | 'BHA_ELECTRS_PORT'
    | 'BHA_PAYOUT_SOURCE',
    string
  >
>;

function splitHostPort(address: string): { host: string; port: string } {
  const endpoint = new URL(`tcp://${address}`);
  const host = endpoint.hostname.replace(/^\[|\]$/g, '');

  if (!host || !endpoint.port) {
    throw new Error(`Invalid dependency bridge address: ${address}`);
  }

  return { host, port: endpoint.port };
}

export function buildDependencyEnv(addresses: DependencyBridgeAddresses): DependencyEnv {
  const electrs = addresses.electrs ? splitHostPort(addresses.electrs) : null;

  return {
    ...(addresses.bitcoindRpc ? { BHA_BITCOIND_RPC_URL: `http://${addresses.bitcoindRpc}` } : {}),
    ...(addresses.datumApi ? { BHA_DATUM_API_URL: `http://${addresses.datumApi}` } : {}),
    ...(electrs
      ? {
          BHA_ELECTRS_HOST: electrs.host,
          BHA_ELECTRS_PORT: electrs.port,
          BHA_PAYOUT_SOURCE: 'electrs',
        }
      : {}),
  };
}
