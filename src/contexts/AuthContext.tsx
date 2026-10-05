'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { getClientAuth, firebaseConfigurationError } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { clearServerSession, establishServerSession } from '@/lib/auth/client-session';
import type { User } from '@/lib/types';
import { clearAppData, setAppDataUser } from '@/lib/app-query-client';

interface AuthContextValue {
  currentUser: FirebaseUser | null;
  appUser: User | null;
  isAdmin: boolean;
  userRole: User['role'] | null;
  loading: boolean;
  configurationError: string | null;
  signInWithGoogle: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState<string | null>(firebaseConfigurationError);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (firebaseConfigurationError) {
      setLoading(false);
      return;
    }
    let auth;
    try {
      auth = getClientAuth();
    } catch {
      setConfigurationError('Firebase 로그인 설정을 확인해주세요.');
      setLoading(false);
      return;
    }
    let active = true;
    let revision = 0;
    let lastVerifiedUid: string | undefined;
    const unsubscribe = onIdTokenChanged(auth, async user => {
      const eventRevision = ++revision;
      if (!user || user.uid !== lastVerifiedUid) clearAppData();
      if (!user || user.uid !== lastVerifiedUid) setLoading(true);
      try {
        if (user) {
          const profile = await establishServerSession(user);
          if (!active || eventRevision !== revision) return;
          setAppDataUser(profile);
          setCurrentUser(user);
          setAppUser(profile);
          lastVerifiedUid = user.uid;
        } else {
          await clearServerSession();
          if (!active || eventRevision !== revision) return;
          setCurrentUser(null);
          setAppUser(null);
          lastVerifiedUid = undefined;
        }
      } catch {
        console.warn('서버 로그인 상태를 확인하지 못했습니다.');
        if (active && eventRevision === revision) {
          clearAppData();
          setCurrentUser(null);
          setAppUser(null);
          lastVerifiedUid = undefined;
        }
      } finally {
        if (active && eventRevision === revision) setLoading(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(getClientAuth(), new GoogleAuthProvider());
      const profile = await establishServerSession(result.user);
      setAppDataUser(profile);
      setCurrentUser(result.user);
      setAppUser(profile);
      router.refresh();
      return profile;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    clearAppData();
    try {
      await clearServerSession();
      await firebaseSignOut(getClientAuth());
      setCurrentUser(null);
      setAppUser(null);
      if (!pathname.startsWith('/share/') && pathname !== '/login') router.push('/login');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, appUser, isAdmin: appUser?.role === 'admin', userRole: appUser?.role ?? null, loading, configurationError, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
