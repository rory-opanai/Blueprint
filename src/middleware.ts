import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CALLBACK_PATH_REGEX = /^\/api\/connectors\/[^/]+\/callback$/;

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/slack/events") ||
    CALLBACK_PATH_REGEX.test(pathname) ||
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });

  if (token) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/api/auth/signin", request.url);
  signInUrl.searchParams.set("callbackUrl", request.url);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/((?!api/auth|api/slack/events|api/connectors/[^/]+/callback|_next/static|_next/image|favicon.ico).*)"
  ]
};
