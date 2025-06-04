'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { createFriendAction } from '@/lib/actions';
import type { Friend } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const addFriendSchema = z.object({
  name: z.string().min(1, '친구 이름은 필수입니다.').max(50, '친구 이름은 50자 이내여야 합니다.'),
  description: z.string().max(100, '설명은 100자 이내여야 합니다.').optional(),
});

type AddFriendFormData = z.infer<typeof addFriendSchema>;

interface AddFriendToGroupDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  groupId: string | null;
  groupName?: string;
  onFriendAdded: (newFriend: Friend) => void;
}

export function AddFriendToGroupDialog({
  isOpen,
  setIsOpen,
  groupId,
  groupName,
  onFriendAdded,
}: AddFriendToGroupDialogProps) {
  const { appUser } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AddFriendFormData>({
    resolver: zodResolver(addFriendSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({ name: '', description: '' });
    }
  }, [isOpen, groupId, form]);

  const onSubmit = async (data: AddFriendFormData) => {
    if (!groupId || !appUser?.id) {
      toast({ title: "오류", description: "필수 정보(그룹 또는 사용자 ID)가 없습니다.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createFriendAction({
        ...data,
        groupId: groupId,
        currentUserId: appUser.id,
      });

      if (result.success && result.friend) {
        toast({ title: "성공", description: `'${result.friend.name}' 친구를 '${groupName || groupId}' 그룹에 추가했습니다.` });
        onFriendAdded(result.friend);
        setIsOpen(false);
      } else {
        toast({ title: "오류", description: result.error || "친구 추가에 실패했습니다.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "오류", description: "친구 추가 중 예외가 발생했습니다.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!groupId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>'{groupName || groupId}' 그룹에 새 친구 추가</DialogTitle>
          <DialogDescription>
            새로운 친구의 이름과 선택적으로 설명을 입력해주세요.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">이름 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              {...form.register('name')}
              disabled={isSubmitting}
              placeholder="친구 이름"
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="description">설명 (선택)</Label>
            <Textarea
              id="description"
              {...form.register('description')}
              disabled={isSubmitting}
              placeholder="친구에 대한 간단한 설명 (예: 직장 동료)"
            />
            {form.formState.errors.description && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              친구 추가
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
