
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth'; // Renamed to avoid conflict
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { addUserOnLogin, getUserById } from '@/lib/data-store';
import type { User } from '@/lib/types'; // Your app's User type

interface AuthContextValue {
  currentUser: FirebaseUser | null;
  appUser: User | null; // Your app's user type from Firestore
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
      const devUser: FirebaseUser = {
        uid: 'dev-admin-uid',
        email: 'dev-admin@example.com',
        displayName: '개발 관리자',
        // Add other required FirebaseUser properties with mock data
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        refreshToken: 'dev-token',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => 'dev-id-token',
        getIdTokenResult: async () => ({ token: 'dev-id-token', claims: {}, expirationTime: '', issuedAtTime: '', signInProvider: null, signInSecondFactor: null }),
        reload: async () => {},
        toJSON: () => ({}),
        photoURL: null,
        phoneNumber: null,
        providerId: 'password' // Or 'google.com' if mocking Google login
      };
      const devAppUser: User = {
        id: 'dev-admin-uid',
        email: 'dev-admin@example.com',
        name: '개발 관리자',
        role: 'admin',
        createdAt: new Date(),
      };
      setCurrentUser(devUser);
      setAppUser(devAppUser);
      setIsAdmin(true);
      setUserRole('admin');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true); // Start loading when auth state might change
      if (user) {
        setCurrentUser(user);
        try {
          const userDocSnap = await getDoc(doc(db, 'users', user.uid));
          if (userDocSnap.exists()) {
            const fetchedUser = dataFromSnapshot<User>(userDocSnap);
            if (fetchedUser) {
              setAppUser(fetchedUser);
              setUserRole(fetchedUser.role);
              setIsAdmin(fetchedUser.role === 'admin');
            } else { // Should not happen if userDocSnap.exists() is true and dataFromSnapshot is robust
                setAppUser(null);
                setUserRole('none'); // Or null, depending on desired behavior
                setIsAdmin(false);
            }
          } else {
            // User exists in Firebase Auth, but not in Firestore 'users' collection yet (first login)
            const newAppUser = await addUserOnLogin({
              id: user.uid,
              email: user.email,
              name: user.displayName,
            });
            setAppUser(newAppUser);
            setUserRole(newAppUser.role); // Should be 'none' by default from addUserOnLogin
            setIsAdmin(newAppUser.role === 'admin'); // Will be false for 'none'
          }
        } catch (error) {
          console.error("Error fetching user role from Firestore:", error);
          setAppUser(null);
          setUserRole(null); // Or 'none' if you want to differentiate from "error" state
          setIsAdmin(false);
        }
      } else {
        setCurrentUser(null);
        setAppUser(null);
        setIsAdmin(false);
        setUserRole(null);
      }
      setLoading(false); // Finish loading after all async operations and state updates
    });

    return () => {
      unsubscribe();
    }
  }, []);

  const signOut = async () => {
    try {
      if (process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
        await firebaseSignOut(auth);
      }
      // Reset states regardless of dev mode, to simulate logout
      setCurrentUser(null);
      setAppUser(null);
      setIsAdmin(false);
      setUserRole(null);
      // setLoading(false); // No need to set loading on signOut unless there's an async op
      // Redirect to login only if not already on a public path
      const publicPathsForSignOut = ['/login', '/share/meeting']; // Example
      if (!publicPathsForSignOut.some(p => pathname.startsWith(p))) {
         router.push('/login');
      }
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  // Helper function to convert Firestore Timestamps in user objects (used locally for AuthContext)
  // This is needed because Firestore returns Timestamps, but our User type might expect Dates for app logic
  const dataFromSnapshot = <T extends { id: string; createdAt?: Date | Timestamp }>(snapshot: any): T | undefined => {
    if (!snapshot.exists()) return undefined;
    let data = snapshot.data();

    if (typeof data !== 'object' || data === null) {
      console.warn(`Snapshot data for ID ${snapshot.id} is not an object:`, data);
      data = {};
    }

    const processedData: any = { ...data };
    if (processedData.createdAt && processedData.createdAt instanceof Timestamp) {
      processedData.createdAt = processedData.createdAt.toDate();
    }
    // Add other timestamp fields if User type has more

    return {
      ...processedData,
      id: snapshot.id,
    } as T;
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
