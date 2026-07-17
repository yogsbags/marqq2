import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthState } from '@/types/auth';
import { supabase } from '@/lib/supabase';
import type { AuthError } from '@supabase/supabase-js';
import { persistActiveUserId } from '@/lib/agentContext';
import {
  accountNeedsOnboardingFlag,
  clearJustSignedUpPending,
  isJustSignedUpPending,
  markJustSignedUpPending,
  markNeedsOnboarding,
  onboardedStorageKey,
} from '@/lib/onboardingGate';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<{ needsEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to convert Supabase user to our User type
function mapSupabaseUser(supabaseUser: any): User | null {
  if (!supabaseUser) return null;

  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    name: supabaseUser.user_metadata?.full_name ||
          supabaseUser.user_metadata?.name ||
          supabaseUser.email?.split('@')[0] ||
          'User',
    avatar: supabaseUser.user_metadata?.avatar_url ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${supabaseUser.email}`,
    role: (supabaseUser.user_metadata?.role as 'admin' | 'user' | 'manager') || 'user',
    onboarded: supabaseUser.user_metadata?.onboarded === true,
  };
}

type UsableAuthUser = {
  id: string;
  email: string;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown>;
};

function isUsableAuthUser(supabaseUser: unknown): supabaseUser is UsableAuthUser {
  if (!supabaseUser || typeof supabaseUser !== 'object') return false;
  const user = supabaseUser as Record<string, unknown>;
  if (user.is_anonymous === true) return false;
  return typeof user.id === 'string' && typeof user.email === 'string' && user.email.trim().length > 0;
}

function shouldForceOnboarding(user: User): boolean {
  if (accountNeedsOnboardingFlag(user.id)) return true;
  try {
    // Already finished on this device — don't re-open the flow while metadata catches up
    if (localStorage.getItem(onboardedStorageKey(user.id)) === '1') return false;
  } catch {
    /* ignore */
  }
  return user.onboarded !== true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const applyAuthUser = (supabaseUser: UsableAuthUser) => {
      const user = mapSupabaseUser(supabaseUser);
      persistActiveUserId(supabaseUser.id);
      if (user && shouldForceOnboarding(user)) {
        markNeedsOnboarding(user.id);
        return {
          user: { ...user, onboarded: false },
          isAuthenticated: true,
          isLoading: false,
        } satisfies AuthState;
      }
      return {
        user,
        isAuthenticated: true,
        isLoading: false,
      } satisfies AuthState;
    };

    const verifySessionInBackground = async () => {
      try {
        const { data: verified, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;
        const verifiedUser = verified?.user;
        if (userError || !isUsableAuthUser(verifiedUser)) {
          await supabase.auth.signOut().catch(() => {});
          persistActiveUserId(null);
          setState({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }
        setState(applyAuthUser(verifiedUser));
      } catch (error) {
        console.error('Error verifying session:', error);
      }
    };

    // Fast path: restore from persisted session locally, verify with Supabase in background.
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (cancelled) return;

        if (error) {
          console.error('Error getting session:', error);
          if (error.message?.toLowerCase().includes('refresh token')) {
            await supabase.auth.signOut().catch(() => {});
          }
          setState({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        if (session?.user && isUsableAuthUser(session.user)) {
          setState(applyAuthUser(session.user));
          void verifySessionInBackground();
          return;
        }

        persistActiveUserId(null);
        setState({ user: null, isAuthenticated: false, isLoading: false });
      } catch (error) {
        console.error('Error checking session:', error);
        if (!cancelled) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    void checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') {
          if (session?.user && isUsableAuthUser(session.user)) {
            setState(applyAuthUser(session.user));
          } else if (!session) {
            persistActiveUserId(null);
            setState({ user: null, isAuthenticated: false, isLoading: false });
          }
        } else if (event === 'SIGNED_IN' && session?.user) {
          if (!isUsableAuthUser(session.user)) {
            await supabase.auth.signOut().catch(() => {});
            persistActiveUserId(null);
            setState({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }

          const user = mapSupabaseUser(session.user);
          persistActiveUserId(session.user.id);
          if (!user) {
            setState({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }

          let localDone = false;
          try {
            localDone = localStorage.getItem(onboardedStorageKey(user.id)) === '1';
          } catch {
            /* ignore */
          }

          const force =
            isJustSignedUpPending() ||
            accountNeedsOnboardingFlag(user.id) ||
            (!localDone && user.onboarded !== true);

          if (force) {
            markNeedsOnboarding(user.id);
            if (user.onboarded) {
              void supabase.auth.updateUser({ data: { onboarded: false } }).catch(() => {});
            }
            setState({
              user: { ...user, onboarded: false },
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            setState({
              user,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } else if (event === 'SIGNED_OUT') {
          persistActiveUserId(null);
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          if (!isUsableAuthUser(session.user)) {
            await supabase.auth.signOut().catch(() => {});
            persistActiveUserId(null);
            setState({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }

          const mapped = mapSupabaseUser(session.user);
          persistActiveUserId(session.user.id);
          // Sticky incomplete flag beats refreshed metadata
          if (mapped && accountNeedsOnboardingFlag(mapped.id)) {
            setState(prev => ({
              ...prev,
              user: { ...mapped, onboarded: false },
              isAuthenticated: true,
            }));
          } else {
            setState(prev => ({
              ...prev,
              user: mapped,
              isAuthenticated: true,
            }));
          }
        } else if ((event as string) === 'TOKEN_REFRESH_FAILED') {
          persistActiveUserId(null);
          await supabase.auth.signOut().catch(() => {});
          setState({ user: null, isAuthenticated: false, isLoading: false });
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        if (!isUsableAuthUser(data.user)) {
          await supabase.auth.signOut().catch(() => {});
          throw new Error('No verified user email returned');
        }
        const user = mapSupabaseUser(data.user);
        if (!user) throw new Error('No user data returned');

        if (shouldForceOnboarding(user) || accountNeedsOnboardingFlag(user.id)) {
          markNeedsOnboarding(user.id);
          setState({
            user: { ...user, onboarded: false },
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          clearJustSignedUpPending();
          setState({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        }
      } else {
        throw new Error('No user data returned');
      }
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      const authError = error as AuthError;
      throw new Error(authError.message || 'Login failed. Please check your credentials.');
    }
  };

  const signup = async (email: string, password: string, name: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    // Set BEFORE signUp so onAuthStateChange(SIGNED_IN) sees pending and sticky-marks
    markJustSignedUpPending();

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            name: name,
            role: 'user',
            onboarded: false,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session?.user) {
        const user = mapSupabaseUser(data.session.user);
        if (!user) throw new Error('No user data returned');

        markNeedsOnboarding(user.id);
        // Ensure Supabase metadata matches — past races left onboarded:true on new accounts
        void supabase.auth.updateUser({ data: { onboarded: false } }).catch(() => {});

        setState({
          user: { ...user, onboarded: false },
          isAuthenticated: true,
          isLoading: false,
        });
        return { needsEmailConfirmation: false };
      }

      if (data.user) {
        // Email confirmation required — sticky flag so first login still onboards
        markNeedsOnboarding(data.user.id);
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return { needsEmailConfirmation: true };
      }

      clearJustSignedUpPending();
      throw new Error('No user data returned');
    } catch (error) {
      // Keep sticky needs markers if SIGNED_IN already wrote them for a created user.
      // Only clear the ephemeral session pending bit when signup failed cleanly.
      clearJustSignedUpPending();
      setState(prev => ({ ...prev, isLoading: false }));
      const authError = error as AuthError;
      throw new Error(authError.message || 'Signup failed. Please try again.');
    }
  };

  const logout = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    clearJustSignedUpPending();

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local state even if logout fails
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
