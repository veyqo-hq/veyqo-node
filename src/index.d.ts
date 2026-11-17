export declare const VERSION: string

export interface VeyqoOptions {
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  apiVersion?: string
  fetch?: typeof fetch
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>
  idempotencyKey?: string
}

export interface Page<T> {
  data: T[]
  meta: { page: number; per_page: number; total: number; has_more: boolean }
}

export type Json = Record<string, unknown>

/** An address. Country is ISO 3166 alpha-2 (e.g. "CA"). */
export interface Address {
  line1: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country: string
}

/** One thing being bought. Amounts are in the currency's smallest unit. */
export interface LineItem {
  name: string
  unit_amount: number
  quantity?: number
  description?: string
}

export interface PaymentCreateParams {
  /** Smallest currency unit. With line_items: their total plus shipping.amount. */
  amount: number
  currency: string
  reference?: string
  description?: string
  callback_url?: string
  /** A connected provider's slug; omitted, routing chooses. */
  provider?: string
  payment_method?: 'card' | 'bank_transfer' | 'ussd' | 'mobile_money'
  customer: { email: string; name?: string; phone?: string; country?: string }
  /** Itemised on the checkout page where the provider supports it. */
  line_items?: LineItem[]
  /** Where it is sent; required with tax.automatic. amount is delivery's cost, charged and taxed as shipping. */
  shipping?: { name?: string; phone?: string; amount?: number; label?: string; address: Address }
  /** Have a provider that supports it (Stripe) add sales tax / VAT / GST at checkout. */
  tax?: { automatic: boolean }
  metadata?: Record<string, string | number | boolean>
}

/** The provider's fraud assessment, when it gives one. */
export interface PaymentRisk {
  level: string | null
  score: number | null
  /** True when the provider advises a manual review. */
  review: boolean
  card_country: string | null
}

export interface Payment {
  id: string
  object: 'payment'
  reference: string
  status: 'created' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded'
  /** Once paid with automatic tax: the total charged (amount_subtotal + amount_tax). */
  amount: number
  amount_subtotal: number | null
  amount_tax: number | null
  amount_refunded: number
  currency: string
  line_items: LineItem[] | null
  shipping: PaymentCreateParams['shipping'] | null
  tax: { automatic: boolean }
  risk: PaymentRisk | null
  checkout_url: string | null
  provider: string
  failure_code: string | null
  failure_message: string | null
  metadata: Record<string, unknown>
  created_at: string
  [key: string]: unknown
}

export declare class VeyqoError extends Error {
  code: string
  status: number
  details: Record<string, unknown> | null
  requestId: string | null
}

export declare class VeyqoSignatureError extends Error {}

export declare class Veyqo {
  constructor(secretKey: string, options?: VeyqoOptions)
  payments: {
    create(body: PaymentCreateParams, options?: RequestOptions): Promise<Payment>
    list(query?: Json): Promise<Page<Payment>>
    retrieve(paymentId: string): Promise<Payment>
    verify(paymentId: string): Promise<Payment>
    /** Close a payment nobody has paid, so an old link cannot take money. */
    cancel(paymentId: string): Promise<Payment>
    refund(paymentId: string, body?: Json, options?: RequestOptions): Promise<Json>
  }
  refunds: { retrieve(refundId: string): Promise<Json> }
  checkoutSessions: { create(body: Json, options?: RequestOptions): Promise<Json>; retrieve(id: string): Promise<Json> }
  plans: {
    create(body: Json, options?: RequestOptions): Promise<Json>
    list(query?: Json): Promise<Page<Json>>
    retrieve(planId: string): Promise<Json>
    update(planId: string, body: Json): Promise<Json>
  }
  subscriptions: {
    create(body: Json, options?: RequestOptions): Promise<Json>
    list(query?: Json): Promise<Page<Json>>
    retrieve(subscriptionId: string): Promise<Json>
    cancel(subscriptionId: string, body?: { at_period_end?: boolean }): Promise<Json>
    /** Switch at the next renewal (default), or now for the prorated difference with at_period_end: false. */
    changePlan(subscriptionId: string, body: { plan: string; at_period_end?: boolean }, options?: RequestOptions): Promise<Json>
  }
  /** Bank transfers from your own provider balance (docs: veyqo.org/docs/transfers). */
  transfers: {
    /** Every bank and which providers reach it; with { provider }, that provider's own list and codes. */
    banks(query?: { provider?: string }): Promise<Json[]>
    /** Whose account it is, before you send. */
    resolve(body: { bank?: string; bank_code?: string; account_number: string; provider?: string }): Promise<Json>
    create(
      body: {
        amount: number
        bank?: string
        bank_code?: string
        account_number: string
        account_name?: string
        narration?: string
        reference?: string
        provider?: string
        metadata?: Json
      },
      options?: RequestOptions,
    ): Promise<Json>
    list(query?: { status?: 'pending' | 'successful' | 'failed'; page?: number; per_page?: number }): Promise<Page<Json>>
    retrieve(transferId: string): Promise<Json>
  }
  events: { list(query?: Json): Promise<Page<Json>>; retrieve(eventId: string): Promise<Json> }
  providers: { list(): Promise<Json[]> }
  request<T = unknown>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T>
}

export declare function verifyWebhook(
  rawBody: string | Buffer,
  headers: Headers | Record<string, string | string[] | undefined>,
  secret: string,
  options?: { tolerance?: number; now?: number },
): Json

export default Veyqo
