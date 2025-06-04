'use client';

import type { User } from '@/lib/types';
import React, { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { updateUserRoleAction } from '@/lib/actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Settings2 } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { AssignFriendGroupsDialog } from './AssignFriendGroupsDialog';
import type { FriendGroup } from '@/lib/types';

interface UserListClientProps {
  initialUsers: User[];
  currentAdminId: string;
  isAdmin: boolean;
  allFriendGroups: FriendGroup[];
}

export function UserListClient({ initialUsers, currentAdminId, isAdmin, allFriendGroups }: UserListClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedUserForGroups, setSelectedUserForGroups] = useState<User | null>(null);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const handleUserUpdated = (updatedUser: User) => {
    setUsers(prevUsers => prevUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
    // 액션에서 revalidatePath가 호출되므로, 전체 목록을 다시 불러올 필요는 없을 수 있습니다.
    // 필요하다면 여기서 부모에게 알려 추가적인 데이터 페칭을 트리거할 수 있습니다.
  };

  const handleRoleChange = (userIdToUpdate: string, newRole: User['role']) => {
    if (userIdToUpdate === currentAdminId) {
      toast({ title: '오류', description: '자신의 역할은 변경할 수 없습니다.', variant: 'destructive' });
      return;
    }

    startTransition(async () => {
      const result = await updateUserRoleAction(userIdToUpdate, newRole, currentAdminId);
      if (result.success && result.user) {
        setUsers(prevUsers => prevUsers.map(u => u.id === userIdToUpdate ? result.user! : u));
        toast({ title: '성공', description: `${result.user.name || result.user.email || userIdToUpdate}님의 역할이 ${newRole}(으)로 변경되었습니다.` });
      } else {
        toast({
          title: '오류',
          description: result.error || '사용자 역할 변경에 실패했습니다.',
          variant: 'destructive',
        });
        // Select 컴포넌트는 users 상태에 바인딩되어 있으므로,
        // users 상태가 업데이트되지 않으면 자동으로 이전 값으로 돌아갑니다.
        // 따라서 별도의 UI 복구 로직은 필요하지 않습니다.
      }
    });
  };
  
  const formatDate = (dateInput: Date | Timestamp | undefined | null): string => {
    if (!dateInput) return 'N/A';
    let date: Date;
    if (dateInput instanceof Timestamp) {
      date = dateInput.toDate();
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else { // Attempt to parse if it's a string or number (e.g. from older data)
      date = new Date(dateInput);
    }
    
    if (!isValid(date)) return '날짜 정보 없음';
    return format(date, 'yyyy.MM.dd HH:mm', { locale: ko });
  };

  return (
    <div className="space-y-4">
      {isPending && <div className="flex items-center space-x-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> <span>처리 중...</span></div>}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>가입일</TableHead>
              {isAdmin && <TableHead className="text-right">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && !isPending && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground h-24">
                  사용자가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name || '-'}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>
                  {user.id === currentAdminId ? (
                    <>
                      <span>{user.role}</span>
                      <p className="text-xs text-muted-foreground mt-1">(본인)</p>
                    </>
                  ) : (
                    <Select
                      value={user.role}
                      onValueChange={(newRole) => handleRoleChange(user.id, newRole as User['role'])} // 타입 단언 추가
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue placeholder="역할 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem> {/* Added viewer role */}
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-xs">{formatDate(user.createdAt)}</TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    {user.id !== currentAdminId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUserForGroups(user);
                          setIsAssignDialogOpen(true);
                        }}
                        disabled={isPending}
                      >
                        <Settings2 className="h-3 w-3 mr-1" /> 참조 그룹 할당
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedUserForGroups && isAdmin && (
        <AssignFriendGroupsDialog
          isOpen={isAssignDialogOpen}
          setIsOpen={setIsAssignDialogOpen}
          targetUser={selectedUserForGroups}
          allFriendGroups={allFriendGroups}
          currentAdminId={currentAdminId}
          onUserUpdated={handleUserUpdated}
        />
      )}
    </div>
  );
}
