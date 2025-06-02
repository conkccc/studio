import { useState } from 'react';
import { createFriendGroupAction } from '@/lib/actions';

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
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        className="border rounded px-2 py-1 flex-1"
        placeholder="그룹명 입력"
        value={name}
        onChange={e => setName(e.target.value)}
        disabled={loading}
      />
      <button className="bg-blue-500 text-white px-3 py-1 rounded" type="submit" disabled={loading}>
        생성
      </button>
    </form>
  );
}
