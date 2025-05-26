import { getFriends } from '@/lib/data-store';
import { AddFriendDialog } from '@/components/friends/AddFriendDialog';
import { FriendListClient } from '@/components/friends/FriendListClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';

export default async function FriendsPage() {
  const friends = await getFriends();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">친구 목록</h1>
          <p className="text-muted-foreground">
            친구들을 관리하고 모임에 초대하세요.
          </p>
        </div>
        <AddFriendDialog triggerButton={
          <div className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 cursor-pointer">
            <PlusCircle className="h-5 w-5" />
            새 친구 추가
          </div>
        } />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>등록된 친구 ({friends.length}명)</CardTitle>
          <CardDescription>닉네임을 클릭하여 수정하거나 삭제할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {friends.length > 0 ? (
            <FriendListClient initialFriends={friends} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>아직 등록된 친구가 없습니다.</p>
              <p className="mt-2">오른쪽 위의 '새 친구 추가' 버튼으로 첫 친구를 등록해보세요!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
