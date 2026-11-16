import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

import { Veyqo, VeyqoError, VeyqoSignatureError, verifyWebhook } from '../src/index.js'

const fakeFetch = (responses, seen = []) => async (url, init) => {
  seen.push({ url: String(url), init })
  const next = responses.shift()
  return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: next.headers ?? {} })
}

test('sends the key, an idempotency key on POST, and unwraps data', async () => {
  const seen = []
  const veyqo = new Veyqo('kc_test_abc', { fetch: fakeFetch([{ status: 201, body: { success: true, data: { id: 'pay_1' } } }], seen) })
  const payment = await veyqo.payments.create({ amount: 50000, currency: 'NGN', customer: { email: 'a@b.co' } })
  assert.equal(payment.id, 'pay_1')
  assert.equal(seen[0].init.headers.Authorization, 'Bearer kc_test_abc')
  assert.ok(seen[0].init.headers['Idempotency-Key'])
  assert.equal(seen[0].url, 'https://api.veyqo.org/api/v1/payments')
})

test('lists return data and meta', async () => {
  const veyqo = new Veyqo('kc_test_abc', { fetch: fakeFetch([{ body: { success: true, data: [{ id: 'csub_1' }], meta: { page: 1, total: 1 } } }]) })
  const page = await veyqo.subscriptions.list({ status: 'active' })
  assert.equal(page.data[0].id, 'csub_1')
  assert.equal(page.meta.total, 1)
})

test('retries a 503 with the same idempotency key, then throws typed errors', async () => {
  const seen = []
  const veyqo = new Veyqo('kc_test_abc', {
    maxRetries: 1,
    fetch: fakeFetch(
      [
        { status: 503, body: {}, headers: { 'retry-after': '0' } },
        { status: 422, body: { success: false, error: { code: 'VALIDATION_FAILED', message: 'Nope', details: { amount: ['x'] } } } },
      ],
      seen,
    ),
  })
  await assert.rejects(veyqo.payments.create({}), (error) => error instanceof VeyqoError && error.code === 'VALIDATION_FAILED' && error.status === 422)
  assert.equal(seen[0].init.headers['Idempotency-Key'], seen[1].init.headers['Idempotency-Key'])
})

test('verifies a webhook signature, any of several during rotation', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' })
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = (secret) => createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  const headers = { 'Veyqo-Timestamp': String(timestamp), 'Veyqo-Signature': `${sign('old')},${sign('whsec_new')}` }
  assert.equal(verifyWebhook(body, headers, 'whsec_new').id, 'evt_1')
  assert.throws(() => verifyWebhook(body, headers, 'wrong'), VeyqoSignatureError)
  assert.throws(() => verifyWebhook(body, headers, 'whsec_new', { now: (timestamp + 600) * 1000 }), VeyqoSignatureError)
})

test('transfers: banks, resolve, create and retrieve', async () => {
  const seen = []
  const veyqo = new Veyqo('kc_test_abc', {
    fetch: fakeFetch(
      [
        { body: { success: true, data: [{ id: '000013', name: 'GTBank', providers: ['paystack'] }] } },
        { body: { success: true, data: { account_name: 'ADA LOVELACE' } } },
        { status: 201, body: { success: true, data: { id: 'trf_1', status: 'pending' } } },
        { body: { success: true, data: { id: 'trf_1', status: 'successful' } } },
      ],
      seen,
    ),
  })
  const banks = await veyqo.transfers.banks({ provider: 'paystack' })
  assert.equal(banks[0].id, '000013')
  assert.equal(seen[0].url, 'https://api.veyqo.org/api/v1/transfers/banks?provider=paystack')
  assert.equal((await veyqo.transfers.resolve({ bank: '000013', account_number: '0123456789' })).account_name, 'ADA LOVELACE')
  const transfer = await veyqo.transfers.create({ amount: 500000, bank: '000013', account_number: '0123456789' })
  assert.equal(transfer.id, 'trf_1')
  assert.ok(seen[2].init.headers['Idempotency-Key'])
  assert.equal((await veyqo.transfers.retrieve('trf_1')).status, 'successful')
})

test('subscriptions.changePlan posts to the plan endpoint', async () => {
  const seen = []
  const veyqo = new Veyqo('kc_test_abc', { fetch: fakeFetch([{ body: { success: true, data: { id: 'csub_1' } } }], seen) })
  await veyqo.subscriptions.changePlan('csub_1', { plan: 'rplan_2', at_period_end: false })
  assert.equal(seen[0].url, 'https://api.veyqo.org/api/v1/subscriptions/csub_1/plan')
  assert.deepEqual(JSON.parse(seen[0].init.body), { plan: 'rplan_2', at_period_end: false })
})
