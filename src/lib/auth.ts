export interface SessionUser {
  id: string;
  githubId: number;
  username: string;
  avatarUrl: string;
}

export interface Session {
  user: SessionUser;
}

export interface AuthResult {
  session?: Session;
  redirect?: string;
}

export function getSession(rawSession: Session | null): Session | null {
  if (!rawSession || !rawSession.user) return null;
  return rawSession;
}

export function requireAuth(rawSession: Session | null, currentPath: string): AuthResult {
  const session = getSession(rawSession);
  if (!session) {
    return { redirect: `/auth/login?callbackUrl=${encodeURIComponent(currentPath)}` };
  }
  return { session };
}
