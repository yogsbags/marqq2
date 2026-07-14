export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'user' | 'manager';
  /** From Supabase user_metadata.onboarded — source of truth for GTM onboarding gate */
  onboarded?: boolean;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}