import { useState } from 'react';
import { createFriendGroupAction } from '@/lib/actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface FriendGroupFormProps {
  userId: string;
  onCreated?: () => void;
}

export default function FriendGroupForm({ userId, onCreated }: FriendGroupFormProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await createFriendGroupAction(name, userId);
    setLoading(false);
    if (res.success) {
      setName('');
      onCreated?.();
    }
    // TODO: 실패 시 에러 메시지 표시 (toast 사용 등)
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        type="text"
        placeholder="새 그룹 이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={loading}
        className="flex-1"
      />
      <Button type="submit" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        생성
      </Button>
    </form>
  );
}
