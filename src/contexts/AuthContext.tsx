
'use client';

import type { User } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Make sure auth is exported from firebase config
import { useRouter } from 'next/navigation';

interface AuthContextValue {
  currentUser: User | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  adminEmail?: string; // Make adminEmail optional or ensure it's always provided
}

export function AuthProvider({ children, adminEmail }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user && adminEmail) {
        setIsAdmin(user.email === adminEmail);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [adminEmail]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setCurrentUser(null);
    setIsAdmin(false);
    router.push('/login'); // Redirect to login page after sign out
  };

  const value = {
    currentUser,
    isAdmin,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
