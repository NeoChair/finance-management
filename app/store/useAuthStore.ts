import { create } from "zustand";

export type AuthUser = {
  usrId: string;
  usrNm: string;
  usrTypCd: string;
  ownrEtpCd: string;
  email: string | null;
};

type AuthState = {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
