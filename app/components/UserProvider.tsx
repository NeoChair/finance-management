"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/session";

const UserContext = createContext<SessionUser | null>(null);

/** Makes the logged-in user (read from the session cookie by the server layout) available to
 *  every client component under it via useCurrentUser(). */
export function UserProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser must be used inside <UserProvider>");
  return user;
}
