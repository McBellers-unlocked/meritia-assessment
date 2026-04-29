import { NextAuthOptions } from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import { prisma } from "./prisma";

// UNIQAssess has a single authenticated role (ADMIN). We still use Cognito for
// sign-in so a production deployment can use an existing user pool, but we
// strip the Callater-style role ladder (student/examiner/etc.). Every user
// who can sign in becomes an admin — so the operator must keep the user pool
// tight (invite-only).
const cognitoClientId = process.env.COGNITO_CLIENT_ID;
const cognitoIssuer = process.env.COGNITO_ISSUER;
const nextAuthSecret = process.env.NEXTAUTH_SECRET;

if (!cognitoClientId || !cognitoIssuer) {
  console.warn(
    "[auth] Cognito env vars missing (COGNITO_CLIENT_ID / COGNITO_ISSUER). " +
      "Admin sign-in will fail until these are set."
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    CognitoProvider({
      clientId: cognitoClientId ?? "",
      clientSecret: "",
      issuer: cognitoIssuer ?? "",
      checks: ["pkce", "nonce"],
      client: {
        token_endpoint_auth_method: "none",
      },
    }),
  ],
  secret: nextAuthSecret,
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name },
        create: {
          email: user.email,
          name: user.name,
          role: "ADMIN",
        },
      });

      return true;
    },
    async jwt({ token }) {
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email as string },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string | undefined;
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
