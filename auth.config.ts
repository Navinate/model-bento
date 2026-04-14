import GitHub from '@auth/core/providers/github';
import { defineConfig } from 'auth-astro';

export default defineConfig({
  providers: [
    GitHub({
      clientId: import.meta.env.GITHUB_CLIENT_ID,
      clientSecret: import.meta.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        token.githubId = profile.id;
        token.username = profile.login;
        token.avatarUrl = profile.avatar_url;
      }
      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub,
          githubId: token.githubId as number,
          username: token.username as string,
          avatarUrl: token.avatarUrl as string,
        },
      };
    },
  },
});
