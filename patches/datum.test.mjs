import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatumService } from './datum.js'

// Responses use the layout of DATUM Gateway 0.5.1-beta:3 with synthetic values.
const base = 'http://datum.test:7152'
function dashboard(rows) {
  return (
    '<title>DATUM Gateway Status</title><table>' +
    rows
      .map(
        ([label, value]) =>
          `<tr><td class="label">${label}:</td><td>${value}</td></tr>`,
      )
      .join('\n') +
    '</table>'
  )
}

async function poll(t, responses) {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, ...options })
    assert.ok(responses.length, 'unexpected request')
    return responses.shift()
  })
  const service = new DatumService({ apiUrl: base, now: () => 42 })
  const result = await service.poll()
  assert.equal(responses.length, 0, result.error)
  return { requests, result, state: service.snapshot() }
}

test('reads the StartOS status table when the JSON endpoint is missing', async (t) => {
  const html = dashboard([
    ['Total Connections', '12'],
    ['Total Work Subscriptions', '7'],
    ['Estimated Hashrate', '1250 Th/sec'],
  ])
  const { requests, result, state } = await poll(t, [
    new Response(null, { status: 404 }),
    new Response(html),
  ])
  assert.deepEqual(
    requests.map((r) => r.url),
    [base + '/umbrel-api', base + '/'],
  )
  assert.equal(requests[1].redirect, 'manual')
  assert.equal(requests[1].signal, requests[0].signal)
  assert.deepEqual(result, {
    reachable: true,
    connections: 7,
    hashrate_ph: 1.25,
    checked_at: 42,
    error: null,
  })
  assert.deepEqual(state, { last_ok_at: 42, consecutive_failures: 0 })
})

test('keeps a zero connection count and leaves an unavailable rate unknown', async (t) => {
  const html = dashboard([
    ['Total Connections', '0'],
    ['Estimated Hashrate', 'N/A'],
    ['Other', '99 Th/sec'],
  ])
  const { result } = await poll(t, [
    new Response(null, { status: 404 }),
    new Response(html),
  ])
  assert.equal(result.connections, 0)
  assert.equal(result.hashrate_ph, null)
  assert.equal(result.reachable, true)
})

test('retains upstream JSON stats when available', async (t) => {
  const json = {
    items: [
      { title: 'Connections', text: '3' },
      { title: 'Hashrate', text: '2.5', subtext: 'Ph/s' },
    ],
  }
  const { result, requests } = await poll(t, [Response.json(json)])
  assert.equal(requests.length, 1)
  assert.equal(result.connections, 3)
  assert.equal(result.hashrate_ph, 2.5)
})

for (const status of [302, 401, 403, 500]) {
  test(`reports JSON endpoint status ${status} without a second request`, async (t) => {
    const { result, requests } = await poll(t, [new Response(null, { status })])
    assert.equal(requests.length, 1)
    assert.equal(result.reachable, false)
  })
}

for (const [kind, response] of [
  ['unrecognized', () => new Response('<title>Sign in</title>')],
  ['redirected', () => new Response(null, { status: 302 })],
]) {
  test(`a ${kind} dashboard counts as a failed poll`, async (t) => {
    const { result, state } = await poll(t, [
      new Response(null, { status: 404 }),
      response(),
    ])
    assert.equal(result.reachable, false)
    assert.deepEqual(state, { last_ok_at: null, consecutive_failures: 1 })
  })
}
