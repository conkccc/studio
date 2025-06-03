'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  createFriendGroupAction,
  // updateFriendGroupAction, // Add if/when edit functionality is implemented
  deleteFriendGroupAction,
  getFriendGroupsForUserAction,
  getFriendsByGroupAction // Added for fetching friends
} from '@/lib/actions';
import type { FriendGroup, User, Friend } from '@/lib/types'; // Added Friend
import { useToast } from '@/hooks/use-toast'; // Assuming this path is correct
import { Loader2, Edit, Trash2, PlusCircle, ChevronDown, ChevronRight } from 'lucide-react'; // Added icons
import { Button } from '@/components/ui/button'; // Assuming shadcn Button
import { Input } from '@/components/ui/input'; // Assuming shadcn Input
import { useAuth } from '@/contexts/AuthContext'; // Corrected path

// Define a type for groups with added UI-specific flags
type DisplayFriendGroup = FriendGroup & {
  isOwned: boolean;
  isReferenced: boolean;
};

export default function FriendGroupListClient() {
  const { currentUser, appUser, loading: authLoading } = useAuth(); // Added appUser and authLoading
  const [groups, setGroups] = useState<DisplayFriendGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(true); // For initial group list load
  const [isSubmitting, setIsSubmitting] = useState(false); // For form submissions
  const { toast } = useToast();

  // State for selected group and its friends
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [friendsInSelectedGroup, setFriendsInSelectedGroup] = useState<Friend[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);


  const fetchGroups = useCallback(async () => {
    if (authLoading || !currentUser?.uid || !appUser) { // Updated guard
      setIsLoading(false); // Ensure loading is false if we return early
      setGroups([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await getFriendGroupsForUserAction(appUser.id); // Use appUser.id
      if (res.success && res.groups) {
        const processedGroups: DisplayFriendGroup[] = res.groups.map(group => ({
          ...group,
          isOwned: group.ownerUserId === appUser.id, // Use appUser.id for ownership check
          isReferenced: !!(appUser.friendGroupIds?.includes(group.id)),
        }));
        setGroups(processedGroups);
      } else {
        toast({ title: '오류', description: res.error || '그룹 목록을 불러오는데 실패했습니다.', variant: 'destructive' });
        setGroups([]); // Clear groups on error
      }
    } catch (error) {
      toast({ title: '오류', description: '그룹 목록을 불러오는 중 예기치 않은 오류가 발생했습니다.', variant: 'destructive' });
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, appUser, authLoading, toast]); // Added appUser, authLoading to dependencies

  useEffect(() => {
    // fetchGroups will now internally check for currentUser/appUser and authLoading
    fetchGroups();
  }, [fetchGroups]); // fetchGroups itself is memoized with correct dependencies

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !appUser?.id) return; // Use appUser.id
    setIsSubmitting(true);
    try {
      const res = await createFriendGroupAction(newGroupName, appUser.id); // Use appUser.id
      if (res.success) {
        setNewGroupName('');
        toast({ title: '성공', description: '새 그룹이 추가되었습니다.' });
        await fetchGroups(); // Refresh the list
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
    if (!appUser?.id) return; // Use appUser.id
    setIsSubmitting(true);
    try {
      // The deleteFriendGroupAction now includes permission check with currentUserId
      const res = await deleteFriendGroupAction(groupId, appUser.id); // Use appUser.id
      if (res.success) {
        toast({ title: '성공', description: '그룹이 삭제되었습니다.' });
        await fetchGroups(); // Refresh the list
      } else {
        toast({ title: '오류', description: res.error || '그룹 삭제에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: '오류', description: '그룹 삭제 중 예기치 않은 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Placeholder for edit function
  // const handleEditGroup = (group: DisplayFriendGroup) => {
  //   // Implement edit functionality, perhaps open a dialog
  //   console.log("Edit group:", group);
  // };

  const handleSelectGroup = (groupId: string) => {
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null); // Toggle off if same group is clicked
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


  if (isLoading) { // Initial loading for groups
    return <div className="flex justify-center items-center h-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!currentUser) {
    return <p className="text-center text-muted-foreground">로그인이 필요합니다.</p>;
  }

  // Use appUser for role check
  const canCreateGroup = appUser && (appUser.role === 'admin' || appUser.role === 'user');

  const ownedGroups = groups.filter(g => g.isOwned);
  const referencedGroups = groups.filter(g => !g.isOwned && g.isReferenced); // Show only referenced if not owned

  return (
    <div className="space-y-6 p-1">
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
                  { appUser && (appUser.role === 'user' || appUser.role === 'admin') && (
                    <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id);}} disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {selectedGroupId === group.id && (
                  <div className="mt-2 pl-4 border-l-2 border-muted">
                    {isLoadingFriends && <div className="flex items-center text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin mr-2"/>친구 목록 로딩 중...</div>}
                    {!isLoadingFriends && friendsInSelectedGroup.length === 0 && <p className="text-sm text-muted-foreground py-2">이 그룹에는 친구가 없습니다.</p>}
                    {!isLoadingFriends && friendsInSelectedGroup.length > 0 && (
                      <ul className="space-y-1 pt-2">
                        {friendsInSelectedGroup.map(friend => (
                          <li key={friend.id} className="text-sm p-1 hover:bg-muted rounded">{friend.name}</li>
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

      {referencedGroups.length > 0 && (
         <div>
          <h2 className="text-xl font-semibold mb-2">공유된 그룹</h2>
          <ul className="space-y-2">
            {referencedGroups.map(group => (
              <li key={group.id} className="bg-card p-3 rounded-md shadow-sm">
                <div className="flex items-center justify-between">
                   <button
                    onClick={() => handleSelectGroup(group.id)}
                    className="flex-1 text-left font-medium hover:text-primary transition-colors flex items-center"
                  >
                    {selectedGroupId === group.id ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                    {group.name}
                  </button>
                  <span className="text-xs text-muted-foreground pr-2">(읽기 전용)</span>
                </div>
                {selectedGroupId === group.id && (
                  <div className="mt-2 pl-4 border-l-2 border-muted">
                    {isLoadingFriends && <div className="flex items-center text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin mr-2"/>친구 목록 로딩 중...</div>}
                    {!isLoadingFriends && friendsInSelectedGroup.length === 0 && <p className="text-sm text-muted-foreground py-2">이 그룹에는 친구가 없습니다.</p>}
                    {!isLoadingFriends && friendsInSelectedGroup.length > 0 && (
                       <ul className="space-y-1 pt-2">
                        {friendsInSelectedGroup.map(friend => (
                          <li key={friend.id} className="text-sm p-1 hover:bg-muted rounded">{friend.name}</li>
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
