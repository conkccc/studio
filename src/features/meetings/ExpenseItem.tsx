'use client';

import type { Expense, Friend } from '@/lib/types';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { deleteExpenseAction } from '@/lib/actions';
import { UserCircle, Users, Edit3, Trash2, Loader2 } from 'lucide-react';
import { format, isValid } from 'date-fns';
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
} from '@/components/ui/alert-dialog';
import { EditExpenseDialog } from './EditExpenseDialog';
import { useAuth } from '@/contexts/AuthContext';


interface ExpenseItemProps {
  expense: Expense;
  meetingId: string;
  allFriends: Friend[]; // 시스템의 모든 친구 목록 (payer 이름 찾기 등)
  participants: Friend[]; // 현재 모임에 참여한 친구 목록 (분배 대상 등)
  onExpenseUpdated: (updatedExpense: Expense) => void;
  onExpenseDeleted: (deletedExpenseId: string) => void;
  isCreator: boolean;
  isMeetingSettled: boolean;
  isTemporaryMeeting?: boolean;
  isReadOnly?: boolean;
}

export function ExpenseItem({
  expense,
  meetingId,
  allFriends,
  participants,
  onExpenseUpdated,
  onExpenseDeleted,
  isCreator,
  isMeetingSettled,
  isTemporaryMeeting,
  isReadOnly = false,
}: ExpenseItemProps) {
  const { currentUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const payer = isTemporaryMeeting
    ? participants.find(p => p.id === expense.paidById)
    : allFriends.find(f => f.id === expense.paidById);

  const canModify = (isAdmin || isCreator) && !isReadOnly && !isMeetingSettled;

  const getSplitDetails = (): string => {
    if (expense.splitType === 'equally') {
      const involvedNames = (expense.splitAmongIds
        ?.map(splitId => {
          let friend: Friend | undefined;
          if (isTemporaryMeeting) {
            friend = participants.find(p => p.id === splitId);
          }
          if (!friend) {
            friend = allFriends.find(f => f.id === splitId);
          }
          return friend ? friend.name + (friend.description ? ` (${friend.description})` : '') : undefined;
        })
        .filter(Boolean) || []) as string[];

      const allMeetingParticipantsInvolved = isTemporaryMeeting
        ? (() => {
            const splitAmongIdsSet = new Set(expense.splitAmongIds || []);
            const participantIdsSet = new Set(participants.map(p => p.id));
            return splitAmongIdsSet.size === participantIdsSet.size &&
              [...splitAmongIdsSet].every(id => participantIdsSet.has(id));
          })()
        : (() => {
            const involvedParticipantNames = new Set(involvedNames);
            const meetingParticipantFullNames = new Set(participants.map(p => p.name + (p.description ? ` (${p.description})` : '')));
            return involvedNames.length === participants.length &&
              participants.length > 0 &&
              [...meetingParticipantFullNames].every(name => involvedParticipantNames.has(name));
          })();

      if (allMeetingParticipantsInvolved && involvedNames.length > 0) {
        return "모든 참여자";
      }
      if (involvedNames.length === 0) return "참여자 정보 없음";
      return `균등 분배 (${involvedNames.join(', ')})`;
    }
    if (expense.splitType === 'custom' && expense.customSplits) {
      const details = expense.customSplits
        .map(customSplit => {
          let friend: Friend | undefined;
          if (isTemporaryMeeting) {
            friend = participants.find(p => p.id === customSplit.friendId);
          }
          if (!friend) {
            friend = allFriends.find(f => f.id === customSplit.friendId);
          }
          return `${friend ? friend.name + (friend.description ? ` (${friend.description})` : '') : '?'}: ${customSplit.amount.toLocaleString()}원`;
        })
        .join(' / ');
      return `개별: ${details}`;
    }
    return '정보 없음';
  };

  const formatDate = (dateInput: Date | { toDate: () => Date }): string => {
    const date = dateInput instanceof Date ? dateInput : dateInput && typeof dateInput.toDate === 'function' ? dateInput.toDate() : new Date(NaN);
    if (!isValid(date)) return '날짜 정보 없음';
    return format(date, 'yyyy.MM.dd HH:mm', { locale: ko });
  };

  const handleDelete = async () => {
    if (isTransitioning) return;
    if (!canModify) {
      toast({ title: '삭제할 수 없습니다', description: isMeetingSettled ? '정산을 다시 연 뒤 지출을 삭제해주세요.' : '이 화면에서는 지출을 변경할 수 없습니다.', variant: 'destructive' });
      return;
    }

    setIsTransitioning(true);
    try {
      const result = await deleteExpenseAction(expense.id, meetingId, currentUser?.uid || null);
      if (result.success) {
        toast({ title: '성공', description: '지출 항목이 삭제되었습니다.' });
        onExpenseDeleted(expense.id);
      } else {
        toast({ title: '오류', description: result.error || '지출 항목 삭제에 실패했습니다.', variant: 'destructive' });
      }
    } catch {
      toast({ title: '오류', description: '지출을 삭제하지 못했습니다. 다시 시도해주세요.', variant: 'destructive' });
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <li className="p-4 border rounded-lg bg-background shadow-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
        <div>
          <h4 className="font-semibold text-md">{expense.description}</h4>
          <p className="text-xs text-muted-foreground">
            {formatDate(expense.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-primary">{expense.totalAmount.toLocaleString()}원</p>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4" />
          <span>결제자: {payer ? payer.name + (payer.description ? ` (${payer.description})` : '') : '알 수 없음'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>분배: {getSplitDetails()}</span>
        </div>
      </div>
      {(canModify) && (
        <div className="mt-3 flex justify-end space-x-2">
          <EditExpenseDialog
            expenseToEdit={expense}
            meetingId={meetingId}
            participants={participants}
            onExpenseUpdated={onExpenseUpdated}
            canManage={canModify}
            isMeetingSettled={isMeetingSettled}
            triggerButton={
              <Button variant="ghost" size="sm" className="text-xs" disabled={isTransitioning || !canModify}>
                <Edit3 className="mr-1 h-3 w-3" /> 수정
              </Button>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" disabled={isTransitioning || !canModify}>
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
                <AlertDialogCancel disabled={isTransitioning}>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isTransitioning || !canModify} variant="destructive">
                 {isTransitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
