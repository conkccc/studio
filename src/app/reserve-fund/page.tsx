'use client';

import { useEffect, useState } from 'react'; // Kept for potential top-level loading/auth checks
// Removed: getReserveFundBalance, getLoggedReserveFundTransactions, Card components (if not used for page structure)
// Removed: Tabs, useRouter, usePathname
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
// Removed: ReserveFundTransaction type (client handles its own types)

export default function ReserveFundPage() {
  const { currentUser, loading: authLoading } = useAuth();
  // dataLoading state might still be useful for the overall page shell if there were other elements.
  // For now, ReserveFundClient handles its own internal loading states.
  const [pageReady, setPageReady] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      setPageReady(true);
    }
  }, [authLoading]);

  if (!pageReady) { // Handles authLoading implicitly
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">회비 페이지 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser) {
     return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인이 필요합니다</h1>
        <p className="text-muted-foreground">회비 정보를 보려면 로그인이 필요합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  // Viewer role check - if viewers should not see this page at all.
  // However, ReserveFundClient itself will filter groups for viewers.
  // So, it's probably fine for viewers to land here and see what they have access to (potentially nothing).
  // if (currentUser.role === 'viewer' && SOME_CONDITION_THAT_VIEWERS_SEE_NOTHING) {
  //   return (
  //     <div className="container mx-auto py-8 text-center">
  //       <h1 className="text-2xl font-bold mb-4">권한 없음</h1>
  //       <p className="text-muted-foreground">이 페이지에 표시할 내용이 없습니다.</p>
  //     </div>
  //   );
  // }


  return (
    <div className="space-y-6 p-4 md:p-6"> {/* Added padding */}
      <div>
        <h1 className="text-2xl font-semibold">그룹 회비 관리</h1>
        <p className="text-muted-foreground">
          그룹을 선택하여 회비 잔액을 설정하고 사용 내역을 확인하세요.
        </p>
      </div>
      {/* ReserveFundClient now fetches all its required data internally */}
      <ReserveFundClient />
    </div>
  );
}
