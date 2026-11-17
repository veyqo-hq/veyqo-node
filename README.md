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
