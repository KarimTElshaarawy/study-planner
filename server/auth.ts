import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'cadence_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;

const sign = (secret: string, payload: string): string => createHmac('sha256', secret).update(`cadence-session:${payload}`).digest('base64url');

export const safeEqual = (a: string, b: string): boolean => {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
};

export const makeToken = (secret: string, nowMs: number): string => {
  const exp = String(Math.floor(nowMs / 1000) + MAX_AGE_S);
  return `${exp}.${sign(secret, exp)}`;
};

export const verifyToken = (secret: string, token: string | undefined, nowMs: number): boolean => {
  if (!token || !secret) return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac) return false;
  if (!safeEqual(mac, sign(secret, exp))) return false;
  return Number(exp) > nowMs / 1000;
};

export const cookieName = COOKIE;
export const cookieMaxAge = MAX_AGE_S;

/** Sliding window login throttle: 8 attempts per 5 minutes per key */
export class Throttle {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit = 8,
    private readonly windowMs = 5 * 60_000,
  ) {}
  allow(key: string, nowMs: number): boolean {
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.every((t) => nowMs - t >= this.windowMs)) this.hits.delete(k);
      if (this.hits.size > 5000) this.hits.clear();
    }
    const recent = (this.hits.get(key) ?? []).filter((t) => nowMs - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return true;
  }
}
