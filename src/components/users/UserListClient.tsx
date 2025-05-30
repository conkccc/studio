
'use client';

import type { User } from '@/lib/types';
import React, { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { updateUserRoleAction } from '@/lib/actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface UserListClientProps {
  initialUsers: User[];
  currentAdminId: string | null; // ID of the currently logged-in admin
}

export function UserListClient({ initialUsers, currentAdminId }: UserListClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const handleRoleChange = (userId: string, newRole: User['role']) => {
    if (userId === currentAdminId) {
      toast({ title: '오류', description: '자신의 역할은 변경할 수 없습니다.', variant: 'destructive' });
      // Revert UI change if necessary, though Select might not commit without actual change
      // This typically requires handling the Select's onValueChange to prevent optimistic UI update
      // For simplicity, we rely on the action to fail and not update DB.
      // A more robust UI would reset the select value if the action fails.
      return;
    }

    startTransition(async () => {
      const result = await updateUserRoleAction(userId, newRole, currentAdminId);
      if (result.success && result.user) {
        setUsers(prevUsers => prevUsers.map(u => u.id === userId ? result.user! : u));
        toast({ title: '성공', description: `${result.user.name || result.user.email || userId}님의 역할이 ${newRole}(으)로 변경되었습니다.` });
      } else {
        toast({
          title: '오류',
          description: result.error || '사용자 역할 변경에 실패했습니다.',
          variant: 'destructive',
        });
        // Revert optimistic UI update if Select component was statefully managed
        // For now, we expect the user to see the old value if the server update fails
        // and the component re-renders with old props or refreshes.
        // To do this properly, the Select value should be controlled.
      }
    });
  };
  
  const formatDate = (dateInput: Date | import('firebase/firestore').Timestamp | undefined | null) => {
    if (!dateInput) return 'N/A';
    const date = dateInput instanceof import('firebase/firestore').Timestamp ? dateInput.toDate() : new Date(dateInput);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return format(date, 'yyyy.MM.dd HH:mm', { locale: ko });
  };


  return (
    <div className="space-y-4">
      {isPending && <div className="flex items-center space-x-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> <span>처리 중...</span></div>}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID (UID)</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>가입일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                  사용자가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-mono text-xs truncate max-w-[100px]" title={user.id}>{user.id}</TableCell>
                <TableCell>{user.name || '-'}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>
                  <Select
                    defaultValue={user.role}
                    onValueChange={(newRole) => handleRoleChange(user.id, newRole as User['role'])}
                    disabled={isPending || user.id === currentAdminId}
                  >
                    <SelectTrigger className="w-[100px] h-8 text-xs" disabled={isPending || user.id === currentAdminId}>
                      <SelectValue placeholder="역할 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                  {user.id === currentAdminId && <p className="text-xs text-muted-foreground mt-1">(본인)</p>}
                </TableCell>
                <TableCell className="text-xs">{formatDate(user.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
