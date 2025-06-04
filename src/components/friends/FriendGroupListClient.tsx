'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  createFriendGroupAction,
  deleteFriendGroupAction,
  getFriendGroupsForUserAction,
  getFriendsByGroupAction,
  deleteFriendAction,
  getAllUsersAction
} from '@/lib/actions';
import type { FriendGroup, User, Friend } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, Trash2, PlusCircle, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { AddFriendToGroupDialog } from './AddFriendToGroupDialog';

type DisplayFriendGroup = FriendGroup & {
  isOwned: boolean;
  isReferenced: boolean;
};

export default function FriendGroupListClient() {
  const { currentUser, appUser, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<DisplayFriendGroup[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingFriend, setIsDeletingFriend] = useState<string | null>(null);
  const { toast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [friendsInSelectedGroup, setFriendsInSelectedGroup] = useState<Friend[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);

  const [isAddFriendDialogOpen, setIsAddFriendDialogOpen] = useState(false);
  const [groupIdForAddingFriend, setGroupIdForAddingFriend] = useState<string | null>(null);
  const [groupNameForAddingFriend, setGroupNameForAddingFriend] = useState<string | undefined>(undefined);

  const currentSelectedGroupObject = useMemo(() => {
    if (!selectedGroupId) return null;
    return groups.find(g => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);


  const fetchData = useCallback(async () => {
    if (authLoading || !currentUser?.uid || !appUser?.id) {
      setIsLoading(false);
      setGroups([]);
      setAllUsers([]);
      return;
    }
    setIsLoading(true);
    try {
      const [groupsRes, usersRes] = await Promise.all([
        getFriendGroupsForUserAction(appUser.id),
        getAllUsersAction()
      ]);

      if (groupsRes.success && groupsRes.groups) {
        setGroups(groupsRes.groups as DisplayFriendGroup[]);
      } else {
        toast({ title: '오류', description: groupsRes.error || '그룹 목록을 불러오는데 실패했습니다.', variant: 'destructive' });
        setGroups([]);
      }

      if (usersRes.success && usersRes.users) {
        setAllUsers(usersRes.users);
      } else {
        toast({ title: '오류', description: usersRes.error || '사용자 목록을 불러오는데 실패했습니다.', variant: 'destructive' });
        setAllUsers([]);
      }

    } catch (error) {
      toast({ title: '오류', description: '데이터를 불러오는 중 예기치 않은 오류가 발생했습니다.', variant: 'destructive' });
      setGroups([]);
      setAllUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.uid, appUser, authLoading, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !appUser?.id) return;
    setIsSubmitting(true);
    try {
      const res = await createFriendGroupAction(newGroupName, appUser.id);
      if (res.success) {
        setNewGroupName('');
        toast({ title: '성공', description: '새 그룹이 추가되었습니다.' });
        await fetchData();
      } else {
        toast({ title: '오류', description: res.error || '그룹 추가에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error) {
       toast({ title: '오류', description: '그룹 추가 중 예기치 않은 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!appUser?.id) return;
    const confirmed = window.confirm('정말로 이 그룹을 삭제하시겠습니까? 그룹 내 모든 친구 정보는 삭제되지 않으며, 그룹만 삭제됩니다.');
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      const res = await deleteFriendGroupAction(groupId, appUser.id);
      if (res.success) {
        toast({ title: '성공', description: '그룹이 삭제되었습니다.' });
        await fetchData();
      } else {
        toast({ title: '오류', description: res.error || '그룹 삭제에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error) {
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
      setFriendsInSelectedGroup([]);
    } else {
      setSelectedGroupId(groupId);
    }
  };

  useEffect(() => {
    const fetchFriendsForGroup = async () => {
      if (!selectedGroupId) {
        setFriendsInSelectedGroup([]);
        return;
      }
      setIsLoadingFriends(true);
      try {
        const response = await getFriendsByGroupAction(selectedGroupId);
        if (response.success && response.friends) {
          setFriendsInSelectedGroup(response.friends);
        } else {
          setFriendsInSelectedGroup([]);
          toast({ title: "오류", description: response.error || "선택된 그룹의 친구 목록을 가져오지 못했습니다.", variant: "destructive" });
        }
      } catch (error) {
        setFriendsInSelectedGroup([]);
        toast({ title: "오류", description: "친구 목록 조회 중 예외가 발생했습니다.", variant: "destructive" });
        console.error("Error fetching friends by group:", error);
      } finally {
        setIsLoadingFriends(false);
      }
    };

    fetchFriendsForGroup();
  }, [selectedGroupId, toast]);

  const handleDeleteFriend = async (friendId: string, friendName: string) => {
    if (!selectedGroupId || !appUser?.id) {
      toast({ title: "오류", description: "필수 정보가 누락되었습니다.", variant: "destructive" });
      return;
    }
    const confirmed = window.confirm(`'${friendName}' 친구를 이 그룹에서 정말 삭제하시겠습니까? 친구 정보는 다른 그룹에 남아있을 수 있습니다.`);
    if (!confirmed) return;
    setIsDeletingFriend(friendId);
    try {
      const result = await deleteFriendAction({
        friendId,
        groupId: selectedGroupId,
        currentUserId: appUser.id,
      });
      if (result.success) {
        toast({ title: "성공", description: `'${friendName}' 친구를 그룹에서 삭제했습니다.` });
        setFriendsInSelectedGroup(prev => prev.filter(f => f.id !== friendId));
      } else {
        toast({ title: "오류", description: result.error || "친구 삭제에 실패했습니다.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "오류", description: "친구 삭제 중 예기치 않은 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setIsDeletingFriend(null);
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
                    className="flex-1 text-left font-medium hover:text-primary transition-colors flex items-center"
                  >
                    {selectedGroupId === group.id ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                    {group.name}
                  </button>
                  <div className="flex items-center space-x-1">
                    {appUser?.role === 'admin' && !group.isOwned && (
                      <span className="text-xs text-muted-foreground mr-2">
                        (소유자: {allUsers.find(u => u.id === group.ownerUserId)?.name || group.ownerUserId.substring(0,6) + '...'})
                      </span>
                    )}
                    {(group.isOwned || appUser?.role === 'admin') && (
                       <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleOpenAddFriendDialog(group.id, group.name);}}
                        disabled={isSubmitting}
                        aria-label="Add friend to group"
                      >
                        <UserPlus className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Button>
                    )}
                    {(group.isOwned || appUser?.role === 'admin') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id);}} disabled={isSubmitting}>
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
                      <ul className="space-y-1 pt-2">
                        {friendsInSelectedGroup.map(friend => (
                          <li key={friend.id} className="flex justify-between items-center text-sm p-1 hover:bg-muted rounded group">
                            <span>{friend.name} {friend.description && `(${friend.description})`}</span>
                            {(currentSelectedGroupObject?.isOwned && appUser && (appUser.role === 'user' || appUser.role === 'admin')) || (appUser?.role === 'admin') ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDeleteFriend(friend.id, friend.name)}
                                disabled={isDeletingFriend === friend.id}
                                aria-label={`Delete ${friend.name}`}
                              >
                                {isDeletingFriend === friend.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
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
                    className="flex-1 text-left font-medium hover:text-primary transition-colors flex items-center"
                  >
                    {selectedGroupId === group.id ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                    {group.name}
                  </button>
                  <div className="flex items-center space-x-1">
                    {appUser?.role === 'admin' && (
                      <span className="text-xs text-muted-foreground mr-2">
                        (소유자: {allUsers.find(u => u.id === group.ownerUserId)?.name || group.ownerUserId.substring(0,6) + '...'})
                      </span>
                    )}
                    {appUser?.role === 'admin' && (
                       <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleOpenAddFriendDialog(group.id, group.name);}}
                        disabled={isSubmitting}
                        aria-label="Add friend to group"
                      >
                        <UserPlus className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Button>
                    )}
                    {appUser?.role === 'admin' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id);}} disabled={isSubmitting}>
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
                       <ul className="space-y-1 pt-2">
                        {friendsInSelectedGroup.map(friend => (
                           <li key={friend.id} className="flex justify-between items-center text-sm p-1 hover:bg-muted rounded group">
                            <span>{friend.name} {friend.description && `(${friend.description})`}</span>
                            {appUser?.role === 'admin' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDeleteFriend(friend.id, friend.name)}
                                disabled={isDeletingFriend === friend.id}
                                aria-label={`Delete ${friend.name}`}
                              >
                                {isDeletingFriend === friend.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.length === 0 && !isLoading && (
        <p className="text-center text-muted-foreground">표시할 그룹이 없습니다. 새 그룹을 만들어 보세요!</p>
      )}
    </div>
  );
}
