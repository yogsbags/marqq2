import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthState } from '@/types/auth';
import { supabase } from '@/lib/supabase';
import type { Session, AuthError } from '@supabase/supabase-js';
import { persistActiveUserId } from '@/lib/agentContext';

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
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    // Check for existing Supabase session
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        if (session?.user) {
          const user = mapSupabaseUser(session.user);
          persistActiveUserId(session.user.id);
          setState({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          persistActiveUserId(null);
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Error checking session:', error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const user = mapSupabaseUser(session.user);
          persistActiveUserId(session.user.id);
          setState({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } else if (event === 'SIGNED_OUT') {
          persistActiveUserId(null);
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          const user = mapSupabaseUser(session.user);
          persistActiveUserId(session.user.id);
          setState(prev => ({
            ...prev,
            user,
            isAuthenticated: true,
          }));
        }
      }
    );

    return () => {
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
        const user = mapSupabaseUser(data.user);
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
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

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            name: name,
            role: 'user',
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session?.user) {
        const user = mapSupabaseUser(data.session.user);
        sessionStorage.setItem('marqq_just_signed_up', '1');
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
        return { needsEmailConfirmation: false };
      }

      if (data.user) {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return { needsEmailConfirmation: true };
      } else {
        throw new Error('No user data returned');
      }
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      const authError = error as AuthError;
      throw new Error(authError.message || 'Signup failed. Please try again.');
    }
  };

  const logout = async () => {
    setState(prev => ({ ...prev, isLoading: true }));

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
