import { useEffect, useState } from 'react';
import { Friend, FriendGroup } from '@/lib/types';
import { getFriendsByGroupAction } from '@/lib/actions';
import { FriendListClient } from './FriendListClient';
import { AddFriendDialog } from './AddFriendDialog';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

interface FriendListByGroupProps {
  group: FriendGroup;
  onDeleteGroup: (groupId: string) => Promise<void>;
  isDeletingThisGroup: boolean;
}

export default function FriendListByGroup({ group, onDeleteGroup, isDeletingThisGroup }: FriendListByGroupProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getFriendsByGroupAction(group.id).then(res => {
      if (res.success && res.friends) setFriends(res.friends);
      else setFriends([]);
      setLoading(false);
    });
  }, [group.id]);

  const handleFriendAdded = async () => {
    setLoading(true);
    const res = await getFriendsByGroupAction(group.id);
    if (res.success && res.friends) setFriends(res.friends);
    else setFriends([]);
    setLoading(false);
  };

  const handleFriendDeleted = async (deletedFriendId: string) => {
    setLoading(true);
    // Refetch friends for the current group to ensure the list is up-to-date
    const res = await getFriendsByGroupAction(group.id);
    if (res.success && res.friends) setFriends(res.friends);
    else setFriends([]); // Or handle error appropriately
    setLoading(false);
  };

  if (loading) return <div className="py-4 text-muted-foreground">친구 목록 로딩 중...</div>;

  return (
    <div className="my-4 px-4 md:px-8">
      <div className="flex items-center mb-2 gap-2">
        <h3 className="font-semibold flex-1 text-base">그룹 친구</h3>
        <AddFriendDialog
          triggerButton={
            <Button variant="outline" size="sm" className="text-xs h-7 px-2">
              + 친구 추가
            </Button>
          }
          groupId={group.id}
          onFriendAdded={handleFriendAdded}
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs h-7 px-2 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
              disabled={isDeletingThisGroup}
            >
              {isDeletingThisGroup ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              <span className="ml-1">그룹 삭제</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                이 작업은 되돌릴 수 없습니다. <b>{group.name}</b> 그룹과 이 그룹에 포함된 모든 친구가 영구적으로 삭제됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingThisGroup}>취소</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDeleteGroup(group.id)} disabled={isDeletingThisGroup} className="bg-destructive hover:bg-destructive/90">
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <FriendListClient initialFriends={friends} onFriendDeleted={handleFriendDeleted} />
    </div>
  );
}
