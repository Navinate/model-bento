import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isAdmin } from '../../src/lib/admin';

describe('admin', () => {
  const originalEnv = process.env.ADMIN_GITHUB_IDS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_GITHUB_IDS = originalEnv;
    } else {
      delete process.env.ADMIN_GITHUB_IDS;
    }
  });

  it('isAdmin returns true for GitHub ID in ADMIN_GITHUB_IDS', () => {
    process.env.ADMIN_GITHUB_IDS = '12345,67890';
    expect(isAdmin(12345)).toBe(true);
    expect(isAdmin(67890)).toBe(true);
  });

  it('isAdmin returns false for GitHub ID not in list', () => {
    process.env.ADMIN_GITHUB_IDS = '12345,67890';
    expect(isAdmin(99999)).toBe(false);
  });

  it('isAdmin returns false when ADMIN_GITHUB_IDS is empty', () => {
    process.env.ADMIN_GITHUB_IDS = '';
    expect(isAdmin(12345)).toBe(false);
  });

  it('isAdmin returns false when ADMIN_GITHUB_IDS is not set', () => {
    delete process.env.ADMIN_GITHUB_IDS;
    expect(isAdmin(12345)).toBe(false);
  });

  it('isAdmin handles whitespace in env var', () => {
    process.env.ADMIN_GITHUB_IDS = ' 12345 , 67890 ';
    expect(isAdmin(12345)).toBe(true);
    expect(isAdmin(67890)).toBe(true);
  });
});
