'use client';

import type { Expense, Friend } from '@/lib/types';
import React, { useState, useTransition } from 'react';
import { Timestamp } from 'firebase/firestore';
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
  allFriends: Friend[]; // All friends in the system
  participants: Friend[]; // Friends participating in this specific meeting 
  onExpenseUpdated: (updatedExpense: Expense) => void;
  onExpenseDeleted: (deletedExpenseId: string) => void;
  isMeetingSettled: boolean;
  // canManage prop is now determined internally using AuthContext
}

export function ExpenseItem({ 
  expense, 
  meetingId,
  allFriends, 
  participants, // Participants of the current meeting
  onExpenseUpdated, 
  onExpenseDeleted,
  isMeetingSettled,
}: ExpenseItemProps) {
  const { currentUser, isAdmin } = useAuth(); // Get auth status
  const payer = allFriends.find(f => f.id === expense.paidById);
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false); // For delete operation
  const [isEditPending, setIsEditPending] = useState(false); // For edit dialog operations

  // Determine if the current user can manage this expense
  // Assuming meeting creator or admin can manage.
  // This requires knowing the meeting's creatorId, which is not directly passed.
  // For simplicity, we'll rely on isAdmin for now, or pass meetingCreatorId if needed.
  // Or, actions themselves should robustly check permissions.
  // For UI, isAdmin is a good first check.
  const canManage = isAdmin || (currentUser?.uid === expense.paidById) ; // Simplified: Admin or Payer (more granular would be meeting creator)
                                                                      // This should ideally be currentUser.uid === meeting.creatorId or isAdmin
  
  const getSplitDetails = () => { 
    if (expense.splitType === 'equally') {
      const involved = (expense.splitAmongIds
        ?.map(id => {
          const f = allFriends.find(f => f.id === id);
          return f ? f.name + (f.description ? ` (${f.description})` : '') : undefined;
        })
        .filter(Boolean) || []) as string[];
      // Check if all *meeting* participants are involved in this specific equal split
      const meetingParticipantNames = new Set(participants.map(p => p.name + (p.description ? ` (${p.description})` : '')));
      const allMeetingParticipantsInvolved = involved.length === meetingParticipantNames.size &&
                                           involved.every(name => meetingParticipantNames.has(name));
      if (allMeetingParticipantsInvolved) {
        return "모든 참여자";
      }
      if (involved.length === 0) return "참여자 정보 없음";
      return `균등 분배 (${involved.join(', ')})`;
    }
    if (expense.splitType === 'custom' && expense.customSplits) {
      const details = expense.customSplits
        .map(split => {
          const friend = allFriends.find(f => f.id === split.friendId);
          return `${friend ? friend.name + (friend.description ? ` (${friend.description})` : '') : '?'}: ${split.amount.toLocaleString()}원`;
        })
        .join(' / ');
      return `개별: ${details}`;
    }
    return '정보 없음';
  };
  
  const formatDate = (dateInput: Date | Timestamp) => {
    let date = dateInput instanceof Timestamp ? dateInput.toDate() : new Date(dateInput);
    if (!isValid(date)) return '날짜 정보 없음';
    return format(date, 'yyyy.MM.dd HH:mm', { locale: ko });
  };


  const handleDelete = () => {
    if (isMeetingSettled && !isAdmin) { // Admin might be able to delete even if settled (would unsettle meeting)
      toast({ title: '오류', description: '정산이 완료된 모임의 지출은 삭제할 수 없습니다.', variant: 'destructive' });
      return;
    }
    if (!canManage && !isAdmin) { // Double check, though button might be hidden
      toast({ title: '권한 없음', description: '이 지출 항목을 삭제할 권한이 없습니다.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id, meetingId, currentUser?.uid || null);
      if (result.success) {
        toast({ title: '성공', description: '지출 항목이 삭제되었습니다.' });
        onExpenseDeleted(expense.id);
      } else {
        toast({ title: '오류', description: result.error || '지출 항목 삭제에 실패했습니다.', variant: 'destructive' });
      }
      setIsDeleting(false);
    });
  };
  const [isTransitioning, startTransition] = useTransition(); // General pending state

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
      {(isAdmin) && ( // Simplified: only admin can manage expenses for now. Or pass meeting.creatorId for creator check.
        <div className="mt-3 flex justify-end space-x-2">
          <EditExpenseDialog 
            expenseToEdit={expense}
            meetingId={meetingId}
            participants={participants} // Pass actual meeting participants
            allFriends={allFriends} // Pass all friends for payer/split among mapping
            onExpenseUpdated={onExpenseUpdated}
            canManage={isAdmin} // Simplified canManage for dialog trigger
            isMeetingSettled={isMeetingSettled}
            triggerButton={
              <Button variant="ghost" size="sm" className="text-xs" disabled={isTransitioning || (isMeetingSettled && !isAdmin)}>
                <Edit3 className="mr-1 h-3 w-3" /> 수정
              </Button>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" disabled={isTransitioning || (isMeetingSettled && !isAdmin)}>
                <Trash2 className="mr-1 h-3 w-3" /> 삭제
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  이 작업은 되돌릴 수 없습니다. '{expense.description}' 지출 내역이 영구적으로 삭제됩니다.
                  {isMeetingSettled && isAdmin && " 정산이 완료된 모임이므로, 이 지출을 삭제하면 모임이 '미정산' 상태로 변경되고 회비 사용 내역이 되돌려집니다."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isTransitioning}>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isTransitioning} className="bg-destructive hover:bg-destructive/90">
                 {(isTransitioning) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
