import { useState } from 'react';
import { createFriendGroupAction } from '@/lib/actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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
    } else {
      toast({
        title: '그룹 생성 실패',
        description: res.error || '알 수 없는 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
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
