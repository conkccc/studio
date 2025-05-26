
'use client';

import React, { useState, useTransition } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createFriendAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation'; // Added for router.refresh()
import type { Friend } from '@/lib/types'; // Ensure Friend type is imported

const friendSchema = z.object({
  nickname: z.string().min(1, '닉네임을 입력해주세요.').max(50, '닉네임은 50자 이내여야 합니다.'),
  name: z.string().max(50, '이름은 50자 이내여야 합니다.').optional(),
});

type FriendFormData = z.infer<typeof friendSchema>;

interface AddFriendDialogProps {
  triggerButton?: React.ReactNode; // Optional custom trigger
  onFriendAdded?: (friend: Friend) => void; // Callback after successful addition, type changed to Friend
}

export function AddFriendDialog({ triggerButton, onFriendAdded }: AddFriendDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter(); // Initialize router

  const form = useForm<FriendFormData>({
    resolver: zodResolver(friendSchema),
    defaultValues: {
      nickname: '',
      name: '',
    },
  });

  const onSubmit = (data: FriendFormData) => {
    startTransition(async () => {
      const result = await createFriendAction(data.nickname, data.name);
      if (result.success) {
        toast({ title: '성공', description: '새로운 친구가 추가되었습니다.' });
        form.reset();
        setOpen(false); // Close dialog *before* refreshing
        router.refresh(); // Refresh server data for the current route
        if (onFriendAdded && result.friend) { // Ensure result.friend exists for the callback
          onFriendAdded(result.friend);
        }
      } else {
        toast({
          title: '오류',
          description: result.error || '친구 추가에 실패했습니다.',
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton ? triggerButton : <Button>새 친구 추가</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>새 친구 추가</DialogTitle>
          <DialogDescription>새로운 친구의 정보를 입력해주세요.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="nickname" className="text-right">
              닉네임 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nickname"
              {...form.register('nickname')}
              className="col-span-3"
              disabled={isPending}
            />
          </div>
          {form.formState.errors.nickname && (
            <p className="col-span-4 text-right text-sm text-destructive">
              {form.formState.errors.nickname.message}
            </p>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              이름 (선택)
            </Label>
            <Input
              id="name"
              {...form.register('name')}
              className="col-span-3"
              disabled={isPending}
            />
          </div>
          {form.formState.errors.name && (
            <p className="col-span-4 text-right text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
