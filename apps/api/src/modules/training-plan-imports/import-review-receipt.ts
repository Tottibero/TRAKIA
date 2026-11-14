import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const RECEIPT_TTL_MS = 15 * 60 * 1000
const RECEIPT_KEY_ID = 'v1'

export interface ImportReviewReceiptClaims {
  version: 1
  keyId: typeof RECEIPT_KEY_ID
  userId: string
  origin: string
  planKey: string
  documentHash: string
  proposalHash: string
  planVersion: number | null
  issuedAt: number
  expiresAt: number
}

export class InvalidImportReviewReceiptError extends Error {
  readonly code = 'INVALID_OR_EXPIRED_REVIEW_RECEIPT'

  constructor() {
    super('The import review receipt is invalid or expired; review the document again.')
    this.name = 'InvalidImportReviewReceiptError'
  }
}

export class ImportReviewReceiptService {
  private readonly signingKey: Buffer

  constructor(jwtSecret: string) {
    if (Buffer.byteLength(jwtSecret, 'utf8') < 32)
      throw new Error('Import receipt signing key is unavailable.')
    this.signingKey = createHmac('sha256', jwtSecret)
      .update('trakia:training-plan-import:receipt:v1')
      .digest()
  }

  issue(
    claims: Omit<ImportReviewReceiptClaims, 'version' | 'keyId' | 'issuedAt' | 'expiresAt'>,
    now = Date.now(),
  ): string {
    const payload: ImportReviewReceiptClaims = {
      ...claims,
      version: 1,
      keyId: RECEIPT_KEY_ID,
      issuedAt: now,
      expiresAt: now + RECEIPT_TTL_MS,
    }
    const encoded = Buffer.from(stableJson(payload)).toString('base64url')
    return `${encoded}.${this.sign(encoded)}`
  }

  verify(token: string, now = Date.now()): ImportReviewReceiptClaims {
    try {
      const [encoded, signature, extra] = token.split('.')
      if (!encoded || !signature || extra !== undefined) throw new Error()
      const expected = Buffer.from(this.sign(encoded))
      const actual = Buffer.from(signature)
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error()
      const value = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Partial<ImportReviewReceiptClaims>
      if (
        value.version !== 1 ||
        value.keyId !== RECEIPT_KEY_ID ||
        typeof value.userId !== 'string' ||
        !value.userId ||
        typeof value.origin !== 'string' ||
        typeof value.planKey !== 'string' ||
        !isHash(value.documentHash) ||
        !isHash(value.proposalHash) ||
        !(
          value.planVersion === null ||
          (Number.isSafeInteger(value.planVersion) && value.planVersion! > 0)
        ) ||
        !Number.isSafeInteger(value.issuedAt) ||
        !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt! - value.issuedAt! !== RECEIPT_TTL_MS ||
        value.issuedAt! > now ||
        value.expiresAt! <= now
      )
        throw new Error()
      return value as ImportReviewReceiptClaims
    } catch {
      throw new InvalidImportReviewReceiptError()
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.signingKey).update(value).digest('base64url')
  }
}

export function canonicalJson(value: unknown): string {
  return stableJson(value)
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}
