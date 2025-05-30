
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { addUserOnLogin, getUserById } from '@/lib/data-store';
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
    if (process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true") {
      console.log("AuthContext: Skipping Firebase Auth due to NEXT_PUBLIC_DEV_MODE_SKIP_AUTH=true");
      const devFirebaseUser: FirebaseUser = {
        uid: 'dev-admin-uid',
        email: 'dev-admin@example.com',
        displayName: '개발 관리자',
        emailVerified: true,
        isAnonymous: false,
        metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() },
        providerData: [{ providerId: 'password', uid: 'dev-admin-uid', displayName: '개발 관리자', email: 'dev-admin@example.com', phoneNumber: null, photoURL: null }],
        refreshToken: 'dev-token',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => 'dev-id-token',
        getIdTokenResult: async () => ({ token: 'dev-id-token', claims: { admin: true }, expirationTime: '', issuedAtTime: '', signInProvider: null, signInSecondFactor: null }),
        reload: async () => {},
        toJSON: () => ({}),
        photoURL: null,
        phoneNumber: null,
        providerId: 'password'
      };
      const devAppUser: User = {
        id: 'dev-admin-uid',
        email: 'dev-admin@example.com',
        name: '개발 관리자',
        role: 'admin',
        createdAt: new Date(),
      };
      setCurrentUser(devFirebaseUser);
      setAppUser(devAppUser);
      setIsAdmin(true);
      setUserRole('admin');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setCurrentUser(user);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const fetchedDBUser = userDocSnap.data() as Omit<User, 'id'>;
            // Ensure createdAt is a Date object
            const processedAppUser: User = {
                id: user.uid,
                email: fetchedDBUser.email || user.email,
                name: fetchedDBUser.name || user.displayName,
                role: fetchedDBUser.role,
                createdAt: fetchedDBUser.createdAt instanceof Timestamp ? fetchedDBUser.createdAt.toDate() : new Date(fetchedDBUser.createdAt || Date.now()),
            };
            setAppUser(processedAppUser);
            setUserRole(processedAppUser.role);
            setIsAdmin(processedAppUser.role === 'admin');
          } else {
            // User exists in Firebase Auth, but not in Firestore 'users' collection yet (first login)
            const newAppUser = await addUserOnLogin({
              id: user.uid,
              email: user.email,
              name: user.displayName,
            });
            setAppUser(newAppUser); // addUserOnLogin should return User with JS Date
            setUserRole(newAppUser.role); // Should be 'none' by default
            setIsAdmin(newAppUser.role === 'admin'); // Will be false for 'none'
          }
        } catch (error) {
          console.error("AuthContext: Error fetching/creating user data from Firestore:", error);
          setAppUser(null);
          setUserRole(null);
          setIsAdmin(false);
        } finally {
          setLoading(false);
        }
      } else {
        setCurrentUser(null);
        setAppUser(null);
        setIsAdmin(false);
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    if (process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true") {
      console.log("AuthContext: Simulating sign out in dev mode.");
      setCurrentUser(null);
      setAppUser(null);
      setIsAdmin(false);
      setUserRole(null);
      setLoading(false); // Ensure loading is false after "sign out"
      // In dev skip auth mode, router.push('/login') might still be useful
      // or redirect to a page indicating dev mode logged out.
      if (!pathname.startsWith('/login')) {
         router.push('/login');
      }
      return;
    }
    try {
      await firebaseSignOut(auth);
      // States (currentUser, appUser, isAdmin, userRole) will be reset by onAuthStateChanged listener
      // setLoading will also be handled by onAuthStateChanged
      const publicPathsForSignOut = ['/login', '/share/meeting'];
      if (!publicPathsForSignOut.some(p => pathname.startsWith(p))) {
         router.push('/login');
      }
    } catch (error) {
      console.error("AuthContext: Error signing out: ", error);
      // Even on error, try to clear local state to reflect a logged-out attempt
      setCurrentUser(null);
      setAppUser(null);
      setIsAdmin(false);
      setUserRole(null);
      setLoading(false);
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
