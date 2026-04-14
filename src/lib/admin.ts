/**
 * Check if a GitHub user ID is in the admin list.
 * Admins are configured via ADMIN_GITHUB_IDS env var (comma-separated).
 */
export function isAdmin(githubId: number): boolean {
  const adminIds = (process.env.ADMIN_GITHUB_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number);

  return adminIds.includes(githubId);
}
