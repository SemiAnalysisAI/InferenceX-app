export type AuthLevel = 'admin' | 'user';
export type AuthStatus = 'approved' | 'pending' | 'rejected' | 'banned';

export interface AuthContext {
  userId: string;
  email: string;
  authLevel: AuthLevel;
}

export const AUTH_LEVEL_ORDER: Record<AuthLevel, number> = {
  admin: 1,
  user: 0,
};

export function hasMinimumLevel(level: AuthLevel, min: AuthLevel): boolean {
  return AUTH_LEVEL_ORDER[level] >= AUTH_LEVEL_ORDER[min];
}
