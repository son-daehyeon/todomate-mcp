import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const API_KEY = 'AIzaSyCtSjt1LBEXmQnZdjD8DOPXBc5I1acm0Ew';
const DB = 'https://firestore.googleapis.com/v1/projects/mate-914f3/databases/(default)/documents';
export const CONFIG_DIR = process.env.TODOMATE_CONFIG_DIR || path.join(os.homedir(), '.config', 'todomate-mcp');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');

export class TodomateError extends Error {}

export function saveCredentials(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${CREDENTIALS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, CREDENTIALS_FILE);
}

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

export function fromValue(v) {
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('nullValue' in v) return null;
  return Object.values(v)[0];
}

const fromFields = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));

export class Client {
  constructor(credentials) {
    try {
      Object.assign(this, credentials || JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8')));
    } catch {
      throw new TodomateError('로그인 정보가 없습니다. 터미널에서 `todomate-mcp login`을 실행하세요.');
    }
    this.persist = !credentials;
    this.idToken = null;
    this.expiresAt = 0;
  }

  async token() {
    if (this.idToken && Date.now() < this.expiresAt - 60_000) return this.idToken;
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.refreshToken }),
    });
    const data = await res.json();
    if (!data.id_token) throw new TodomateError('투두메이트 로그인이 만료되었습니다. `todomate-mcp login`을 다시 실행하세요.');
    this.idToken = data.id_token;
    this.expiresAt = Date.now() + Number(data.expires_in) * 1000;
    if (data.refresh_token && data.refresh_token !== this.refreshToken) {
      this.refreshToken = data.refresh_token;
      if (this.persist) saveCredentials({ uid: this.uid, email: this.email, refreshToken: this.refreshToken });
    }
    return this.idToken;
  }

  async firestore(method, pathAndQuery, body) {
    const res = await fetch(`${DB}${pathAndQuery}`, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const error = Array.isArray(data) ? data[0]?.error : data.error;
    if (!res.ok || error) throw new TodomateError(`투두메이트 요청 실패 (${res.status}): ${error?.message || ''}`);
    return data;
  }

  async query(structuredQuery) {
    const rows = await this.firestore('POST', ':runQuery', { structuredQuery });
    return rows.filter((r) => r.document).map((r) => fromFields(r.document.fields));
  }

  async get(collection, id) {
    return fromFields((await this.firestore('GET', `/${collection}/${encodeURIComponent(id)}`)).fields);
  }

  async create(collection, id, data) {
    await this.firestore('PATCH', `/${collection}/${encodeURIComponent(id)}?currentDocument.exists=false`, {
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])),
    });
  }

  async update(collection, id, data) {
    const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    await this.firestore('PATCH', `/${collection}/${encodeURIComponent(id)}?currentDocument.exists=true&${mask}`, {
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])),
    });
  }

  async remove(collection, id) {
    await this.firestore('DELETE', `/${collection}/${encodeURIComponent(id)}?currentDocument.exists=true`);
  }
}

export function autoId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(20), (b) => chars[b % chars.length]).join('');
}
