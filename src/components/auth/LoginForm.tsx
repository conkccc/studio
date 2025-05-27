
'use client';

import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext'; // To potentially access isAdmin later if needed

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  // const { isAdmin, currentUser } = useAuth(); // Not used for immediate check here anymore

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // Admin check will happen in AuthContext and enforced by page/component logic
      toast({ title: '로그인 성공', description: '대시보드로 이동합니다.' });
      router.push('/'); 
    } catch (error: any) {
      console.error("Google login error:", error);
      toast({
        title: '로그인 실패',
        description: error.message || 'Google 로그인 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={handleGoogleLogin} disabled={isLoading} className="w-full">
        {isLoading ? '로그인 중...' : 'Google 계정으로 로그인'}
      </Button>
    </div>
  );
}
