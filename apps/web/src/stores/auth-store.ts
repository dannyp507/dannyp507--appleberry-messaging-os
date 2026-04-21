import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified?: boolean;
}

export interface AuthStore {
  accessToken: string | null;
  refreshToken: string | null;
  workspaceId: string | null;
  organizationId: string | null;
  user: SessionUser | null;
  setSession: (data: {
    accessToken: string;
    refreshToken: string;
    workspaceId: string;
    organizationId: string;
    user: SessionUser;
  }) => void;
  setTokens: (
    accessToken: string,
    refreshToken: string,
    workspaceId: string,
  ) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      workspaceId: null,
      organizationId: null,
      user: null,
      setSession: (data) =>
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          workspaceId: data.workspaceId,
          organizationId: data.organizationId,
          user: data.user,
        }),
      setTokens: (accessToken, refreshToken, workspaceId) =>
        set({ accessToken, refreshToken, workspaceId }),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          workspaceId: null,
          organizationId: null,
          user: null,
        }),
    }),
    {
      name: "appleberry-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        workspaceId: s.workspaceId,
        organizationId: s.organizationId,
        user: s.user,
      }),
    },
  ),
);
