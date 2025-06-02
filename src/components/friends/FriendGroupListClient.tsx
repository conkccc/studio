import { useEffect, useState } from 'react';
import { createFriendGroupAction, updateFriendGroupAction, deleteFriendGroupAction } from '@/lib/actions';
import { getFriendGroupsByUser } from '@/lib/data-store';
import type { FriendGroup } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface FriendGroupListClientProps {
  userId: string;
  initialGroups: FriendGroup[];
  onGroupsChanged: () => Promise<void>;
  isAdmin?: boolean;
}

export default function FriendGroupListClient({ userId, initialGroups, onGroupsChanged, isAdmin = false }: FriendGroupListClientProps) {
  const [groups, setGroups] = useState<FriendGroup[]>(initialGroups);
  const [newGroupName, setNewGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  // 그룹 추가 후 목록 새로고침 및 첫 번째 그룹 자동 선택
  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    setLoading(true);
    const res = await createFriendGroupAction(newGroupName, userId);
    if (res.success) {
      setNewGroupName('');
      toast({ title: '성공', description: '새 그룹이 추가되었습니다.' });
      await onGroupsChanged();
    } else {
      toast({ title: '오류', description: res.error || '그룹 추가에 실패했습니다.', variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    await deleteFriendGroupAction(id);
    // The actual removal from the list will happen when onGroupsChanged causes the parent to refetch and pass new initialGroups.
    // setGroups(groups.filter(g => g.id !== id)); // Optimistic update removed to rely on parent's refresh
    toast({ title: '성공', description: '그룹이 삭제되었습니다.' });
    await onGroupsChanged();
    setLoading(false);
    // TODO: Add error handling for deleteFriendGroupAction if it can fail and return an error
  };

  // TODO: handle update (rename) if needed

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex gap-2">
          <input
            className="border rounded px-2 py-1 flex-1"
            placeholder="새 그룹명"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            disabled={loading}
          />
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded flex items-center justify-center min-w-[60px]" 
            onClick={handleCreate} 
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '추가'}
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {groups.map(group => (
          <li key={group.id} className="flex items-center gap-2 border p-2 rounded">
            <span className="flex-1">{group.name}</span>
            {isAdmin && (
              <button className="text-red-500 hover:text-red-600 disabled:opacity-50" onClick={() => handleDelete(group.id)} disabled={loading}>
                {loading && groups.length === 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : '삭제'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
