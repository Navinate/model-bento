import { defineMiddleware } from 'astro:middleware';
import { getSession as getAuthSession } from 'auth-astro/server';
import { getSession } from '../lib/auth';
import { isAdmin } from '../lib/admin';
import { startBatchPoller } from '../lib/services/batch-poller';

// Start the background poller once on first request
startBatchPoller();

export const onRequest = defineMiddleware(async (context, next) => {
  // Only gate /admin routes
  if (!context.url.pathname.startsWith('/admin')) {
    return next();
  }

  // Get session from Auth.js via auth-astro (reads from cookie)
  const session = await getAuthSession(context.request);
  const validSession = getSession(session as any);

  // No session or not admin → 404 (not 403, to hide route existence)
  if (!validSession || !isAdmin(validSession.user.githubId)) {
    return new Response(null, { status: 404 });
  }

  return next();
});
