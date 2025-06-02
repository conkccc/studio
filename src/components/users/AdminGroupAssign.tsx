import { useEffect, useState } from 'react';
import { getFriendGroupsByUser, updateFriendGroup } from '@/lib/data-store';
import type { User, FriendGroup } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AdminGroupAssignProps {
  user: User;
}

export default function AdminGroupAssign({ user }: AdminGroupAssignProps) {
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    getFriendGroupsByUser(user.id).then(setGroups);
  }, [user.id]);

  const handleRename = async (groupId: string, name: string) => {
    setLoading(true);
    await updateFriendGroup(groupId, { name });
    setGroups(groups => groups.map(g => g.id === groupId ? { ...g, name } : g));
    setLoading(false);
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{user.name || user.email || user.id}의 친구 그룹 관리</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {groups.map(group => (
            <li key={group.id} className="flex items-center gap-2">
              <input
                className="border rounded px-2 py-1 flex-1"
                value={group.name}
                onChange={e => handleRename(group.id, e.target.value)}
                disabled={loading}
              />
              <span className="text-xs text-muted-foreground">ID: {group.id}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
