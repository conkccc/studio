'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  createFriendGroupAction,
  // updateFriendGroupAction, // Add if/when edit functionality is implemented
  deleteFriendGroupAction,
  getFriendGroupsForUserAction
} from '@/lib/actions';
import type { FriendGroup, User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast'; // Assuming this path is correct
import { Loader2, Edit, Trash2, PlusCircle } from 'lucide-react'; // Added icons
import { Button } from '@/components/ui/button'; // Assuming shadcn Button
import { Input } from '@/components/ui/input'; // Assuming shadcn Input
import { useAuth } from '@/context/AuthContext'; // Assuming this is your auth context

// Define a type for groups with added UI-specific flags
type DisplayFriendGroup = FriendGroup & {
  isOwned: boolean;
  isReferenced: boolean;
};

export default function FriendGroupListClient() {
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<DisplayFriendGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(true); // For initial load
  const [isSubmitting, setIsSubmitting] = useState(false); // For form submissions
  const { toast } = useToast();

  const fetchGroups = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const res = await getFriendGroupsForUserAction(currentUser.id);
      if (res.success && res.groups) {
        const processedGroups: DisplayFriendGroup[] = res.groups.map(group => ({
          ...group,
          isOwned: group.ownerUserId === currentUser.id,
          isReferenced: !!(currentUser.friendGroupIds?.includes(group.id)), // Renamed
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
  }, [currentUser, toast]);

  useEffect(() => {
    if (currentUser) {
      fetchGroups();
    } else {
      // Handle case where user is not logged in, though page access might be restricted higher up
      setIsLoading(false);
      setGroups([]);
    }
  }, [currentUser, fetchGroups]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !currentUser) return;
    setIsSubmitting(true);
    try {
      const res = await createFriendGroupAction(newGroupName, currentUser.id);
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
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      // The deleteFriendGroupAction now includes permission check with currentUserId
      const res = await deleteFriendGroupAction(groupId, currentUser.id);
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

  if (isLoading) {
    return <div className="flex justify-center items-center h-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!currentUser) {
    return <p className="text-center text-muted-foreground">로그인이 필요합니다.</p>;
  }

  const canCreateGroup = currentUser.role === 'admin' || currentUser.role === 'user';

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
              <li key={group.id} className="flex items-center gap-2 bg-card p-3 rounded-md shadow-sm">
                <span className="flex-1 font-medium">{group.name}</span>
                { (currentUser.role === 'user' || currentUser.role === 'admin') && (
                  <>
                    {/* <Button variant="outline" size="sm" onClick={() => handleEditGroup(group)} disabled={isSubmitting}>
                      <Edit className="h-4 w-4 mr-1" /> 수정
                    </Button> */}
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteGroup(group.id)} disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                       삭제
                    </Button>
                  </>
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
              <li key={group.id} className="flex items-center gap-2 bg-card p-3 rounded-md shadow-sm">
                <span className="flex-1 font-medium">{group.name}</span>
                 <span className="text-xs text-muted-foreground pr-2">(읽기 전용)</span>
                {/* No edit/delete for referenced groups unless they are also owned, handled by ownedGroups section */}
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
