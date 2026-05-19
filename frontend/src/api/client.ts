import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

type TokenGetter = () => string | null;
type TokenSetter = (token: string | null) => void;

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

let getAccessToken: TokenGetter = () => null;
let setAccessToken: TokenSetter = () => undefined;
let onUnauthorized: () => void = () => undefined;

export function configureAuthTokenHandlers(
  getter: TokenGetter,
  setter: TokenSetter,
  unauthorizedHandler: () => void,
): void {
  getAccessToken = getter;
  setAccessToken = setter;
  onUnauthorized = unauthorizedHandler;
}

export const api: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        `${baseURL}/auth/refresh`,
        {},
        { withCredentials: true, headers: { 'Content-Type': 'application/json' } },
      )
      .then((res) => {
        const token = (res.data as { access_token: string }).access_token;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        onUnauthorized();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!original || !error.response) {
      return Promise.reject(error);
    }
    if (
      error.response.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh')
    ) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return api.request(original);
      }
    }
    return Promise.reject(error);
  },
);

export function extractErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { detail?: { message?: string } | string }
      | undefined;
    if (data && typeof data.detail === 'object' && data.detail?.message) {
      return data.detail.message;
    }
    if (data && typeof data.detail === 'string') {
      return data.detail;
    }
    if (error.message) {
      return error.message;
    }
  }
  return fallback;
}
