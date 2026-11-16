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
    create(body: Json, options?: RequestOptions): Promise<Json>
    list(query?: Json): Promise<Page<Json>>
    retrieve(paymentId: string): Promise<Json>
    verify(paymentId: string): Promise<Json>
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
