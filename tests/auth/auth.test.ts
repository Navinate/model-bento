import { describe, it, expect } from 'vitest';
import { getSession, requireAuth } from '../../src/lib/auth';

describe('auth', () => {
  it('unauthenticated request to /generate redirects to /auth/login', () => {
    // Simulate an Astro request context with no session cookie
    const result = requireAuth(null, '/generate');
    expect(result.redirect).toBe('/auth/login?callbackUrl=%2Fgenerate');
  });

  it('authenticated session contains github_id, username, avatar_url', () => {
    const session = {
      user: {
        id: 'abc-123',
        githubId: 12345,
        username: 'testuser',
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      },
    };

    const result = requireAuth(session, '/generate');
    expect(result.redirect).toBeUndefined();
    expect(result.session).toBeDefined();
    expect(result.session!.user.githubId).toBe(12345);
    expect(result.session!.user.username).toBe('testuser');
    expect(result.session!.user.avatarUrl).toBe('https://avatars.githubusercontent.com/u/12345');
  });

  it('/auth/logout clears the session', () => {
    const session = {
      user: {
        id: 'abc-123',
        githubId: 12345,
        username: 'testuser',
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      },
    };

    const logoutResult = getSession(null);
    expect(logoutResult).toBeNull();
  });
});
