import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const { pathname } = req.nextUrl;

  const isLoginPage = pathname === "/";

  // API calls get a 401 instead of a redirect. Handlers that record who changed something still
  // read the user themselves (getSessionUser), so they don't depend on this check alone.
  if (pathname.startsWith("/api/")) {
    if (!session && !pathname.startsWith("/api/auth/")) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
