'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // db import는 getUserById를 통해 간접 사용되므로 제거 가능
import { useRouter, usePathname } from 'next/navigation';
// doc, getDoc, Timestamp는 getUserById 내부에서 처리되므로 여기서 직접 필요 없어짐
// import { doc, getDoc, Timestamp } from 'firebase/firestore';
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
          // data-store의 getUserById 함수를 사용하여 Firestore 사용자 정보 가져오기
          let appUserData = await dbGetUserById(user.uid);

          if (appUserData) {
            // createdAt이 Timestamp 객체일 경우 Date 객체로 변환 (getUserById에서 이미 처리되었을 수 있음)
            // getUserById가 Date 객체를 반환한다고 가정하면 추가 변환 불필요.
            // 만약 getUserById가 Firestore DocumentData를 그대로 반환한다면 여기서 변환 필요.
            // 현재 data-store.ts의 getUserById는 dataFromSnapshot을 사용하고,
            // dataFromSnapshot은 convertTimestampsToDates를 사용하므로 Date 객체로 변환된 상태임.
            setAppUser(appUserData);
            setUserRole(appUserData.role);
            setIsAdmin(appUserData.role === 'admin');
          } else {
            // Firestore에 사용자 정보가 없으면 새로 생성
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
      // States will be reset by onAuthStateChanged
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
