// Inbound message parsing and validation. Everything a client sends is untrusted.

export const MAX_MESSAGE_BYTES = 2048;
export const MAX_CHIPS = 1_000_000_000;
export const NICK_MAX = 20;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Message types a client may send, with the fields each one may carry. */
export const CLIENT_MESSAGES = Object.freeze({
  hello: ['secret', 'nick', 'lang'],
  ping: [],
  sit: ['seat'],
  stand: [],
  start: [],
  bet: ['amount'],
  hit: [],
  stay: [],
  xet: ['seat'],
  xetAll: [],
  addBot: [],
  removeBot: ['seat'],
  rebuy: ['amount'],
  settings: ['options'],
  setPublic: ['on'],
  history: [],
  kick: ['seat'],
  deleteTable: [],
  // Reserved for later games (validated by their engines):
  play: ['cards'],
  pass: [],
  fold: [],
  check: [],
  call: [],
  raise: ['amount'],
  allin: [],
});

export const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

export class ProtocolError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Parses and shape-checks a raw frame. Throws ProtocolError. */
export function parseMessage(raw) {
  if (typeof raw !== 'string') throw new ProtocolError('bad_frame');
  if (raw.length > MAX_MESSAGE_BYTES || new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) {
    throw new ProtocolError('too_large');
  }
  let msg;
  try {
    msg = JSON.parse(raw, (key, value) => {
      if (FORBIDDEN_KEYS.has(key)) throw new ProtocolError('forbidden_key');
      return value;
    });
  } catch (e) {
    throw e instanceof ProtocolError ? e : new ProtocolError('bad_json');
  }
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) throw new ProtocolError('bad_shape');
  if (Object.getPrototypeOf(msg) !== Object.prototype) throw new ProtocolError('bad_shape');
  if (!own(msg, 't') || typeof msg.t !== 'string' || !own(CLIENT_MESSAGES, msg.t)) {
    throw new ProtocolError('unknown_type');
  }
  const allowed = CLIENT_MESSAGES[msg.t];
  for (const k of Object.keys(msg)) {
    if (k !== 't' && !allowed.includes(k)) throw new ProtocolError('unknown_field');
  }
  return msg;
}

export function isChipAmount(v, { min = 1, max = MAX_CHIPS } = {}) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
}

export function isSeatIndex(v, seats) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < seats;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isSecret = (s) => typeof s === 'string' && UUID_RE.test(s);

/** Trims, strips control and bidi-override characters, caps length. */
export function cleanNick(s) {
  if (typeof s !== 'string') return '';
  const cleaned = s
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...cleaned].slice(0, NICK_MAX).join('');
}

export const CODE_RE = /^[A-Z]{3,8}-\d{3,4}$/;
export const normalizeCode = (s) => (typeof s === 'string' ? s.trim().toUpperCase() : '');

/** Token bucket: capacity tokens, refilled at rate tokens/second. */
export function takeToken(bucket, now, { capacity = 20, rate = 8 } = {}) {
  const elapsed = Math.max(0, (now - bucket.at) / 1000);
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * rate);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
