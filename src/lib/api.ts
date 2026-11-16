import { handleStandaloneRequest } from './standaloneStore.ts';

const TOKEN_KEY = 'sufra_erp_token';

export function isStandaloneDesktopFileMode(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();

  if (isStandaloneDesktopFileMode()) {
    return handleStandaloneRequest<T>(path, options, token);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMsg = 'حدث خطأ في الاتصال بالخادم';
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) errMsg = data.error;
    } catch {
      // ignore json parse failure
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}
