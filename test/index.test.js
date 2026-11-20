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

test('payments.cancel posts to the cancel endpoint', async () => {
  const seen = []
  const veyqo = new Veyqo('kc_test_abc', { fetch: fakeFetch([{ body: { success: true, data: { id: 'pay_1', status: 'cancelled' } } }], seen) })
  assert.equal((await veyqo.payments.cancel('pay_1')).status, 'cancelled')
  assert.equal(seen[0].url, 'https://api.veyqo.org/api/v1/payments/pay_1/cancel')
  assert.equal(seen[0].init.method, 'POST')
})

test('new resources: balances, beneficiaries, batches, virtual accounts, split recipients', async () => {
  const seen = []
  const ok = (data, status = 200) => ({ status, body: { success: true, data } })
  const veyqo = new Veyqo('kc_test_abc', {
    fetch: fakeFetch(
      [
        ok([{ provider: 'paystack', available: true, balances: [] }]),
        ok({ id: 'ben_1' }, 201),
        ok({ id: 'ben_1', deleted: true }),
        ok({ id: 'tbat_1', status: 'queued' }, 201),
        ok({ id: 'tbat_1', status: 'done' }),
        ok({ id: 'va_1', account_number: '9930000001' }, 201),
        ok({ id: 'va_1' }),
        ok({ id: 'spr_1' }, 201),
        ok({ id: 'pay_1', split: [{ recipient: 'spr_1', amount: 250000 }] }, 201),
      ],
      seen,
    ),
  })

  assert.equal((await veyqo.balances.list())[0].provider, 'paystack')
  await veyqo.beneficiaries.create({ bank: '000013', account_number: '0123456789' })
  assert.equal((await veyqo.beneficiaries.del('ben_1')).deleted, true)
  await veyqo.transfers.batches.create({ reference: 'PAYROLL-NOV', transfers: [{ amount: 100000, bank: '000013', account_number: '0123456789' }] })
  assert.equal((await veyqo.transfers.batches.retrieve('tbat_1')).status, 'done')
  assert.equal((await veyqo.virtualAccounts.create({ customer: { email: 'ada@example.com' }, reference: 'CUST 42' })).account_number, '9930000001')
  await veyqo.virtualAccounts.retrieve('CUST 42')
  await veyqo.splitRecipients.create({ name: 'Ada Stores', bank: '000013', account_number: '0123456789' })
  await veyqo.payments.create({ amount: 1000000, currency: 'NGN', customer: { email: 'b@c.co' }, split: [{ recipient: 'spr_1', amount: 250000 }] })

  const calls = seen.map(({ url, init }) => `${init.method} ${new URL(url).pathname}`)
  assert.deepEqual(calls, [
    'GET /api/v1/balances',
    'POST /api/v1/beneficiaries',
    'DELETE /api/v1/beneficiaries/ben_1',
    'POST /api/v1/transfers/batches',
    'GET /api/v1/transfers/batches/tbat_1',
    'POST /api/v1/virtual-accounts',
    'GET /api/v1/virtual-accounts/CUST%2042',
    'POST /api/v1/split-recipients',
    'POST /api/v1/payments',
  ])
  assert.equal(seen[2].init.headers['Idempotency-Key'], undefined)
  assert.deepEqual(JSON.parse(seen[8].init.body).split, [{ recipient: 'spr_1', amount: 250000 }])
})

test('cards: issue, freeze, cancel and reveal, on the right endpoints', async () => {
  const seen = []
  const ok = (data) => ({ body: { success: true, data } })
  const veyqo = new Veyqo('kc_test_abc', {
    fetch: fakeFetch([ok({ id: 'ch_1' }), ok({ id: 'card_1', last4: '4321' }), ok({ id: 'card_1', status: 'inactive' }), ok({ id: 'card_1', status: 'canceled' }), ok({ token: 't' }), ok([]), ok({ balances: [] })], seen),
  })
  await veyqo.cardholders.create({ first_name: 'Ada', last_name: 'Obi', billing_address: { line1: '1 Marina', city: 'Lagos', state: 'Lagos', postal_code: '100001', country: 'NG' } })
  assert.equal((await veyqo.cards.create({ cardholder: 'ch_1', brand: 'Verve', currency: 'NGN' })).last4, '4321')
  await veyqo.cards.update('card_1', { status: 'inactive' })
  await veyqo.cards.cancel('card_1', 'lost')
  await veyqo.cards.revealToken('card_1')
  await veyqo.cardProgrammes.list()
  await veyqo.cardBalance.retrieve()
  assert.deepEqual(seen.map((s) => `${s.init.method} ${new URL(s.url).pathname}`), [
    'POST /api/v1/cardholders',
    'POST /api/v1/cards',
    'PATCH /api/v1/cards/card_1',
    'POST /api/v1/cards/card_1/cancel',
    'POST /api/v1/cards/card_1/reveal-token',
    'GET /api/v1/card-programmes',
    'GET /api/v1/card-balance',
  ])
  assert.equal(JSON.parse(seen[3].init.body).reason, 'lost')
  assert.equal(seen[2].init.headers['Idempotency-Key'], undefined)
})

test('verifies a card authorization request and builds the answer', async () => {
  const { verifyCardAuthorization, cardAuthorizationResponse } = await import('../src/index.js')
  const body = JSON.stringify({ id: 'cauth_1', type: 'card.authorization.request', data: { authorization: { amount: 25000 } } })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', 'whsec_card').update(`${timestamp}.${body}`).digest('hex')
  const request = verifyCardAuthorization(body, { 'Veyqo-Timestamp': String(timestamp), 'Veyqo-Signature': signature }, 'whsec_card')
  assert.equal(request.data.authorization.amount, 25000)

  const other = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' })
  const otherSignature = createHmac('sha256', 'whsec_card').update(`${timestamp}.${other}`).digest('hex')
  assert.throws(() => verifyCardAuthorization(other, { 'Veyqo-Timestamp': String(timestamp), 'Veyqo-Signature': otherSignature }, 'whsec_card'), VeyqoSignatureError)
  assert.throws(() => verifyCardAuthorization(body, { 'Veyqo-Timestamp': String(timestamp), 'Veyqo-Signature': 'bad' }, 'whsec_card'), VeyqoSignatureError)

  assert.deepEqual(cardAuthorizationResponse({ approved: true, reference: 'hold_1' }), { approved: true, reference: 'hold_1' })
  assert.deepEqual(cardAuthorizationResponse({ approved: false, declineReason: 'insufficient_funds' }), { approved: false, decline_reason: 'insufficient_funds' })
  assert.throws(() => cardAuthorizationResponse({}), TypeError)
})
