'use client';
import { useEffect, useState } from 'react';
import { getFriends, getFriendGroupsByUser } from '@/lib/data-store';
import { AddFriendDialog } from '@/components/friends/AddFriendDialog';
import { FriendListClient } from '@/components/friends/FriendListClient';
import FriendListByGroup from '@/components/friends/FriendListByGroup';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react'; // Trash2, Loader2 removed as they are now in FriendListByGroup
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Friend, FriendGroup } from '@/lib/types';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { deleteFriendAction, deleteFriendGroupAction, getFriendsByGroupAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import FriendGroupForm from '@/components/friends/FriendGroupForm'; // Import FriendGroupForm

export default function FriendsPage() {
  const { appUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [isDeletingGroupId, setIsDeletingGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true);
      return;
    }
    if (!appUser) {
      setDataLoading(false);
      setFriends([]);
      setGroups([]);
      return;
    }
    const fetchFriends = async () => {
      setDataLoading(true);
      try {
        const fetchedFriends = await getFriends();
        setFriends(fetchedFriends);
      } catch (error) {
        console.error("Failed to fetch friends:", error);
        setFriends([]);
      } finally {
        setDataLoading(false);
      }
    };
    fetchFriends();
  }, [authLoading, appUser]);

  const fetchGroups = async () => {
    if (!appUser) return;
    setDataLoading(true); // Consider a more granular loading state if this impacts other parts
    try {
      const fetchedGroups = await getFriendGroupsByUser(appUser.id);
      setGroups(fetchedGroups);
    } catch (error) {
      console.error("Failed to fetch groups:", error);
      setGroups([]);
    } finally {
      setDataLoading(false); // Or the granular loading state
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [appUser]);

  const handleGroupsChanged = async () => {
    // This function will be called by FriendGroupListClient
    await fetchGroups();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">친구 목록 로딩 중...</p>
      </div>
    );
  }

  if (!appUser) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">로그인 후 친구 목록을 확인할 수 있습니다.</p>
      </div>
    );
  }

  const handleDeleteGroupFromAccordion = async (groupId: string) => {
    setIsDeletingGroupId(groupId);
    const result = await deleteFriendGroupAction(groupId);
    if (result.success) {
      toast({ title: '성공', description: '그룹이 삭제되었습니다.' });
      await fetchGroups(); // Refresh the groups list
    } else {
      toast({ title: '오류', description: result.error || '그룹 삭제에 실패했습니다.', variant: 'destructive' });
    }
    setIsDeletingGroupId(null);
  };

  // 그룹 목록 새로고침
  const refreshGroups = () => {
    if (!appUser) return;
    getFriendGroupsByUser(appUser.id).then(setGroups);
  };

  // 그룹 삭제 핸들러 (친구도 함께 삭제)
  const handleDeleteGroup = async (groupId: string) => {
    await handleDeleteGroupAndFriends(groupId, setDeletingGroupId, refreshGroups);
  };

  // 그룹 삭제 핸들러
  async function handleDeleteGroupAndFriends(groupId: string, setDeletingGroupId: (id: string | null) => void, refreshGroups: () => void) {
    setDeletingGroupId(groupId);
    // 1. 그룹에 포함된 친구 목록 조회
    const res = await getFriendsByGroupAction(groupId);
    if (res.success && res.friends && res.friends.length > 0) {
      // 2. 모든 친구 삭제 (순차적으로)
      for (const friend of res.friends) {
        await deleteFriendAction(friend.id);
      }
    }
    // 3. 그룹 삭제
    await deleteFriendGroupAction(groupId);
    setDeletingGroupId(null);
    refreshGroups();
  }

  const defaultAccordionOpenValue = groups.length > 0 ? [groups[0].id] : [];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>내 친구 그룹</CardTitle>
          <CardDescription>여러 그룹을 만들어 친구를 분류할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <FriendGroupForm userId={appUser.id} onCreated={handleGroupsChanged} />
        </CardContent>
      </Card>
      {/* 그룹별 친구 목록 표시 */}
      <div className="mt-8">
        <h2 className="text-lg font-bold mb-2 px-2 md:px-4">그룹 목록</h2>
        {dataLoading && groups.length === 0 && !authLoading && (
          <div className="text-center py-8 text-muted-foreground">그룹 목록 로딩 중...</div>
        )}
        {!dataLoading && groups.length === 0 && !authLoading && (
          <div className="text-center py-8 text-muted-foreground">생성된 그룹이 없습니다. 위에서 새 그룹을 추가해주세요.</div>
        )}
        {groups.length > 0 && (
          <Accordion type="multiple" defaultValue={groups.length > 0 ? [groups[0].id] : []} className="bg-white rounded-md border px-2 md:px-4">
          {groups.map((group, idx) => (
            <AccordionItem key={group.id} value={group.id}>
              <AccordionTrigger>{group.name}</AccordionTrigger>
              <AccordionContent>
                <FriendListByGroup 
                  group={group} 
                  onDeleteGroup={handleDeleteGroup}
                  isDeletingThisGroup={deletingGroupId === group.id}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        )}
      </div>
      {/* 기존 친구 목록 UI 등... */}
    </div>
  );
}
