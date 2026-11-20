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
  /**
   * Pay part of it straight to split recipients at settlement: flat shares in
   * the smallest unit, together less than amount. The rest is yours. The
   * payment goes through the recipients' provider.
   */
  split?: SplitShare[]
}

export interface SplitShare {
  /** A split recipient id (spr_…). */
  recipient: string
  amount: number
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
  split: SplitShare[] | null
  checkout_url: string | null
  provider: string
  failure_code: string | null
  failure_message: string | null
  metadata: Record<string, unknown>
  created_at: string
  [key: string]: unknown
}

export interface Bank {
  /** Veyqo bank id (the NIBSS institution code), when there is one. */
  id: string | null
  code?: string | null
  name: string
}

export interface TransferCreateParams {
  amount: number
  currency?: 'NGN'
  /** A Veyqo bank id from transfers.banks(). Not needed with beneficiary. */
  bank?: string
  /** A provider's own bank code instead of bank; needs provider when several are connected. */
  bank_code?: string
  account_number?: string
  /** A saved beneficiary (ben_…) instead of bank details. Still name-checked. */
  beneficiary?: string
  /** Refused, nothing sent, if the bank's name for the account differs. */
  account_name?: string
  narration?: string
  reference?: string
  provider?: string
  metadata?: Json
}

export interface Transfer {
  id: string
  object: 'transfer'
  reference: string | null
  /** awaiting_approval: at or above your approval limit, held until an owner or admin approves it in the dashboard. */
  status: 'pending' | 'successful' | 'failed' | 'awaiting_approval'
  amount: number
  currency: string
  account_number: string
  account_name: string | null
  bank: Bank
  narration: string | null
  provider: { name: string; reference: string | null; transfer_id: string | null }
  /** Why it failed or was rejected, in words. */
  failure_message: string | null
  /** Set when it needed approval: approved_at stays null until someone approves it. */
  approval: { required: true; approved_at: string | null } | null
  metadata: Record<string, unknown>
  created_at: string
  completed_at: string | null
  [key: string]: unknown
}

export interface TransferBatch {
  id: string
  object: 'transfer_batch'
  status: 'queued' | 'sending' | 'done'
  provider: string | null
  total: number
  total_amount: number
  currency: string
  progress: { queued: number; sent: number; refused: number }
  transfers: {
    row: number
    reference: string
    amount: number
    outcome: 'queued' | 'sent' | 'refused'
    transfer_id: string | null
    status: Transfer['status'] | null
    error: string | null
  }[]
  created_at: string
  completed_at: string | null
}

export interface Balance {
  provider: string
  /** False when the provider does not report balances. */
  available: boolean
  /** Set when the provider did not answer. */
  error: string | null
  balances: { currency: string; available: number; pending: number }[]
  checked_at: string
  [key: string]: unknown
}

export interface Beneficiary {
  id: string
  object: 'beneficiary'
  label: string | null
  bank: Bank
  provider: string | null
  account_number: string
  /** As the bank returned it when saved. */
  account_name: string
  created_at: string
}

export interface VirtualAccount {
  id: string
  object: 'virtual_account'
  reference: string | null
  status: string
  /** The NUBAN the customer pays into. */
  account_number: string
  account_name: string | null
  bank_name: string | null
  provider: string
  customer: { email: string; name: string | null }
  metadata: Record<string, unknown>
  created_at: string
}

export interface SplitRecipient {
  id: string
  object: 'split_recipient'
  name: string
  reference: string | null
  /** Split payments naming it go through this provider. */
  provider: string
  bank: { id: string | null; name: string | null }
  account_number_last4: string
  account_name: string | null
  created_at: string
}

export interface CardControls {
  /** Minor units; null means no limit. */
  limits: { per_authorization: number | null; daily: number | null; monthly: number | null }
  channels: { pos?: boolean; web?: boolean; atm?: boolean; mobile?: boolean }
  /** Four-digit merchant category codes. */
  blocked_categories: string[]
}

export interface Cardholder {
  id: string
  object: 'cardholder'
  reference: string | null
  status: 'pending' | 'active' | 'inactive' | 'failed'
  name: string
  email: string | null
  phone: string | null
  billing_address: Json | null
  metadata: Json
  created_at: string
}

export interface Card {
  id: string
  object: 'card'
  reference: string | null
  cardholder: string
  programme: 'veyqo' | 'imported'
  brand: 'Verve' | 'MasterCard' | 'Visa'
  currency: 'NGN' | 'USD'
  /** `inactive` is frozen. */
  status: 'pending' | 'active' | 'inactive' | 'canceled' | 'failed'
  last4: string | null
  expiry_month: number | null
  expiry_year: number | null
  controls: CardControls
  cancellation_reason: string | null
  canceled_at: string | null
  metadata: Json
  created_at: string
}

export interface CardAuthorization {
  id: string
  object: 'card_authorization'
  card: string
  status: 'declined' | 'approved' | 'captured' | 'partially_captured' | 'reversed' | 'expired' | 'review' | 'pending'
  approved: boolean
  amount: number
  fee: number
  currency: string
  captured_amount: number
  decline_reason: string | null
  decided_by: 'rules' | 'balance' | 'merchant' | 'timeout'
  latency_ms: number
  merchant_reference: string | null
  merchant: { name: string | null; category: string | null; city: string | null; country: string | null }
  channel: string | null
  transaction_type: string | null
  created_at: string
}

export interface CardTransaction {
  id: string
  object: 'card_transaction'
  card: string
  authorization: string | null
  type: 'capture' | 'refund'
  amount: number
  currency: string
  merchant_name: string | null
  created_at: string
}

export interface CardBalance {
  id: string
  object: 'card_balance'
  currency: string
  available: number
  posted: number
  held: number
  low_threshold: number | null
  updated_at: string
}

/** What your authorization endpoint receives: verify with verifyCardAuthorization(). */
export interface CardAuthorizationRequest {
  id: string
  type: 'card.authorization.request'
  test?: boolean
  created_at: string
  environment: 'sandbox' | 'live'
  data: { authorization: CardAuthorization; card: Card }
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
    create(body: TransferCreateParams, options?: RequestOptions): Promise<Transfer>
    list(query?: { status?: Transfer['status']; page?: number; per_page?: number }): Promise<Page<Transfer>>
    retrieve(transferId: string): Promise<Transfer>
    /** Up to 200 transfers sent one by one in the background (payroll, vendor payouts). */
    batches: {
      create(
        body: {
          /** Identifies the batch: the same reference twice is refused. */
          reference: string
          provider?: string
          transfers: {
            amount: number
            bank?: string
            bank_code?: string
            account_number: string
            account_name?: string
            narration?: string
            reference?: string
          }[]
        },
        options?: RequestOptions,
      ): Promise<TransferBatch>
      retrieve(batchId: string): Promise<TransferBatch>
    }
  }
  /** What each connected provider account holds, in the smallest unit. */
  balances: { list(): Promise<Balance[]> }
  /** Saved bank accounts, name-checked when saved; send to one with transfers.create({ beneficiary }). */
  beneficiaries: {
    create(
      body: { bank?: string; bank_code?: string; account_number: string; provider?: string; label?: string },
      options?: RequestOptions,
    ): Promise<Beneficiary>
    list(query?: { page?: number; per_page?: number }): Promise<Page<Beneficiary>>
    del(beneficiaryId: string): Promise<{ id: string; deleted: true }>
  }
  /** A permanent account number per customer; each confirmed deposit becomes a succeeded payment. */
  virtualAccounts: {
    create(
      body: {
        customer: { email: string; name?: string; phone?: string; /** 11 digits; Flutterwave needs it. */ bvn?: string }
        provider?: string
        reference?: string
        metadata?: Json
      },
      options?: RequestOptions,
    ): Promise<VirtualAccount>
    list(query?: { page?: number; per_page?: number }): Promise<Page<VirtualAccount>>
    /** By id (va_…) or your reference. */
    retrieve(accountId: string): Promise<VirtualAccount>
  }
  /** Who can take a share of a payment (payments.create({ split })). */
  splitRecipients: {
    create(
      body: {
        name: string
        bank?: string
        bank_code?: string
        account_number: string
        provider?: string
        reference?: string
        email?: string
        phone?: string
      },
      options?: RequestOptions,
    ): Promise<SplitRecipient>
    list(query?: { page?: number; per_page?: number }): Promise<Page<SplitRecipient>>
    /** By id (spr_…) or your reference. */
    retrieve(recipientId: string): Promise<SplitRecipient>
  }
  /** People cards are issued to. */
  cardholders: {
    create(
      body: {
        first_name: string
        last_name: string
        email?: string
        phone?: string
        date_of_birth?: string
        /** Passed to the issuer, never stored by Veyqo. */
        identity?: { type: 'BVN' | 'NIN'; number: string }
        billing_address: { line1: string; line2?: string; city: string; state: string; postal_code: string; country: string }
        programme?: 'veyqo' | 'imported'
        reference?: string
        metadata?: Json
      },
      options?: RequestOptions,
    ): Promise<Cardholder>
    list(query?: { page?: number; per_page?: number }): Promise<Page<Cardholder>>
    retrieve(cardholderId: string): Promise<Cardholder>
  }
  /** Virtual cards. Only the last four digits are ever returned. */
  cards: {
    create(
      body: { cardholder: string; brand: string; currency: string; controls?: Partial<CardControls>; reference?: string; metadata?: Json },
      options?: RequestOptions,
    ): Promise<Card>
    list(query?: { page?: number; per_page?: number; status?: string; cardholder?: string }): Promise<Page<Card>>
    retrieve(cardId: string): Promise<Card>
    update(cardId: string, body: { status?: 'active' | 'inactive'; controls?: Partial<CardControls> }): Promise<Card>
    cancel(cardId: string, reason: 'lost' | 'stolen', options?: RequestOptions): Promise<Card>
    revealToken(cardId: string): Promise<{ token: string; card_id: string; vault: { id: string; url: string; script_url: string }; expires_in: number }>
    /** Sandbox only. */
    simulateAuthorization(cardId: string, body: { amount: number; channel?: string; merchant_name?: string; merchant_category?: string }, options?: RequestOptions): Promise<Json>
  }
  cardAuthorizations: {
    list(query?: { page?: number; per_page?: number; card?: string; status?: string }): Promise<Page<CardAuthorization>>
    retrieve(authorizationId: string): Promise<CardAuthorization>
    /** Sandbox only. */
    simulateReversal(authorizationId: string): Promise<Json>
  }
  cardTransactions: {
    list(query?: { page?: number; per_page?: number; card?: string }): Promise<Page<CardTransaction>>
    retrieve(transactionId: string): Promise<CardTransaction>
  }
  /** The prepaid balance on Veyqo's card programme. */
  cardBalance: {
    retrieve(): Promise<{ balances: CardBalance[]; fees: Json[] }>
    entries(query?: { page?: number; per_page?: number; currency?: string }): Promise<Page<Json>>
    topUp(body: { currency: string; amount: number; email: string }, options?: RequestOptions): Promise<{ status: 'awaiting_payment' | 'credited'; checkout_url: string | null }>
    setLowThreshold(body: { currency: string; low_threshold: number | null }): Promise<CardBalance>
    withdraw(
      body: { currency: string; amount: number; bank_code: string; bank_name?: string; account_number: string; account_name: string },
      options?: RequestOptions,
    ): Promise<Json>
    withdrawals(query?: { page?: number; per_page?: number }): Promise<Page<Json>>
  }
  cardProgrammes: {
    list(): Promise<Json[]>
    /** Returns the signing secret the first time only. */
    setAuthorizationEndpoint(type: 'veyqo' | 'imported', url: string | null): Promise<Json & { signing_secret: string | null }>
    rotateSecret(type: 'veyqo' | 'imported'): Promise<{ signing_secret: string }>
    testEndpoint(type: 'veyqo' | 'imported'): Promise<Json>
    importCards(body: { dry_run: boolean }): Promise<Json>
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

export declare function verifyCardAuthorization(
  rawBody: string | Buffer,
  headers: Headers | Record<string, string | string[] | undefined>,
  secret: string,
  options?: { tolerance?: number; now?: number },
): CardAuthorizationRequest

export declare function cardAuthorizationResponse(answer: {
  approved: boolean
  reference?: string
  declineReason?: string
}): { approved: boolean; reference?: string; decline_reason?: string }

export default Veyqo
