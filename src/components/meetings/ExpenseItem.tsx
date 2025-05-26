'use client';

import type { Expense, Friend } from '@/lib/types';
import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { deleteExpenseAction } from '@/lib/actions'; // Assuming updateExpenseAction exists for editing
import { Coins, UserCircle, Users, CalendarClock, Edit3, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
// import { EditExpenseDialog } from './EditExpenseDialog'; // Placeholder for edit functionality

interface ExpenseItemProps {
  expense: Expense;
  allFriends: Friend[];
  participants: Friend[]; // Meeting participants
  currentUserId: string;
  onExpenseUpdated: (updatedExpense: Expense) => void;
  onExpenseDeleted: (deletedExpenseId: string) => void;
}

export function ExpenseItem({ 
  expense, 
  allFriends, 
  participants,
  currentUserId, 
  onExpenseUpdated, 
  onExpenseDeleted 
}: ExpenseItemProps) {
  const payer = allFriends.find(f => f.id === expense.paidById);
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const getSplitDetails = () => {
    if (expense.splitType === 'equally') {
      const involved = expense.splitAmongIds
        ?.map(id => allFriends.find(f => f.id === id)?.nickname)
        .filter(Boolean) || [];
      if (involved.length === 0 || involved.length === participants.length) return "모든 참여자"; // if all meeting participants are involved
      return `균등 분배 (${involved.join(', ')})`;
    }
    if (expense.splitType === 'custom' && expense.customSplits) {
      const details = expense.customSplits
        .map(split => {
          const friend = allFriends.find(f => f.id === split.friendId);
          return `${friend?.nickname || '?'}: ${split.amount.toLocaleString()}원`;
        })
        .join(' / ');
      return `개별: ${details}`;
    }
    return '정보 없음';
  };

  const handleDelete = () => {
    setIsDeleting(true);
    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id, expense.meetingId);
      if (result.success) {
        toast({ title: '성공', description: '지출 항목이 삭제되었습니다.' });
        onExpenseDeleted(expense.id);
      } else {
        toast({ title: '오류', description: result.error || '지출 항목 삭제에 실패했습니다.', variant: 'destructive' });
      }
      setIsDeleting(false);
    });
  };

  // Only creator of expense (payer) or meeting creator can edit/delete
  // Simplified: only payer for now, or meeting creator
  // For this exercise, we'll let currentUserId (mocked as meeting creator for now) manage.
  // A real app would have stricter permissions.
  const canManage = expense.paidById === currentUserId; // Or if meeting creator is currentUserId


  return (
    <li className="p-4 border rounded-lg bg-background shadow-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
        <div>
          <h4 className="font-semibold text-md">{expense.description}</h4>
          <p className="text-xs text-muted-foreground">
            {format(new Date(expense.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-primary">{expense.totalAmount.toLocaleString()}원</p>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4" />
          <span>결제자: {payer?.nickname || '알 수 없음'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>분배: {getSplitDetails()}</span>
        </div>
      </div>
      {canManage && (
        <div className="mt-3 flex justify-end space-x-2">
           {/* <EditExpenseDialog 
                expense={expense} 
                participants={participants} 
                allFriends={allFriends}
                onExpenseUpdated={onExpenseUpdated} 
                triggerButton={
                    <Button variant="ghost" size="sm" className="text-xs" disabled={isPending || isDeleting}>
                        <Edit3 className="mr-1 h-3 w-3" /> 수정
                    </Button>
                }
            /> */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" disabled={isPending || isDeleting}>
                <Trash2 className="mr-1 h-3 w-3" /> 삭제
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  이 작업은 되돌릴 수 없습니다. '{expense.description}' 지출 내역이 영구적으로 삭제됩니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending || isDeleting}>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isPending || isDeleting} className="bg-destructive hover:bg-destructive/90">
                 {(isPending || isDeleting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </li>
  );
}
