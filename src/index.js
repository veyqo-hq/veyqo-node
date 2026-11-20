import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const VERSION = '0.5.0'
const DEFAULT_BASE_URL = 'https://api.veyqo.org/api/v1'

/** Any error the API returned, with its documented code (docs/API.md). */
export class VeyqoError extends Error {
  constructor({ message, code, status, details = null, requestId = null }) {
    super(message)
    this.name = 'VeyqoError'
    this.code = code
    this.status = status
    this.details = details
    this.requestId = requestId
  }
}

/** A webhook whose signature or timestamp did not check out. Reject it. */
export class VeyqoSignatureError extends Error {
  constructor(message) {
    super(message)
    this.name = 'VeyqoSignatureError'
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class Veyqo {
  /**
   * @param {string} secretKey  Your secret key (kc_live_… or kc_test_…). Server-side only.
   * @param {{ baseUrl?: string, timeout?: number, maxRetries?: number, apiVersion?: string, fetch?: typeof fetch }} [options]
   */
  constructor(secretKey, options = {}) {
    if (!secretKey || typeof secretKey !== 'string') {
      throw new Error('Pass your Veyqo secret key: new Veyqo(process.env.VEYQO_SECRET_KEY)')
    }
    this.secretKey = secretKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.timeout = options.timeout ?? 30_000
    this.maxRetries = options.maxRetries ?? 2
    this.apiVersion = options.apiVersion ?? null
    this.fetch = options.fetch ?? globalThis.fetch

    const r = (method, path) => (body, opts) => this.request(method, path, body, opts)
    const id = (value) => encodeURIComponent(value)

    this.payments = {
      create: (body, opts) => this.request('POST', '/payments', body, opts),
      list: (query) => this.request('GET', '/payments', undefined, { query }),
      retrieve: (paymentId) => this.request('GET', `/payments/${id(paymentId)}`),
      verify: (paymentId) => this.request('POST', `/payments/${id(paymentId)}/verify`),
      cancel: (paymentId) => this.request('POST', `/payments/${id(paymentId)}/cancel`),
      refund: (paymentId, body = {}, opts) => this.request('POST', `/payments/${id(paymentId)}/refunds`, body, opts),
    }
    this.refunds = { retrieve: (refundId) => this.request('GET', `/refunds/${id(refundId)}`) }
    this.checkoutSessions = {
      create: r('POST', '/checkout/sessions'),
      retrieve: (sessionId) => this.request('GET', `/checkout/sessions/${id(sessionId)}`),
    }
    this.plans = {
      create: r('POST', '/plans'),
      list: (query) => this.request('GET', '/plans', undefined, { query }),
      retrieve: (planId) => this.request('GET', `/plans/${id(planId)}`),
      update: (planId, body) => this.request('PATCH', `/plans/${id(planId)}`, body),
    }
    this.subscriptions = {
      create: r('POST', '/subscriptions'),
      list: (query) => this.request('GET', '/subscriptions', undefined, { query }),
      retrieve: (subscriptionId) => this.request('GET', `/subscriptions/${id(subscriptionId)}`),
      cancel: (subscriptionId, body = { at_period_end: true }) =>
        this.request('POST', `/subscriptions/${id(subscriptionId)}/cancel`, body),
      changePlan: (subscriptionId, body, opts) =>
        this.request('POST', `/subscriptions/${id(subscriptionId)}/plan`, body, opts),
    }
    this.transfers = {
      banks: (query) => this.request('GET', '/transfers/banks', undefined, { query }),
      resolve: (body) => this.request('POST', '/transfers/resolve', body),
      create: r('POST', '/transfers'),
      list: (query) => this.request('GET', '/transfers', undefined, { query }),
      retrieve: (transferId) => this.request('GET', `/transfers/${id(transferId)}`),
      batches: {
        create: r('POST', '/transfers/batches'),
        retrieve: (batchId) => this.request('GET', `/transfers/batches/${id(batchId)}`),
      },
    }
    this.balances = { list: () => this.request('GET', '/balances') }
    this.beneficiaries = {
      create: r('POST', '/beneficiaries'),
      list: (query) => this.request('GET', '/beneficiaries', undefined, { query }),
      del: (beneficiaryId) => this.request('DELETE', `/beneficiaries/${id(beneficiaryId)}`),
    }
    this.virtualAccounts = {
      create: r('POST', '/virtual-accounts'),
      list: (query) => this.request('GET', '/virtual-accounts', undefined, { query }),
      retrieve: (accountId) => this.request('GET', `/virtual-accounts/${id(accountId)}`),
    }
    this.splitRecipients = {
      create: r('POST', '/split-recipients'),
      list: (query) => this.request('GET', '/split-recipients', undefined, { query }),
      retrieve: (recipientId) => this.request('GET', `/split-recipients/${id(recipientId)}`),
    }
    this.cardholders = {
      create: r('POST', '/cardholders'),
      list: (query) => this.request('GET', '/cardholders', undefined, { query }),
      retrieve: (cardholderId) => this.request('GET', `/cardholders/${id(cardholderId)}`),
    }
    this.cards = {
      create: r('POST', '/cards'),
      list: (query) => this.request('GET', '/cards', undefined, { query }),
      retrieve: (cardId) => this.request('GET', `/cards/${id(cardId)}`),
      /** `{ status: 'inactive' }` freezes at once; `active` unfreezes; `controls` changes limits. */
      update: (cardId, body) => this.request('PATCH', `/cards/${id(cardId)}`, body),
      cancel: (cardId, reason, opts) => this.request('POST', `/cards/${id(cardId)}/cancel`, { reason }, opts),
      /** A short-lived token for Sudo's vault display. The card number never passes through Veyqo. */
      revealToken: (cardId) => this.request('POST', `/cards/${id(cardId)}/reveal-token`),
      /** Sandbox only. */
      simulateAuthorization: (cardId, body, opts) =>
        this.request('POST', `/cards/${id(cardId)}/simulate-authorization`, body, opts),
    }
    this.cardAuthorizations = {
      list: (query) => this.request('GET', '/card-authorizations', undefined, { query }),
      retrieve: (authorizationId) => this.request('GET', `/card-authorizations/${id(authorizationId)}`),
      /** Sandbox only. */
      simulateReversal: (authorizationId) =>
        this.request('POST', `/card-authorizations/${id(authorizationId)}/simulate-reversal`),
    }
    this.cardTransactions = {
      list: (query) => this.request('GET', '/card-transactions', undefined, { query }),
      retrieve: (transactionId) => this.request('GET', `/card-transactions/${id(transactionId)}`),
    }
    this.cardBalance = {
      retrieve: () => this.request('GET', '/card-balance'),
      entries: (query) => this.request('GET', '/card-balance/entries', undefined, { query }),
      topUp: r('POST', '/card-balance/top-ups'),
      setLowThreshold: (body) => this.request('PUT', '/card-balance/low-threshold', body),
      withdraw: r('POST', '/card-balance/withdrawals'),
      withdrawals: (query) => this.request('GET', '/card-balance/withdrawals', undefined, { query }),
    }
    this.cardProgrammes = {
      list: () => this.request('GET', '/card-programmes'),
      setAuthorizationEndpoint: (type, url) =>
        this.request('PUT', `/card-programmes/${id(type)}/authorization-endpoint`, { url }),
      rotateSecret: (type) => this.request('POST', `/card-programmes/${id(type)}/authorization-endpoint/rotate-secret`),
      testEndpoint: (type) => this.request('POST', `/card-programmes/${id(type)}/authorization-endpoint/test`),
      importCards: (body) => this.request('POST', '/card-programmes/imported/import', body),
    }
    this.events = {
      list: (query) => this.request('GET', '/events', undefined, { query }),
      retrieve: (eventId) => this.request('GET', `/events/${id(eventId)}`),
    }
    this.providers = { list: () => this.request('GET', '/providers') }
  }

  /**
   * Any endpoint. Returns `data` (and `meta` for lists as `{ data, meta }`).
   * POSTs get an Idempotency-Key automatically, so retries are safe; pass
   * your own to make a retry from a later process safe too.
   */
  async request(method, path, body, { query, idempotencyKey } = {}) {
    const url = new URL(this.baseUrl + path)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
    const headers = {
      Authorization: `Bearer ${this.secretKey}`,
      Accept: 'application/json',
      'User-Agent': `veyqo-node/${VERSION}`,
    }
    if (this.apiVersion) headers['Veyqo-Version'] = this.apiVersion
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (method === 'POST') headers['Idempotency-Key'] = idempotencyKey ?? randomUUID()

    let attempt = 0
    for (;;) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeout)
      let response
      try {
        response = await this.fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        })
      } catch (error) {
        clearTimeout(timer)
        if (attempt++ < this.maxRetries) {
          await sleep(500 * 2 ** attempt)
          continue
        }
        throw new VeyqoError({ message: `Could not reach Veyqo: ${error.message}`, code: 'NETWORK_ERROR', status: 0 })
      }
      clearTimeout(timer)

      // Retried only where repeating is safe: reads, and writes carrying the
      // same Idempotency-Key.
      if ((response.status === 429 || response.status >= 500) && attempt++ < this.maxRetries) {
        const after = Number(response.headers.get('retry-after'))
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 500 * 2 ** attempt)
        continue
      }

      const text = await response.text()
      let payload = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = null
      }
      if (!response.ok || payload?.success === false) {
        const error = payload?.error ?? {}
        throw new VeyqoError({
          message: error.message ?? `Veyqo answered ${response.status}`,
          code: error.code ?? 'INTERNAL_ERROR',
          status: response.status,
          details: error.details ?? null,
          requestId: response.headers.get('x-request-id'),
        })
      }
      return payload?.meta ? { data: payload.data, meta: payload.meta } : payload?.data
    }
  }
}

/**
 * Checks a webhook from Veyqo and returns the event.
 *
 * Pass the **raw** request body (a string or Buffer, before any JSON
 * parsing), the request headers, and the endpoint's signing secret.
 */
export function verifyWebhook(rawBody, headers, secret, { tolerance = 300, now = Date.now() } = {}) {
  const header = (name) => {
    if (typeof headers?.get === 'function') return headers.get(name)
    const key = Object.keys(headers ?? {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
    const value = key ? headers[key] : undefined
    return Array.isArray(value) ? value[0] : value
  }
  const timestamp = Number(header('veyqo-timestamp'))
  const signatures = String(header('veyqo-signature') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new VeyqoSignatureError('Missing Veyqo-Timestamp or Veyqo-Signature header.')
  }
  if (Math.abs(now / 1000 - timestamp) > tolerance) {
    throw new VeyqoSignatureError('Webhook timestamp is outside the tolerance; possible replay.')
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'))
  // Several signatures during a secret rotation: any one matching is enough.
  const valid = signatures.some((signature) => {
    const given = Buffer.from(signature)
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!valid) throw new VeyqoSignatureError('Webhook signature does not match. Check the signing secret.')
  return JSON.parse(body)
}

/**
 * Checks a real-time card authorization request from Veyqo and returns it.
 *
 * Signed exactly like a webhook, with your authorization endpoint's secret.
 * Hold the amount in your own ledger (do not just read a balance), then
 * answer within about 1.5 seconds with `cardAuthorizationResponse()`.
 */
export function verifyCardAuthorization(rawBody, headers, secret, options = {}) {
  const request = verifyWebhook(rawBody, headers, secret, options)
  if (request?.type !== 'card.authorization.request') {
    throw new VeyqoSignatureError('Not a card authorization request.')
  }
  return request
}

/** The JSON body to answer a card authorization request with (HTTP 200). */
export function cardAuthorizationResponse({ approved, reference, declineReason } = {}) {
  if (typeof approved !== 'boolean') throw new TypeError('approved must be true or false')
  const body = { approved }
  if (reference) body.reference = String(reference)
  if (!approved && declineReason) body.decline_reason = String(declineReason)
  return body
}

export default Veyqo
