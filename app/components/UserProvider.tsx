"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/session";
import type { EditPerms } from "@/lib/permissions";

type CurrentUser = { user: SessionUser; perms: EditPerms };

const UserContext = createContext<CurrentUser | null>(null);

/** Makes the logged-in user and their edit permissions (read by the server layout) available to
 *  every client component under it via useCurrentUser() / useEditPerms(). */
export function UserProvider({ user, perms, children }: CurrentUser & { children: React.ReactNode }) {
  return <UserContext.Provider value={{ user, perms }}>{children}</UserContext.Provider>;
}

function useCurrent(): CurrentUser {
  const value = useContext(UserContext);
  if (!value) throw new Error("useCurrentUser must be used inside <UserProvider>");
  return value;
}

export function useCurrentUser(): SessionUser {
  return useCurrent().user;
}

export function useEditPerms(): EditPerms {
  return useCurrent().perms;
}
