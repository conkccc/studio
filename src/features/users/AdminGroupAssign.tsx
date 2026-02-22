import { useEffect, useState } from 'react';
import { getFriendGroupsByUser, updateFriendGroup } from '@/lib/data-store/client';
import type { User, FriendGroup } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Input 컴포넌트 import
import { Loader2 } from 'lucide-react'; // Loader2 아이콘 import
import { useToast } from '@/hooks/use-toast';

interface AdminGroupAssignProps {
  user: User;
}

export default function AdminGroupAssign({ user }: AdminGroupAssignProps) {
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null); // 현재 수정 중인 그룹 ID
  const [editingName, setEditingName] = useState(''); // 현재 수정 중인 그룹 이름
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // 컴포넌트 마운트 시 또는 사용자 ID 변경 시 그룹 목록을 가져옴
    setLoading(true);
    getFriendGroupsByUser(user.id)
      .then(setGroups)
      .catch(() => {
        console.error("Failed to load groups for user:", user.id);
        toast({ title: '오류', description: '그룹 목록을 불러오지 못했습니다.', variant: 'destructive' });
        setGroups([]);
      })
      .finally(() => setLoading(false));
  }, [toast, user.id]);

  const startEdit = (group: FriendGroup) => {
    setEditingGroupId(group.id);
    setEditingName(group.name);
  };

  const cancelEdit = () => {
    setEditingGroupId(null);
    setEditingName('');
  };

  const handleRename = async (groupId: string) => {
    if (!editingName.trim()) {
      toast({ title: '이름 필요', description: '그룹 이름을 입력해주세요.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const result = await updateFriendGroup(groupId, { name: editingName });
      if (result) { // data-store의 updateFriendGroup이 성공 시 업데이트된 그룹 객체, 실패 시 null 반환 가정
        setGroups(prevGroups => prevGroups.map(g => (g.id === groupId ? { ...g, name: editingName } : g)));
        toast({ title: '성공', description: '그룹 이름이 변경되었습니다.' });
      } else {
        toast({ title: '오류', description: '그룹 이름 변경에 실패했습니다.', variant: 'destructive' });
        // 실패 시 원래 이름으로 되돌릴 수 있도록 기존 그룹 이름을 임시 저장해두는 것도 고려
      }
    } catch (error) {
      console.error("Error renaming group:", error);
      toast({ title: '오류', description: '그룹 이름 변경 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setEditingGroupId(null);
      setLoading(false);
    }
  };

  if (loading && groups.length === 0) {
    return (
      <Card className="mb-4">
        <CardHeader><CardTitle>그룹 로딩 중...</CardTitle></CardHeader>
        <CardContent className="flex justify-center items-center py-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{user.name || user.email || user.id}의 친구 그룹 관리</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 && !loading && <p className="text-muted-foreground">이 사용자는 아직 친구 그룹이 없습니다.</p>}
        <ul className="space-y-3">
          {groups.map(group => (
            <li key={group.id} className="flex items-center gap-2 p-2 border rounded-md">
              {editingGroupId === group.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    className="flex-1 h-9"
                    disabled={loading}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => handleRename(group.id)} disabled={loading || !editingName.trim()}>
                    {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    저장
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit} disabled={loading}>
                    취소
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate" title={group.name}>{group.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(group)} disabled={loading}>
                    이름 변경
                  </Button>
                </>
              )}
              <span className="text-xs text-muted-foreground ml-auto pl-2">ID: {group.id.substring(0, 8)}...</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
