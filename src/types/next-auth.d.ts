import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id?: string;
      role?: "AD" | "SE" | "SA" | "MANAGER";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: "AD" | "SE" | "SA" | "MANAGER";
  }
}

export {};
