export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const listeners = new Set<() => void>();
export const onUnauthorized = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const api = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'You are offline.');
  }
  if (res.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/session')) {
    listeners.forEach((fn) => fn());
    throw new ApiError(401, 'Signed out');
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const msg = (json as { error?: string; issues?: string[] } | null)?.issues?.join('. ') ?? (json as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return json as T;
};
