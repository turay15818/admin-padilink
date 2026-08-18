/**
 * Sign-in over the platform's encrypted envelope.
 *
 * The API does not accept a plaintext password — the browser fetches the server's public
 * key, seals the credentials with a one-time AES-256-GCM key, wraps that key with RSA-OAEP,
 * and posts the envelope. This mirrors `padilink-web/src/lib/secureClient.ts` and the mobile
 * client exactly; the console gets no special back door, which is the point.
 */
import { ApiError, config, loadSession } from './client';

/* ---------- bytes ---------- */
// The buffer type is spelled out: since TS 5.7 a bare Uint8Array may be backed by a
// SharedArrayBuffer, and WebCrypto refuses shared memory.
function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) out[index] = binary.charCodeAt(index);
  return out;
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  return b64ToBytes(pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, ''));
}

/* ---------- server public key ---------- */
let publicKeyCache: string | null = null;

async function publicKeyPem(): Promise<string> {
  if (publicKeyCache) return publicKeyCache;
  const response = await fetch(`${config.apiBaseUrl}/api/v1/security/public-key`, {
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : null;
  const pem = payload?.data?.publicKeyPem as string | undefined;
  if (!response.ok || !pem) {
    throw new ApiError('Could not load the security key from the API.', response.status);
  }
  publicKeyCache = pem;
  return pem;
}

/* ---------- envelope ---------- */
async function seal(payload: unknown) {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));

  const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, plain));
  // WebCrypto appends the 16-byte tag; the server wants them as separate fields.
  const cipherText = sealed.slice(0, sealed.length - 16);
  const tag = sealed.slice(sealed.length - 16);

  const rsaKey = await crypto.subtle.importKey(
    'spki', pemToDer(await publicKeyPem()), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const encryptedKey = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, keyBytes));

  return {
    envelope: {
      encryptedKey: `enc:${bytesToB64(encryptedKey)}`,
      iv: bytesToB64(iv),
      tag: bytesToB64(tag),
      cipherText: bytesToB64(cipherText),
      nonce: bytesToB64(crypto.getRandomValues(new Uint8Array(16))),
      timestampUtc: new Date().toISOString(),
    },
    keyBytes,
  };
}

async function unseal<T>(text: string, keyBytes: Uint8Array<ArrayBuffer>): Promise<{ status?: number; message?: string; data?: T } | null> {
  const parsed = text.trim() ? JSON.parse(text) : null;
  if (!parsed) return null;
  if (!('cipherText' in parsed && 'iv' in parsed && 'tag' in parsed)) return parsed;

  const iv = b64ToBytes(parsed.iv as string);
  const cipherText = b64ToBytes(parsed.cipherText as string);
  const tag = b64ToBytes(parsed.tag as string);
  const combined = new Uint8Array(cipherText.length + tag.length);
  combined.set(cipherText, 0);
  combined.set(tag, cipherText.length);

  const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, combined);
  return JSON.parse(new TextDecoder().decode(plain));
}

/**
 * POST an encrypted envelope.
 *
 * Carries the session token when there is one. Not every caller needs it — the two sign-in
 * steps are anonymous by necessity — but the password endpoints are behind
 * `PermissionAuthorize(ManageUsers)`, and without this header they answer 401 no matter how
 * correct the payload is. That is a silent failure: the envelope seals, the request goes
 * out, and the only symptom is a refusal that reads like a wrong password.
 */
export async function securePost<T>(path: string, payload: unknown): Promise<T> {
  const { envelope, keyBytes } = await seal(payload);
  const session = loadSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(envelope),
    });
  } catch {
    throw new ApiError(`Cannot reach the API at ${config.apiBaseUrl}. Is it running?`, 0);
  }

  const decoded = await unseal<T>(await response.text(), keyBytes);
  if (!response.ok || decoded?.status === 0) {
    // 401 here means the token, not the payload — say so rather than blaming the password.
    if (response.status === 401) {
      throw new ApiError('Your session expired — sign in again.', 401);
    }
    throw new ApiError(decoded?.message?.trim() || `That did not work (${response.status}).`, response.status);
  }
  return decoded?.data as T;
}

/* ---------- this device ---------- */

/**
 * A stable identifier for this browser, so the API can recognise the console as a device
 * it has seen before — and say so, loudly, when it hasn't.
 *
 * The id is a random UUID kept in localStorage. It is deliberately NOT derived from a
 * fingerprint: we want a value the person can throw away by clearing site data, and one
 * that identifies the browser rather than the human behind it. The server never stores it
 * raw either — it keeps a hash.
 */
const DEVICE_KEY = 'vacancy.admin.deviceId';

function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    // Storage disabled (private window, blocked cookies). Every sign-in then looks like a
    // new device, which is the safe direction to fail in.
    return crypto.randomUUID();
  }
}

/** Order matters: Edge and Chrome both claim "Chrome", Chrome claims "Safari". */
function browserName(agent: string): string {
  if (/edg\//i.test(agent)) return 'Edge';
  if (/opr\/|opera/i.test(agent)) return 'Opera';
  if (/chrome|crios/i.test(agent)) return 'Chrome';
  if (/firefox|fxios/i.test(agent)) return 'Firefox';
  if (/safari/i.test(agent)) return 'Safari';
  return 'Browser';
}

function osName(agent: string, platform: string): string {
  const both = `${agent} ${platform}`;
  if (/windows/i.test(both)) return 'Windows';
  if (/iphone|ipad|ipod/i.test(both)) return 'iOS';
  if (/android/i.test(both)) return 'Android';
  if (/mac os x|macintosh|macintel/i.test(both)) return 'macOS';
  if (/cros/i.test(both)) return 'ChromeOS';
  if (/linux/i.test(both)) return 'Linux';
  return 'an unknown system';
}

/** Mirrors AdminDeviceInfo on the server, field for field. */
export type AdminDevice = {
  deviceIdentifier: string;
  browser: string;
  operatingSystem: string;
  platform: string;
  screenSize: string;
  timeZone: string;
  language: string;
};

/**
 * What this browser is willing to say about itself. Shown on the sign-in screen before
 * anything is sent, so the administrator sees exactly what travels with their attempt.
 */
export function describeDevice(): AdminDevice {
  const agent = navigator.userAgent || '';
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform || navigator.platform || '';
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch { /* ancient browser; the field is optional on the server */ }

  return {
    deviceIdentifier: deviceId(),
    browser: browserName(agent),
    operatingSystem: osName(agent, platform),
    platform: platform || 'web',
    screenSize: `${window.screen?.width ?? 0}×${window.screen?.height ?? 0}`,
    timeZone: timeZone || 'UTC',
    language: navigator.language || 'en',
  };
}

/** The shape the device-registration endpoints expect, built from the same facts. */
export function deviceRegistration() {
  const device = describeDevice();
  return {
    deviceName: `Vacancy Admin · ${device.browser}`,
    deviceIdentifier: device.deviceIdentifier,
    deviceModel: device.browser,
    operatingSystem: device.operatingSystem,
    appVersion: '1.0.0',
    firebaseToken: `admin-${device.deviceIdentifier}`,
    appType: 'web',
  };
}
