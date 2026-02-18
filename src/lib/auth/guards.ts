import { getAppSession } from "@/auth";
import { prisma } from "@/lib/prisma";

export class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export async function requireUserSession() {
  const session = await getAppSession();
  const user = session?.user;

  if (!user?.email) {
    throw new AuthRequiredError();
  }

  const dbUser = await prisma.user.findUnique({
    where: {
      email: user.email
    }
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
