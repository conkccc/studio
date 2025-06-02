"use client";

import { useEffect, useState } from 'react';
import { getFriendGroupsByUser, getReserveFundBalanceByGroup, getLoggedReserveFundTransactionsByGroup } from '@/lib/data-store';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';
import type { FriendGroup, ReserveFundTransaction } from '@/lib/types';
import { useRouter, usePathname } from 'next/navigation';

export default function ReserveFundByGroupPage() {
  const { appUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<ReserveFundTransaction[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!appUser) return;
    getFriendGroupsByUser(appUser.id).then(fetchedGroups => {
      setGroups(fetchedGroups);
      // 그룹이 1개면 자동 선택
      if (fetchedGroups.length === 1) {
        setSelectedGroupId(fetchedGroups[0].id);
      }
    });
  }, [appUser]);

  useEffect(() => {
    if (!selectedGroupId) return;
    setDataLoading(true);
    Promise.all([
      getReserveFundBalanceByGroup(selectedGroupId),
      getLoggedReserveFundTransactionsByGroup(selectedGroupId, 10)
    ]).then(([b, txs]) => {
      setBalance(b ?? 0);
      setTransactions(txs);
      setDataLoading(false);
    });
  }, [selectedGroupId]);

  // 그룹별 회비 정보 새로고침 함수
  const refreshGroupFund = async () => {
    if (!selectedGroupId) return;
    setDataLoading(true);
    const [b, txs] = await Promise.all([
      getReserveFundBalanceByGroup(selectedGroupId),
      getLoggedReserveFundTransactionsByGroup(selectedGroupId, 10)
    ]);
    setBalance(b ?? 0);
    setTransactions(txs);
    setDataLoading(false);
  };

  useEffect(() => {
    if (!selectedGroupId) return;
    refreshGroupFund();
  }, [selectedGroupId]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl text-muted-foreground">인증 정보 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 친구 그룹이 없을 때 안내 */}
      {groups.length === 0 && (
        <div className="text-center text-muted-foreground py-8">아직 그룹이 없습니다.</div>
      )}
      {/* 그룹이 2개 이상일 때 그룹 선택 UI */}
      {groups.length > 1 && (
        <div className="flex items-center justify-center gap-3 py-4">
          <label htmlFor="group-select" className="text-sm font-medium text-primary whitespace-nowrap">그룹 선택</label>
          <div className="relative w-full max-w-xs">
            <select
              id="group-select"
              className="block w-full appearance-none rounded-md border border-input bg-background px-4 py-2 pr-10 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition disabled:opacity-50"
              value={selectedGroupId || ''}
              onChange={e => setSelectedGroupId(e.target.value)}
            >
              <option value="" disabled>그룹을 선택하세요</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </span>
          </div>
        </div>
      )}
      {/* 그룹이 선택되지 않았을 때 안내 */}
      {groups.length > 0 && !selectedGroupId && (
        <div className="text-center text-muted-foreground py-8">그룹을 선택해주세요.</div>
      )}
      {/* 그룹 정보 및 회비 내역 */}
      {selectedGroupId && (
        <Card>
          <CardHeader>
            <CardTitle>그룹별 회비 관리</CardTitle>
          </CardHeader>
          <CardContent>
            {dataLoading ? (
              <div className="text-center py-8">그룹 정보 불러오는중...</div>
            ) : (
              <ReserveFundClient
                groupId={selectedGroupId}
                initialBalance={balance}
                initialTransactions={transactions}
                onChanged={refreshGroupFund}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
