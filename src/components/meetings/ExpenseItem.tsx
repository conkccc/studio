
'use client';

import type { Expense, Friend } from '@/lib/types';
import React, { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { deleteExpenseAction } from '@/lib/actions';
import { UserCircle, Users, Edit3, Trash2, Loader2 } from 'lucide-react';
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
import { EditExpenseDialog } from './EditExpenseDialog'; 

interface ExpenseItemProps {
  expense: Expense;
  meetingId: string; // Added meetingId
  allFriends: Friend[];
  participants: Friend[]; 
  onExpenseUpdated: (updatedExpense: Expense) => void;
  onExpenseDeleted: (deletedExpenseId: string) => void;
  isMeetingSettled: boolean;
  canManage: boolean; 
}

export function ExpenseItem({ 
  expense, 
  meetingId, // Use meetingId from props
  allFriends, 
  participants,
  onExpenseUpdated, 
  onExpenseDeleted,
  isMeetingSettled,
  canManage
}: ExpenseItemProps) {
  const payer = allFriends.find(f => f.id === expense.paidById);
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPending, startTransition] = useTransition(); // General pending state

  const getSplitDetails = () => {
    if (expense.splitType === 'equally') {
      const involved = expense.splitAmongIds
        ?.map(id => allFriends.find(f => f.id === id)?.nickname)
        .filter(Boolean) || [];
      if (involved.length > 0 && involved.length === participants.length && participants.every(p => involved.includes(p.nickname))) {
        return "모든 참여자";
      }
      if (involved.length === 0) return "참여자 정보 없음";
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
    if (isMeetingSettled && canManage) { // Allow admin to delete even if settled, but it will unsettle the meeting
        // This case will be handled by the action to unsettle if necessary
    } else if (isMeetingSettled) {
      toast({ title: '오류', description: '정산이 완료된 모임의 지출은 삭제할 수 없습니다.', variant: 'destructive' });
      return;
    }
    if (!canManage) {
      toast({ title: '권한 없음', description: '이 지출 항목을 삭제할 권한이 없습니다.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id, meetingId); // Pass expense.id and meetingId
      if (result.success) {
        toast({ title: '성공', description: '지출 항목이 삭제되었습니다.' });
        onExpenseDeleted(expense.id);
      } else {
        toast({ title: '오류', description: result.error || '지출 항목 삭제에 실패했습니다.', variant: 'destructive' });
      }
      setIsDeleting(false);
    });
  };

  return (
    <li className="p-4 border rounded-lg bg-background shadow-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
        <div>
          <h4 className="font-semibold text-md">{expense.description}</h4>
          <p className="text-xs text-muted-foreground">
            {expense.createdAt ? format(expense.createdAt, 'yyyy.MM.dd HH:mm', { locale: ko }) : '날짜 정보 없음'}
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
          <EditExpenseDialog 
            expenseToEdit={expense}
            meetingId={meetingId}
            participants={participants}
            allFriends={allFriends}
            onExpenseUpdated={onExpenseUpdated}
            canManage={canManage}
            isMeetingSettled={isMeetingSettled}
            triggerButton={
              <Button variant="ghost" size="sm" className="text-xs" disabled={isPending || isDeleting || (isMeetingSettled && !canManage)}>
                <Edit3 className="mr-1 h-3 w-3" /> 수정
              </Button>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" disabled={isPending || isDeleting || (isMeetingSettled && !canManage)}>
                <Trash2 className="mr-1 h-3 w-3" /> 삭제
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  이 작업은 되돌릴 수 없습니다. '{expense.description}' 지출 내역이 영구적으로 삭제됩니다.
                  {isMeetingSettled && canManage && " 정산이 완료된 모임이므로, 이 지출을 삭제하면 모임이 '미정산' 상태로 변경되고 회비 사용 내역이 되돌려집니다."}
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

    