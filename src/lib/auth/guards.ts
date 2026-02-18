import { getAppSession } from "@/auth";
import { prisma } from "@/lib/prisma";

export class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

function localBypassEnabled(): boolean {
  return process.env.LOCAL_DEMO_BYPASS_AUTH === "true";
}

async function ensureUserProfile(input: {
  email: string;
  name?: string | null;
  role?: "AD" | "SE" | "SA" | "MANAGER";
}) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name ?? undefined,
      role: input.role ?? undefined
    },
    create: {
      email: input.email,
      name: input.name ?? undefined,
      role: input.role ?? "AD"
    }
  });
}

export async function requireUserSession() {
  const session = await getAppSession();
  const user = session?.user;

  if (!user?.email && localBypassEnabled()) {
    const demo = await ensureUserProfile({
      email: process.env.LOCAL_DEMO_USER_EMAIL ?? "demo@blueprint.local",
      name: process.env.LOCAL_DEMO_USER_NAME ?? "Blueprint Demo User",
      role: "AD"
    });
    return {
      id: demo.id,
      email: demo.email ?? "demo@blueprint.local",
      role: demo.role ?? "AD",
      name: demo.name ?? "Blueprint Demo User"
    };
  }

  if (!user?.email) {
    throw new AuthRequiredError();
  }

  const dbUser = await ensureUserProfile({
    email: user.email,
    name: user.name,
    role: user.role
  });

  if (!dbUser) {
    throw new AuthRequiredError("User profile not found.");
  }

  return {
    id: dbUser.id,
    email: dbUser.email ?? user.email,
    role: dbUser.role ?? "AD",
    name: dbUser.name ?? user.name ?? user.email
  };
}
