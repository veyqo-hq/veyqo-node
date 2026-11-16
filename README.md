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
