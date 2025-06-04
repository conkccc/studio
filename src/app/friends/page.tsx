'use client';
import { useEffect, useState } from 'react';
// import { getFriends } from '@/lib/data-store'; // FriendGroupListClient가 친구 데이터를 로드하므로 제거
import FriendGroupListClient from '@/components/friends/FriendGroupListClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
// import type { Friend } from '@/lib/types'; // FriendGroupListClient가 친구 데이터를 로드하므로 제거
// 이전 그룹 로직 관련 import들은 이미 제거됨

export default function FriendsPage() {
  const { appUser, loading: authLoading } = useAuth();
  // const [friends, setFriends] = useState<Friend[]>([]); // FriendGroupListClient로 로직 이동
  // const [dataLoading, setDataLoading] = useState(true); // FriendGroupListClient로 로직 이동

  // useEffect(() => {
  //   if (authLoading) {
  //     // setDataLoading(true); // FriendGroupListClient로 로직 이동
  //     return;
  //   }
  //   if (!appUser) {
  //     // setDataLoading(false); // FriendGroupListClient로 로직 이동
  //     // setFriends([]); // FriendGroupListClient로 로직 이동
  //     return;
  //   }
  //   // 전체 친구 목록을 가져오는 로직은 FriendGroupListClient 또는 해당 컴포넌트 내부에서 그룹별로 처리
  //   // const fetchAllFriends = async () => {
  //   //   setDataLoading(true);
  //   //   try {
  //   //     const fetchedFriends = await getFriends();
  //   //     setFriends(fetchedFriends);
  //   //   } catch (error) {
  //   //     console.error("Failed to fetch friends:", error);
  //   //     setFriends([]);
  //   //   } finally {
  //   //     setDataLoading(false);
  //   //   }
  //   // };
  //   // fetchAllFriends();
  // }, [authLoading, appUser]);


  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!appUser) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">로그인 후 이용해주세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <Card>
        <CardHeader>
          <CardTitle>친구 그룹 관리</CardTitle>
          <CardDescription>내 그룹을 만들거나 공유된 그룹을 확인하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <FriendGroupListClient />
        </CardContent>
      </Card>
    </div>
  );
}
