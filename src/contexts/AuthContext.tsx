'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { addUserOnLogin, getUserById as dbGetUserById } from '@/lib/data-store'; // getUserById 별칭 사용
import type { User } from '@/lib/types';

interface AuthContextValue {
  currentUser: FirebaseUser | null;
  appUser: User | null;
  isAdmin: boolean;
  userRole: User['role'] | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<User['role'] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          setCurrentUser(user);
          let appUserData = await dbGetUserById(user.uid);

          if (appUserData) {
            setAppUser(appUserData);
            setUserRole(appUserData.role);
            setIsAdmin(appUserData.role === 'admin');
          } else {
            const newAppUser = await addUserOnLogin({
              id: user.uid,
              email: user.email,
              name: user.displayName,
            });
            setAppUser(newAppUser);
            setUserRole(newAppUser.role);
            setIsAdmin(newAppUser.role === 'admin');
          }
        } else {
          setCurrentUser(null);
          setAppUser(null);
          setIsAdmin(false);
          setUserRole(null);
        }
      } catch (error) {
        console.error("AuthContext: Error processing auth state:", error);
        setCurrentUser(null);
        setAppUser(null);
        setIsAdmin(false);
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      const publicPathsForSignOut = ['/login', '/share/meeting'];
      if (!publicPathsForSignOut.some(p => pathname.startsWith(p))) {
        router.push('/login');
      }
    } catch (error) {
      console.error("AuthContext: Error signing out: ", error);
      setCurrentUser(null); setAppUser(null); setIsAdmin(false); setUserRole(null); setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, appUser, isAdmin, userRole, loading, signOut }}>
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
