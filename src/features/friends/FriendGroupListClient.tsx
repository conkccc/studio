'use client';
import { useState } from 'react';
import {
  createFriendGroupAction,
  deleteFriendGroupAction
} from '@/lib/client-actions';
import type { FriendGroup, Friend } from '@/lib/types';
import { useAppData } from '@/hooks/use-app-data';
import { useQueryClient } from '@tanstack/react-query';
import { appQueryKey, dataScope } from '@/lib/app-query-client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, PlusCircle, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { AddFriendToGroupDialog } from './AddFriendToGroupDialog';
import { FriendListClient } from './FriendListClient';

type DisplayFriendGroup = FriendGroup & {
  isOwned: boolean;
  isReferenced: boolean;
};

export default function FriendGroupListClient() {
  const { currentUser, appUser, loading: authLoading } = useAuth();
  const groupQuery = useAppData('groups');
  const groups = (groupQuery.data?.groups || []) as DisplayFriendGroup[];
  const loadError = groupQuery.error?.message;
  const [newGroupName, setNewGroupName] = useState('');
  const isLoading = authLoading || groupQuery.isLoading;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const friendQuery = useAppData('friends', { id: selectedGroupId || undefined }, !!selectedGroupId);
  const friendsInSelectedGroup = friendQuery.data?.friends || [];
  const isLoadingFriends = friendQuery.isLoading;
  const queryClient = useQueryClient();
  const setFriendsInSelectedGroup = (update: Friend[] | ((previous: Friend[]) => Friend[])) => {
    const friends = typeof update === 'function' ? update(friendsInSelectedGroup) : update;
    queryClient.setQueryData(appQueryKey(dataScope(appUser), 'friends', { id: selectedGroupId || undefined }), { success: true, friends });
  };

  const [isAddFriendDialogOpen, setIsAddFriendDialogOpen] = useState(false);
  const [groupIdForAddingFriend, setGroupIdForAddingFriend] = useState<string | null>(null);
  const [groupNameForAddingFriend, setGroupNameForAddingFriend] = useState<string | undefined>(undefined);

  const fetchData = () => groupQuery.refetch();

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !appUser?.id) return;
    setIsSubmitting(true);
    try {
      const res = await createFriendGroupAction(newGroupName, appUser.id);
      if (res.success) {
        setNewGroupName('');
        toast({ title: '성공', description: '새 그룹이 추가되었습니다.' });
      } else {
        toast({ title: '오류', description: res.error || '그룹 추가에 실패했습니다.', variant: 'destructive' });
      }
    } catch {
       toast({ title: '오류', description: '그룹 추가 중 예기치 않은 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!appUser?.id) return;
    const confirmed = window.confirm('이 그룹을 현재 목록에서 제외하시겠습니까? 과거 모임과 정산 기록은 유지됩니다.');
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      const res = await deleteFriendGroupAction(groupId, appUser.id);
      if (res.success) {
        toast({ title: '성공', description: '그룹이 삭제되었습니다.' });
      } else {
        toast({ title: '오류', description: res.error || '그룹 삭제에 실패했습니다.', variant: 'destructive' });
      }
    } catch {
      toast({ title: '오류', description: '그룹 삭제 중 예기치 않은 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // const handleEditGroup = (group: DisplayFriendGroup) => {
  // console.log("Edit group:", group);
  // };

  const handleSelectGroup = (groupId: string) => {
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
    } else {
      setSelectedGroupId(groupId);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!currentUser) {
    return <p className="text-center text-muted-foreground">로그인이 필요합니다.</p>;
  }

  const canCreateGroup = appUser && (appUser.role === 'admin' || appUser.role === 'user');

  const ownedGroups = groups.filter(g => g.isOwned);
  const otherGroups = appUser?.role === 'admin'
    ? groups.filter(g => !g.isOwned)
    : groups.filter(g => !g.isOwned && g.isReferenced);

  const handleOpenAddFriendDialog = (groupId: string, groupName: string) => {
    setGroupIdForAddingFriend(groupId);
    setGroupNameForAddingFriend(groupName);
    setIsAddFriendDialogOpen(true);
  };

  const handleFriendAdded = (newFriend: Friend) => {
    if (selectedGroupId === newFriend.groupId) {
      setFriendsInSelectedGroup(prevFriends =>
        [...prevFriends, newFriend].sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    toast({ title: "성공", description: `그룹 '${groupNameForAddingFriend || selectedGroupId}'에 '${newFriend.name}' 친구를 추가했습니다.` });
  };

  return (
    <div className="space-y-6 p-1">
      {groupIdForAddingFriend && (
        <AddFriendToGroupDialog
          isOpen={isAddFriendDialogOpen}
          setIsOpen={setIsAddFriendDialogOpen}
          groupId={groupIdForAddingFriend}
          groupName={groupNameForAddingFriend}
          onFriendAdded={handleFriendAdded}
        />
      )}

      {canCreateGroup && (
        <div className="bg-card p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">새 그룹 만들기</h2>
          <div className="flex gap-2">
            <Input
              placeholder="새 그룹명"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              disabled={isSubmitting}
              className="flex-1"
            />
            <Button onClick={handleCreateGroup} disabled={isSubmitting || !newGroupName.trim()}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4 mr-2" />}
              추가
            </Button>
          </div>
        </div>
      )}

      {ownedGroups.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-2">내가 만든 그룹</h2>
          <ul className="space-y-2">
            {ownedGroups.map(group => (
              <li key={group.id} className="bg-card p-3 rounded-md shadow-sm">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => handleSelectGroup(group.id)}
                    aria-expanded={selectedGroupId === group.id}
                    className="flex-1 text-left font-medium hover:text-primary transition-colors flex items-center"
                  >
                    {selectedGroupId === group.id ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                    {group.name}
                  </button>
                  <div className="flex items-center space-x-1">
                    {appUser?.role === 'admin' && !group.isOwned && (
                      <span className="text-xs text-muted-foreground mr-2">
                        (소유자: {group.ownerName || '그룹 소유자'})
                      </span>
                    )}
                    {(group.isOwned || appUser?.role === 'admin') && (
                       <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleOpenAddFriendDialog(group.id, group.name);}}
                        disabled={isSubmitting}
                        aria-label="그룹에 친구 추가"
                      >
                        <UserPlus className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Button>
                    )}
                    {(group.isOwned || appUser?.role === 'admin') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${group.name} 그룹 제외`} onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id);}} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                      </Button>
                    )}
                  </div>
                </div>
                {selectedGroupId === group.id && (
                  <div className="mt-2 pl-4 border-l-2 border-muted">
                    {isLoadingFriends && <div className="flex items-center text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin mr-2"/>친구 목록 로딩 중...</div>}
                    {!isLoadingFriends && friendsInSelectedGroup.length === 0 && <p className="text-sm text-muted-foreground py-2">이 그룹에는 친구가 없습니다.</p>}
                    {!isLoadingFriends && friendsInSelectedGroup.length > 0 && (
                      <FriendListClient
                        key={group.id}
                        initialFriends={friendsInSelectedGroup}
                        isReadOnly={!(appUser?.role === 'admin' || (group.isOwned && appUser?.role === 'user'))}
                        onFriendDeleted={id => setFriendsInSelectedGroup(previous => previous.filter(friend => friend.id !== id))}
                        onFriendUpdated={updated => setFriendsInSelectedGroup(previous => previous.map(friend => friend.id === updated.id ? updated : friend))}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {otherGroups.length > 0 && (
         <div>
          <h2 className="text-xl font-semibold mb-2">{appUser?.role === 'admin' ? "기타 그룹" : "공유된 그룹"}</h2>
          <ul className="space-y-2">
            {otherGroups.map(group => (
              <li key={group.id} className="bg-card p-3 rounded-md shadow-sm">
                <div className="flex items-center justify-between">
                   <button
                    onClick={() => handleSelectGroup(group.id)}
                    aria-expanded={selectedGroupId === group.id}
                    className="flex-1 text-left font-medium hover:text-primary transition-colors flex items-center"
                  >
                    {selectedGroupId === group.id ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                    {group.name}
                  </button>
                  <div className="flex items-center space-x-1">
                    {appUser?.role === 'admin' && (
                      <span className="text-xs text-muted-foreground mr-2">
                        (소유자: {group.ownerName || '그룹 소유자'})
                      </span>
                    )}
                    {appUser?.role === 'admin' && (
                       <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleOpenAddFriendDialog(group.id, group.name);}}
                        disabled={isSubmitting}
                        aria-label="그룹에 친구 추가"
                      >
                        <UserPlus className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Button>
                    )}
                    {appUser?.role === 'admin' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${group.name} 그룹 제외`} onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id);}} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                      </Button>
                    )}
                    {appUser?.role !== 'admin' && group.isReferenced && !group.isOwned && (
                        <span className="text-xs text-muted-foreground pr-2">(읽기 전용)</span>
                    )}
                  </div>
                </div>
                {selectedGroupId === group.id && (
                  <div className="mt-2 pl-4 border-l-2 border-muted">
                    {isLoadingFriends && <div className="flex items-center text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin mr-2"/>친구 목록 로딩 중...</div>}
                    {!isLoadingFriends && friendsInSelectedGroup.length === 0 && <p className="text-sm text-muted-foreground py-2">이 그룹에는 친구가 없습니다.</p>}
                    {!isLoadingFriends && friendsInSelectedGroup.length > 0 && (
                       <FriendListClient
                        key={group.id}
                        initialFriends={friendsInSelectedGroup}
                        isReadOnly={!(appUser?.role === 'admin' || (group.isOwned && appUser?.role === 'user'))}
                        onFriendDeleted={id => setFriendsInSelectedGroup(previous => previous.filter(friend => friend.id !== id))}
                        onFriendUpdated={updated => setFriendsInSelectedGroup(previous => previous.map(friend => friend.id === updated.id ? updated : friend))}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {friendQuery.error && <p role="alert" className="text-destructive">{friendQuery.error.message}</p>}
      {loadError && <div role="alert" className="space-y-3 py-6 text-center"><p>{loadError}</p><Button variant="outline" onClick={() => void fetchData()}>다시 시도</Button></div>}
      {groups.length === 0 && !isLoading && !loadError && (
        <p className="text-center text-muted-foreground">표시할 그룹이 없습니다. 새 그룹을 만들어 보세요!</p>
      )}
    </div>
  );
}
