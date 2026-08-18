/**
 * The console's one door to the API.
 *
 * Tokens live in memory plus sessionStorage — NOT localStorage — so closing the tab ends
 * the administrator's session on that machine. A 401 anywhere clears the session and
 * bounces to the sign-in screen rather than leaving half-dead screens on the page.
 */

export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, ''),
};

const SESSION_KEY = 'vacancy.admin.session';

export type Session = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  name: string;
  email?: string | null;
};

let current: Session | null = null;
const listeners = new Set<(session: Session | null) => void>();

export function loadSession(): Session | null {
  if (current) return current;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    current = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    current = null;
  }
  return current;
}

export function setSession(session: Session | null) {
  current = session;
  try {
    if (session) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch { /* storage disabled; memory still works for this tab */ }
  listeners.forEach(listener => listener(session));
}

export function onSessionChange(listener: (session: Session | null) => void): () => void {
  listeners.add(listener);
  // Explicit void body: Set.delete returns a boolean, which React refuses as a cleanup.
  return () => { listeners.delete(listener); };
}

export class ApiError extends Error {
  // Declared and assigned longhand: a constructor parameter property is TypeScript-only
  // syntax, which `erasableSyntaxOnly` rejects.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip the auth header — only the sign-in call does this. */
  anonymous?: boolean;
};

/** The API wraps everything as { status, message, data }. */
type Envelope<T> = { status?: number; message?: string; data?: T };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = options.anonymous ? null : loadSession();
  const headers: Record<string, string> = { Accept: 'application/json' };

  // FormData carries its own multipart content type, complete with the boundary the
  // server needs to split the parts. Setting Content-Type ourselves would overwrite that
  // boundary and the upload would arrive as one unreadable blob.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined
        : isFormData ? (options.body as FormData)
        : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(`Cannot reach the API at ${config.apiBaseUrl}. Is it running?`, 0);
  }

  if (response.status === 401 && !options.anonymous) {
    setSession(null);
    throw new ApiError('Your session expired — sign in again.', 401);
  }

  const text = await response.text();
  let payload: Envelope<T> | null = null;
  try {
    payload = text.trim() ? (JSON.parse(text) as Envelope<T>) : null;
  } catch {
    // A non-JSON body means a proxy or a crash page, not the API.
    throw new ApiError(`Unexpected response (${response.status}) from the API.`, response.status);
  }

  if (!response.ok || payload?.status === 0) {
    throw new ApiError(payload?.message?.trim() || `Request failed (${response.status}).`, response.status);
  }

  return payload?.data as T;
}
