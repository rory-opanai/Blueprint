declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      role?: "AD" | "SE" | "SA" | "MANAGER";
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: "AD" | "SE" | "SA" | "MANAGER";
  }
}
