import { describe, it, expect } from 'vitest';
import {
  stellarAddressSchema,
  amountSchema,
  emailSchema,
  assetCodeSchema,
  memoSchema,
  paymentSchema,
  registrationSchema,
  validatePayment,
  validateRegistration,
} from '../../src/lib/validation';

// Deterministic PRKG for reproducible fuzzing.
function mulMul32(a: number): number {
  let t = (a + 0x6d2b79d5) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 0xc2b2e35f) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x27d4eb2d) >>> 0;
  return t >>> 0;
}

class Rrng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = mulMul32(this.state);
    return this.state;
  }
  int(min: number, max: number): number {
    return min + (this.next() % (max - min + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_+=[]{};:,.<>/?~\\|`#"';

const STELLAR_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomString(rrng: Rrng, minLen: number, maxLen: number): string {
  const len = rrng.int(minLen, maxLen);
  let out = '';
  for (let i = 0; i < len; i++) out += rrng.pick(CHARSET.split(''));
  return out;
}

function randomStellarAddress(rrng: Rrng): string {
  let out = 'G';
  for (let i = 0; i < 55; i++) out += rrng.pick(STELLAR_BASE32.split(''));
  return out;
}

function randomJsValue(rrng: Rrng, depth = 0): unknown {
  const kind = rrng.int(0, depth > 2 ? 6 : 9);
  switch (kind) {
    case 0: return null;
    case 1: return undefined;
    case 2: return rrng.int(-1, 0) === 0;
    case 3: return rrng.int(-Math.pow(2, 31), Math.pow(2, 31) - 1);
    case 4: return rrng.next() / 0x7fffffff;
    case 5: return randomString(rrng, 0, 64);
    case 6: return randomStellarAddress(rrng);
    case 7: return randomString(rrng, 0, 12);
    case 8: return randomString(rrng, 0, 28);
    default: {
      const object: Record<string, unknown> = {};
      const keys = ['destination', 'amount', 'assetCode', 'memo', 'email', 'walletAddress', 'referralCode'];
      const count = rrng.int(0, keys.length);
      for (let i = 0; i < count; i++) {
        object[rrng.pick(keys)] = randomJsValue(rrng, depth + 1);
      }
      return object;
    }
  }
}

function isStellarAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^G[A-Z2-7]{55}$/.test(value);
}

function isPositiveFiniteNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return false;
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0;
  }
  return false;
}

function isEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isAssetCode(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 12 && /^[A-Z0-9]+$/.test(trimmed);
}

function isMemo(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.trim().length <= 28;
}

describe('Validation schemas - fuzzing', () => {
  const ITERATIONS = 2500;

  it('stellarAddressSchema never false-positives on random inputs', () => {
    const rrng = new Rrng(0x12345678);
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomJsValue(rrng);
      const result = stellarAddressSchema.safeParse(input);
      if (result.success) {
        expect(isStellarAddress(input)).toBe(true);
      } else {
        expect(isStellarAddress(input)).toBe(false);
        expect(result.error.issues[0].message).toBe('Invalid Stellar address');
      }
    }
  });

  it('amountSchema never false-positives on random inputs', () => {
    const rrng = new Rrng(0xdeadbeef);
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomJsValue(rrng);
      const result = amountSchema.safeParse(input);
      if (result.success) {
        expect(isPositiveFiniteNumber(input)).toBe(true);
        expect(Number.isFinite(result.data)).toBe(true);
        expect(result.data).toBeGreaterThan(0);
      } else {
        expect(isPositiveFiniteNumber(input)).toBe(false);
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it('emailSchema never false-positives on random inputs', () => {
    const rrng = new Rrng(0xcafefeed);
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomJsValue(rrng);
      const result = emailSchema.safeParse(input);
      if (result.success) {
        expect(isEmail(input)).toBe(true);
        expect(result.data).toBe(typeof input === 'string' ? input.trim().toLowerCase() : result.data);
      } else {
        expect(isEmail(input)).toBe(false);
        expect(result.error.issues[0].message).toBe('Invalid email address');
      }
    }
  });

  it('assetCodeSchema never false-positives on random inputs', () => {
    const rrng = new Rrng(0xfeedface);
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomJsValue(rrng);
      const result = assetCodeSchema.safeParse(input);
      if (result.success) {
        expect(isAssetCode(input)).toBe(true);
      } else {
        expect(isAssetCode(input)).toBe(false);
        const messages = result.error.issues.map((o) => o.message);
        const allowed = [
          'Asset code is required',
          'Asset code must be at most 12 characters',
          'Asset code must be alphanumeric uppercase',
        ];
        for (const m of messages) expect(allowed).toContain(m);
      }
    }
  });

  it('memoSchema never false-positives on random inputs', () => {
    const rrng = new Rrng(0xbadcafe0);
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomJsValue(rrng);
      const result = memoSchema.safeParse(input);
      if (result.success) {
        expect(isMemo(input)).toBe(true);
      } else {
        expect(isMemo(input)).toBe(false);
        expect(result.error.issues[0].message).toBe('Memo must be at most 28 characters');
      }
    }
  });

  it('paymentSchema is consistent with field schemas on random objects', () => {
    const rrng = new Rrng(0x00000001);
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomJsValue(rrng);
      const result = paymentSchema.safeParse(input);
      if (result.success) {
        const data = result.data;
        expect(isStellarAddress(data.destination)).toBe(true);
        expect(isPositiveFiniteNumber(data.amount)).toBe(true);
        expect(isAssetCode(data.assetCode)).toBe(true);
        if (data.memo !== undefined) expect(isMemo(data.memo)).toBe(true);
      } else {
        expect(result.error.issues.length).toBeGreaterThan(0);
        for (const issue of result.error.issues) {
          expect(issue.message.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('registrationSchema is consistent on random objects', () => {
    const rrng = new Rrng(0x00000002);
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomJsValue(rrng);
      const result = registrationSchema.safeParse(input);
      if (result.success) {
        expect(isEmail(result.data.email)).toBe(true);
        expect(isStellarAddress(result.data.walletAddress)).toBe(true);
      } else {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it('validatePayment and validateRegistration match safeParse results', () => {
    const rrng = new Rrng(0x00000003);
    for (let i = 0; i < 500; i++) {
      const input = randomJsValue(rrng);
      const payment = validatePayment(input);
      const directPayment = paymentSchema.safeParse(input);
      expect(payment.success).toBe(directPayment.success);
      const reg = validateRegistration(input);
      const directReg = registrationSchema.safeParse(input);
      expect(reg.success).toBe(directReg.success);
    }
  });

  it('accepts well-formed payment payloads', () => {
    const payload = {
      destination: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGF',
      amount: '12.5',
      assetCode: 'USDC',
      memo: 'hello',
    };
    const result = paymentSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(12.5);
      expect(result.data.assetCode).toBe('USDC');
    }
  });

  it('rejects wrong-typed payment payloads with accurate messages', () => {
    const result = paymentSchema.safeParse({
      destination: 'not-an-address',
      amount: -1,
      assetCode: 'too-long-asset-code',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Invalid Stellar address');
      expect(messages.some((m) => m.length > 0)).toBe(true);
    }
  });
});
