import { SignJWT, jwtVerify } from "jose";

export type SessionUser = {
  usrId: string;
  usrNm: string;
  usrTypCd: string;
  ownrEtpCd: string;
  email: string | null;
};

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
const SESSION_COOKIE = "ihs_session";
const SESSION_TTL = "12h";

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/** Cookie options for the session token (login and first-login password change). */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
};

export { SESSION_COOKIE };
