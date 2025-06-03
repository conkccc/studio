'use client';

import { useEffect, useState } from 'react';
import { getFriends, getFriendGroupsByUser } from '@/lib/data-store';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Friend, FriendGroup } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NewMeetingPage() {
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [isTemporaryMeeting, setIsTemporaryMeeting] = useState(false); // Added state

  const handleTemporaryChange = (isTemporary: boolean) => { // Added handler
    setIsTemporaryMeeting(isTemporary);
    if (isTemporary) {
      // Optionally, if a group was selected, clear it when switching to temporary
      // setSelectedGroupId(null);
      // This might be good UX, but the form itself will ignore friends/groupId if isTemporary is true.
    }
  };

  useEffect(() => {
    if (authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
      setDataLoading(true);
      return;
    }

    if (!currentUser || !isAdmin) { 
      setDataLoading(false);
      setFriends([]);
      return;
    }

    const fetchFriends = async () => {
      setDataLoading(true);
      try {
        const fetchedFriends = await getFriends();
        setFriends(fetchedFriends);
      } catch (error) {
        console.error("Failed to fetch friends for new meeting:", error);
        setFriends([]);
      } finally {
        setDataLoading(false);
      }
    };
    
    fetchFriends();

  }, [authLoading, currentUser, isAdmin]);

  useEffect(() => {
    if (!currentUser) return;
    getFriendGroupsByUser(currentUser.uid).then(setGroups);
  }, [currentUser]);

  if (authLoading || (isAdmin && dataLoading)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") { 
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인 필요</h1>
        <p className="text-muted-foreground mb-6">새 모임을 만들려면 로그인이 필요합니다.</p>
        <Button asChild>
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }
  
  if (!isAdmin) { 
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground">새 모임 만들기는 관리자만 가능합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const currentUserId = currentUser!.uid; 

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">새 모임 만들기</CardTitle>
          <CardDescription>모임의 세부 정보를 입력하고 친구들을 초대하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            CreateMeetingForm은 항상 렌더링되며, 이제 그룹 선택 UI보다 먼저 배치됩니다.
            - 일반 모임이고 그룹 미선택 시: friends는 빈 배열, participantIds 필수는 스키마에서 처리.
            - 임시 모임 시: friends는 빈 배열, groupId는 undefined.
          */}
          <CreateMeetingForm
            friends={isTemporaryMeeting
              ? []
              : (selectedGroupId ? friends.filter(f => f.groupId === selectedGroupId) : [])
            }
            currentUserId={currentUserId}
            groupId={selectedGroupId || undefined} // Pass undefined if null
            // groups={groups} // Pass groups if CreateMeetingForm needs it (e.g. for a dropdown within it)
            onTemporaryChange={handleTemporaryChange}
            // initialData and isEditMode are not used for new page, but keeping for consistency if this was a shared component path
          />

          {/* 그룹 선택 드롭다운 - 임시 모임이 아닐 때만 표시되며, CreateMeetingForm 다음에 위치 */}
          {!isTemporaryMeeting && (
            <div className="mt-6 mb-4"> {/* 상단 여백 추가 */}
              <label className="block mb-1 font-medium">친구 그룹 선택 <span className="text-destructive">*</span></label>
              <Popover open={!!groupPopoverOpen} onOpenChange={setGroupPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={!!groupPopoverOpen}
                    className="w-full justify-between"
                  >
                    {selectedGroupId
                      ? (groups.find(g => g.id === selectedGroupId)?.name || '그룹 선택...')
                      : '그룹 선택...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="그룹 이름 검색..." />
                    <CommandList>
                      <CommandEmpty>그룹을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {/* "그룹 없음" 또는 "전체 친구" 옵션을 추가할 수 있습니다. */}
                        {/* <CommandItem onSelect={() => { setSelectedGroupId(null); setGroupPopoverOpen(false); }}>전체 친구 (그룹 없음)</CommandItem> */}
                        {groups.map(group => (
                          <CommandItem
                            key={group.id}
                            value={group.name}
                            onSelect={() => {
                              setSelectedGroupId(group.id);
                              setGroupPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", selectedGroupId === group.id ? "opacity-100" : "opacity-0")} />
                            <span>{group.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
