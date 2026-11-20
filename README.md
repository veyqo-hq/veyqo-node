# Veyqo for Node.js

The official Node.js library for the [Veyqo](https://veyqo.org) payments API.
No dependencies; Node 18 or later.

```bash
npm install @veyqo/node
```

```js
import { Veyqo, verifyWebhook } from '@veyqo/node'

const veyqo = new Veyqo(process.env.VEYQO_SECRET_KEY)

// One payment
const payment = await veyqo.payments.create({
  amount: 500000, // ₦5,000.00, in kobo
  currency: 'NGN',
  reference: 'ORDER-1001',
  customer: { email: 'customer@example.com' },
  callback_url: 'https://shop.example.com/thanks',
})
// send the customer to payment.checkout_url

// Recurring billing
const plan = await veyqo.plans.create({ name: 'Pro', amount: 250000, currency: 'NGN', interval: 'month' })
const subscription = await veyqo.subscriptions.create({ plan: plan.id, customer: { email: 'customer@example.com' } })
// send the customer to subscription.checkout_url for the first period

// Bank transfers from your provider balance
const account = await veyqo.transfers.resolve({ bank: '000013', account_number: '0123456789' })
const transfer = await veyqo.transfers.create({
  amount: 500000,
  bank: '000013', // GTBank's NIBSS code: works on every provider
  account_number: '0123456789',
  account_name: account.account_name, // refused if the bank's name differs
  reference: 'PAYOUT-1001',
})
// transfer.status: successful, failed or pending (then transfer.successful / transfer.failed webhooks)
```

### Saved accounts, batches and balances

```js
// What each connected provider account holds
const balances = await veyqo.balances.list()

// Save an account once (name-checked), then pay it by id
const ada = await veyqo.beneficiaries.create({ bank: '000013', account_number: '0123456789', label: 'Ada, supplier' })
await veyqo.transfers.create({ amount: 250000, beneficiary: ada.id, reference: 'INV-88' })

// Payroll: up to 200 transfers, sent in the background
const batch = await veyqo.transfers.batches.create({
  reference: 'PAYROLL-2026-11',
  transfers: [
    { amount: 450000, bank: '000013', account_number: '0123456789', narration: 'November salary' },
    { amount: 380000, bank: '000014', account_number: '9876543210', narration: 'November salary' },
  ],
})
// later: (await veyqo.transfers.batches.retrieve(batch.id)).progress
```

A transfer at or above your organization's approval limit comes back as `awaiting_approval`. It is sent once an owner or admin approves it in the dashboard, or rejected after 7 days.

### Virtual accounts

```js
// A permanent account number for one customer
const account = await veyqo.virtualAccounts.create({
  customer: { email: 'ada@example.com', name: 'Ada Obi' }, // Flutterwave also needs bvn
  reference: 'CUSTOMER-42',
  metadata: { customer_id: '42' },
})
// Show account.account_number and account.bank_name to the customer.
// Each deposit is confirmed with the provider, then arrives as payment.succeeded
// with metadata.virtual_account_id and your metadata.
```

### Cards

Virtual cards on Sudo, decided in real time. Every payment on your own Sudo
programme is asked of your authorization endpoint: hold the amount (do not
just read a balance) and answer within about 1.5 seconds.

```js
const holder = await veyqo.cardholders.create({
  first_name: 'Ada', last_name: 'Obi',
  identity: { type: 'BVN', number: '22222222222' }, // passed to Sudo, never stored by Veyqo
  billing_address: { line1: '1 Marina', city: 'Lagos', state: 'Lagos', postal_code: '100001', country: 'NG' },
  reference: 'USER-42',
})
const card = await veyqo.cards.create({
  cardholder: holder.id, brand: 'Verve', currency: 'NGN',
  controls: { limits: { daily: 10_000_000 }, channels: { atm: false } },
})
await veyqo.cards.update(card.id, { status: 'inactive' }) // freeze at once
const { token, vault } = await veyqo.cards.revealToken(card.id) // for Sudo's secure display
```

```js
import { verifyCardAuthorization, cardAuthorizationResponse } from '@veyqo/node'

app.post('/veyqo/card-authorize', express.raw({ type: 'application/json' }), async (req, res) => {
  const request = verifyCardAuthorization(req.body, req.headers, process.env.VEYQO_CARD_SECRET)
  const { amount, currency } = request.data.authorization
  const hold = await wallets.hold(request.data.card.metadata.user_id, amount, currency, request.id) // idempotent on request.id
  res.json(cardAuthorizationResponse(hold ? { approved: true, reference: hold.id } : { approved: false, declineReason: 'insufficient_funds' }))
})
// Release the hold on card.authorization.declined; settle it on card.transaction.created.
```

On Veyqo's own programme, payments are paid from your prepaid card balance:
`veyqo.cardBalance.retrieve()`, `veyqo.cardBalance.topUp({ currency, amount, email })`.

### Split payments

```js
const seller = await veyqo.splitRecipients.create({
  name: 'Ada Obi Stores',
  bank: '000013',
  account_number: '0123456789',
  reference: 'SELLER-7',
})
const payment = await veyqo.payments.create({
  amount: 1000000,
  currency: 'NGN',
  customer: { email: 'buyer@example.com' },
  split: [{ recipient: seller.id, amount: 850000 }], // the seller gets 8,500; the rest is yours
})
```

### Itemised checkout with tax

```js
const payment = await veyqo.payments.create({
  amount: 38400, // line items + shipping, in cents
  currency: 'CAD',
  provider: 'stripe',
  reference: 'ORDER-1001',
  customer: { email: 'buyer@example.ca', name: 'Ada Buyer' },
  line_items: [
    { name: 'Sole Pod', unit_amount: 19900 },
    { name: 'Re-Up', unit_amount: 15000, quantity: 1 },
  ],
  shipping: {
    name: 'Ada Buyer',
    amount: 3500, // charged and taxed as shipping
    label: 'Standard shipping',
    address: { line1: '1 King St W', city: 'Toronto', state: 'ON', postal_code: 'M5H 1A1', country: 'CA' },
  },
  tax: { automatic: true }, // Stripe adds GST/HST/sales tax at checkout
  callback_url: 'https://shop.example.com/thanks',
})
// once paid: payment.amount is the total, payment.amount_tax the tax,
// payment.risk Stripe Radar's assessment (review: true means look before shipping)

await veyqo.payments.cancel(payment.id) // order cancelled: close the checkout
```

## Webhooks

Verify every webhook against the **raw** body before trusting it:

```js
app.post('/webhooks/veyqo', express.raw({ type: 'application/json' }), (req, res) => {
  let event
  try {
    event = verifyWebhook(req.body, req.headers, process.env.VEYQO_WEBHOOK_SECRET)
  } catch {
    return res.sendStatus(400)
  }
  if (event.type === 'payment.succeeded') {
    // fulfil event.data.reference, once (dedupe on event.id)
  }
  res.sendStatus(200)
})
```

## Errors and retries

Failed calls throw `VeyqoError` with `code`, `status`, `details` and
`requestId`. Reads, and POSTs (which always carry an `Idempotency-Key`), are
retried on network errors, 429 and 5xx. Pass `{ idempotencyKey }` to make a
retry from another process safe too.

Full reference: https://veyqo.org/docs
