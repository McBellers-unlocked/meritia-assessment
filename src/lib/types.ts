// Module augmentation — tells TypeScript that UNIQAssess's session + JWT carry
// extra fields (`id`, `role`) set by the NextAuth callbacks in lib/auth.ts.
// TypeScript picks this up automatically because tsconfig.json includes
// src/**/*.ts. No explicit import is needed from consumers.

import { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
