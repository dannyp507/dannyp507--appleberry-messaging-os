import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";

export const apiBaseURL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

export const api = axios.create({
  baseURL: apiBaseURL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

function getRefreshToken(): string | null {
  return useAuthStore.getState().refreshToken;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken, workspaceId } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (workspaceId) {
    config.headers["X-Workspace-Id"] = workspaceId;
  }
  return config;
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    const status = error.response?.status;

    if (status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;
    const refreshToken = getRefreshToken();

    try {
      const { data } = await axios.post<{
        accessToken: string;
        refreshToken: string;
        workspaceId: string;
      }>(
        `${apiBaseURL}/auth/refresh`,
        refreshToken ? { refreshToken } : {},
        { withCredentials: true },
      );

      useAuthStore.getState().setTokens(
        data.accessToken,
        data.refreshToken,
        data.workspaceId,
      );
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      original.headers["X-Workspace-Id"] = data.workspaceId;
      return api(original);
    } catch {
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }
  },
);

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (typeof data?.message === "string") return data.message;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return err.message || "Request failed";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
