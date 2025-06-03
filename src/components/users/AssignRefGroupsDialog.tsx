'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox'; // Using Checkbox for multi-select
import { ScrollArea } from '@/components/ui/scroll-area'; // For scrollable group list
import type { User, FriendGroup } from '@/lib/types';
import { assignRefFriendGroupsToUserAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface AssignRefGroupsDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  targetUser: User | null;
  allFriendGroups: FriendGroup[];
  currentAdminId: string; // To pass to the action
  onUserUpdated: (updatedUser: User) => void; // Callback to update user list
}

export function AssignRefGroupsDialog({
  isOpen,
  setIsOpen,
  targetUser,
  allFriendGroups,
  currentAdminId,
  onUserUpdated,
}: AssignRefGroupsDialogProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (targetUser && targetUser.refFriendGroupIds) {
      setSelectedGroupIds(targetUser.refFriendGroupIds);
    } else {
      setSelectedGroupIds([]);
    }
  }, [targetUser]);

  if (!targetUser) return null;

  const handleCheckboxChange = (groupId: string) => {
    setSelectedGroupIds(prevSelectedIds =>
      prevSelectedIds.includes(groupId)
        ? prevSelectedIds.filter(id => id !== groupId)
        : [...prevSelectedIds, groupId]
    );
  };

  const handleSubmit = async () => {
    if (!currentAdminId || !targetUser) {
      toast({ title: '오류', description: '필수 정보가 없습니다.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await assignRefFriendGroupsToUserAction(
        currentAdminId,
        targetUser.id,
        selectedGroupIds
      );

      if (result.success && result.user) {
        toast({ title: '성공', description: `${targetUser.name || targetUser.email}님의 참조 그룹이 업데이트되었습니다.` });
        onUserUpdated(result.user); // Update user data in the parent component
        setIsOpen(false);
      } else {
        toast({ title: '오류', description: result.error || '참조 그룹 업데이트에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: '오류', description: '참조 그룹 업데이트 중 예기치 않은 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>참조 그룹 할당</DialogTitle>
          <DialogDescription>
            {targetUser.name || targetUser.email} 사용자에게 공유할 그룹을 선택하세요. 선택된 그룹의 모임 및 회비 정보를 볼 수 있게 됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <h3 className="mb-2 text-sm font-medium">사용 가능한 그룹:</h3>
          {allFriendGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">사용 가능한 친구 그룹이 없습니다.</p>
          ) : (
            <ScrollArea className="h-[200px] w-full rounded-md border p-4">
              {allFriendGroups.map(group => (
                <div key={group.id} className="flex items-center space-x-2 mb-2">
                  <Checkbox
                    id={`group-${group.id}`}
                    checked={selectedGroupIds.includes(group.id)}
                    onCheckedChange={() => handleCheckboxChange(group.id)}
                    disabled={isSubmitting}
                  />
                  <label
                    htmlFor={`group-${group.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {group.name}
                  </label>
                </div>
              ))}
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>취소</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={isSubmitting || allFriendGroups.length === 0}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
