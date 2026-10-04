
'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { missingFirebaseVariables } from '@/lib/firebase';

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { signInWithGoogle, configurationError } = useAuth();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const user = await signInWithGoogle();
      toast({ title: '로그인 성공', description: user.role === 'none' ? '관리자의 승인을 기다려주세요.' : '대시보드로 이동합니다.' });
      if (user.role !== 'none') router.push('/');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google 로그인 중 오류가 발생했습니다.';
      toast({
        title: '로그인 실패',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {configurationError && (
        <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">{configurationError}</p>
          {process.env.NODE_ENV === 'development' ? (
            <>
              <p>studio/.env.local에 Firebase 웹 앱 설정을 입력하고 개발 서버를 다시 시작해주세요.</p>
              {missingFirebaseVariables.length > 0 && <ul className="space-y-1 break-all font-mono text-xs">{missingFirebaseVariables.map(name => <li key={name}>{name}</li>)}</ul>}
              <p>Firebase 콘솔 → 프로젝트 설정 → 내 앱에서 웹 앱 설정을 확인할 수 있습니다.</p>
            </>
          ) : <p>로그인 연결 설정을 확인한 뒤 다시 시도해주세요.</p>}
        </div>
      )}
      <Button onClick={handleGoogleLogin} disabled={isLoading || !!configurationError} className="w-full">
        {isLoading ? '로그인 중...' : 'Google 계정으로 로그인'}
      </Button>
    </div>
  );
}
