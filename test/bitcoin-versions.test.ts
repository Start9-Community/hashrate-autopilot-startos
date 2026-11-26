import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ExtendedVersion, VersionRange } from '@start9labs/start-sdk'
import { bitcoinVersionRange } from '../startos/utils.ts'

const range = VersionRange.parse(bitcoinVersionRange)
for (const [firstSupported, precedingRevision] of [
  ['28.4:42', '28.4:41'],
  ['29.5:4', '29.5:3'],
  ['30.4:4', '30.4:3'],
  ['31.2:4', '31.2:3'],
  ['#knotsprerdts:29.3:33', '#knotsprerdts:29.3:32'],
  ['#roots:29.4:1', '#roots:29.4:0'],
]) {
  test(`accepts ${firstSupported} and excludes ${precedingRevision}`, () => {
    assert.equal(ExtendedVersion.parse(firstSupported).satisfies(range), true)
    assert.equal(
      ExtendedVersion.parse(precedingRevision).satisfies(range),
      false,
    )
  })
}

test('accepts the deployed Roots revision', () => {
  assert.ok(ExtendedVersion.parse('#roots:29.4:5').satisfies(range))
})
