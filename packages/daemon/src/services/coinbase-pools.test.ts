import { describe, expect, it } from 'vitest';

import { PoolIdentifier, coinbaseAscii, defaultPoolIdentifier } from './coinbase-pools.js';

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex');

describe('coinbaseAscii', () => {
  it('keeps printable runs and collapses non-printable gaps to a space', () => {
    // 0x03 (non-printable) between two printable runs -> single space.
    const raw = Buffer.concat([Buffer.from('AB'), Buffer.from([0x03]), Buffer.from('CD')]);
    expect(coinbaseAscii(raw.toString('hex'))).toBe('AB CD');
  });
});

describe('PoolIdentifier', () => {
  const pools = new PoolIdentifier([
    { id: 111, name: 'Foundry USA', addresses: ['12KKDt4Mj7N5UAkQMN7LtPZMayenXHa8KL'], tags: ['Foundry USA Pool'], link: 'https://foundrydigital.com' },
    { id: 1, name: 'BlockFills', addresses: [], tags: ['/BlockfillsPool/'], link: 'x' },
  ]);

  it('matches a real Foundry coinbase tag despite wrapping junk', () => {
    // The exact scriptsig seen live: leading "(" push byte + trailing slogan.
    const ident = pools.identify(hex('(/Foundry USA Pool #dropgold/'), []);
    expect(ident?.name).toBe('Foundry USA');
  });

  it('prefers an output-address match over the tag scan', () => {
    const ident = pools.identify(hex('no tag here'), ['12KKDt4Mj7N5UAkQMN7LtPZMayenXHa8KL']);
    expect(ident?.name).toBe('Foundry USA');
  });

  it('returns null when neither address nor tag matches', () => {
    expect(pools.identify(hex('/Unknown Pool XYZ/'), ['bc1qsomeoneelse'])).toBeNull();
  });
});

describe('defaultPoolIdentifier (bundled DB)', () => {
  it('loads the curated database and identifies Foundry', () => {
    const ident = defaultPoolIdentifier.identify(hex('(/Foundry USA Pool #dropgold/'), []);
    expect(ident?.name).toBe('Foundry USA');
  });
});
