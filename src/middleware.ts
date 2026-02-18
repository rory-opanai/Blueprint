import { withAuth } from "next-auth/middleware";

export default withAuth();

export const config = {
  matcher: [
    "/((?!api/auth|api/slack/events|api/connectors/[^/]+/callback|_next/static|_next/image|favicon.ico).*)"
  ]
};
