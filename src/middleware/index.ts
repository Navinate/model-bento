import { defineMiddleware } from 'astro:middleware';
import { getSession } from '../lib/auth';
import { isAdmin } from '../lib/admin';

export const onRequest = defineMiddleware(async (context, next) => {
  // Only gate /admin routes
  if (!context.url.pathname.startsWith('/admin')) {
    return next();
  }

  // Get session from Auth.js
  const session = await (context.locals as any).auth?.();
  const validSession = getSession(session);

  // No session or not admin → 404 (not 403, to hide route existence)
  if (!validSession || !isAdmin(validSession.user.githubId)) {
    return new Response(null, { status: 404 });
  }

  return next();
});
