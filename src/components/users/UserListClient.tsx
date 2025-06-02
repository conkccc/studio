'use client';

import type { User } from '@/lib/types';
import React, { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { updateUserRoleAction } from '@/lib/actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';


interface UserListClientProps {
  initialUsers: User[];
  currentAdminId: string;
  isAdmin: boolean;
}

export function UserListClient({ initialUsers, currentAdminId, isAdmin }: UserListClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const handleRoleChange = (userIdToUpdate: string, newRole: User['role']) => {
    if (userIdToUpdate === currentAdminId) {
      toast({ title: '오류', description: '자신의 역할은 변경할 수 없습니다.', variant: 'destructive' });
      // Revert UI change if Select was uncontrolled and optimistically updated.
      // For controlled Select, this won't be an issue as state won't change until server confirms.
      const originalUser = initialUsers.find(u => u.id === userIdToUpdate);
      if (originalUser) {
        // This forces a re-render if the select value was somehow changed client-side before this check
        setUsers(prev => prev.map(u => u.id === userIdToUpdate ? {...u, role: originalUser.role} : u));
      }
      return;
    }

    startTransition(async () => {
      // Pass currentAdminId for server-side validation if needed by the action,
      // though primary validation should be via Firestore rules based on the CALLER's auth.
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
        // Revert optimistic UI update
        const originalUser = users.find(u => u.id === userIdToUpdate); // or initialUsers if state sync is perfect
         if (originalUser) {
            // This helps reset the select if it was optimistically changed by the user
            // but the server action failed. For a controlled Select, this is more robust.
            // Here, we're assuming the Select value might need resetting.
            // The select's value prop should be tied to user.role from the `users` state.
         }
      }
    });
  };
  
  const formatDate = (dateInput: Date | Timestamp | undefined | null) => {
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && !isPending && ( // Show only if not pending and users is empty
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                  사용자가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name || '-'}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>
                  <Select
                    value={user.role} // Controlled component
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
