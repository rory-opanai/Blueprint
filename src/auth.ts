import { PrismaAdapter } from "@auth/prisma-adapter";
import { getServerSession } from "next-auth/next";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const googleClientId = process.env.NEXTAUTH_GOOGLE_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleClientSecret =
  process.env.NEXTAUTH_GOOGLE_SECRET ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET;

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt" as const
  },
  secret: process.env.NEXTAUTH_SECRET,
  providers:
    googleClientId && googleClientSecret
      ? [
          GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret
          })
        ]
      : [],
  pages: {
    signIn: "/api/auth/signin"
  }
};

export function getAppSession() {
  return getServerSession(authOptions);
}
