'use client';

import type { Friend } from '@/lib/types';
import React, { useState, useTransition, Fragment, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { updateFriendAction, deleteFriendAction } from '@/lib/actions';
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
import { Edit3, Trash2, User, Check, X, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FriendListClientProps {
  initialFriends: Friend[];
}

export function FriendListClient({ initialFriends, isReadOnly = false }: FriendListClientProps & { isReadOnly?: boolean }) {
  const [friends, setFriends] = useState<Friend[]>(initialFriends);
  const [editingFriendId, setEditingFriendId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ nickname: string; name?: string }>({ nickname: '', name: '' });
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setFriends(initialFriends);
  }, [initialFriends]);

  const handleEdit = (friend: Friend) => {
    setEditingFriendId(friend.id);
    setEditForm({ nickname: friend.nickname, name: friend.name || '' });
  };

  const handleCancelEdit = () => {
    setEditingFriendId(null);
  };

  const handleSaveEdit = (id: string) => {
    if (!editForm.nickname.trim()) {
      toast({ title: '오류', description: '닉네임은 비워둘 수 없습니다.', variant: 'destructive' });
      return;
    }
    startTransition(async () => {
      const result = await updateFriendAction(id, { nickname: editForm.nickname, name: editForm.name });
      if (result.success && result.friend) {
        setFriends(prev => prev.map(f => (f.id === id ? result.friend! : f)));
        setEditingFriendId(null);
        toast({ title: '성공', description: '친구 정보가 수정되었습니다.' });
      } else {
        toast({ title: '오류', description: result.error || '친구 정보 수정에 실패했습니다.', variant: 'destructive' });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteFriendAction(id);
      if (result.success) {
        setFriends(prev => prev.filter(f => f.id !== id));
        toast({ title: '성공', description: '친구가 삭제되었습니다.' });
      } else {
        toast({ title: '오류', description: result.error || '친구 삭제에 실패했습니다.', variant: 'destructive' });
      }
    });
  };

  return (
    <TooltipProvider>
      <ul className="space-y-3">
        {friends.map((friend) => (
          <li key={friend.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg shadow-sm hover:bg-secondary transition-colors">
            {editingFriendId === friend.id ? (
              <Fragment>
                <div className="flex-grow grid grid-cols-2 gap-2 items-center mr-2">
                  <Input
                    type="text"
                    value={editForm.nickname}
                    onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="닉네임"
                    disabled={isPending || isReadOnly}
                  />
                  <Input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="이름 (선택)"
                    disabled={isPending || isReadOnly}
                  />
                </div>
                <div className="flex space-x-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => handleSaveEdit(friend.id)} className="h-8 w-8" disabled={isPending || isReadOnly}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>저장</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleCancelEdit} className="h-8 w-8" disabled={isPending || isReadOnly}>
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>취소</p></TooltipContent>
                  </Tooltip>
                </div>
              </Fragment>
            ) : (
              <Fragment>
                <div className="flex items-center">
                  <User className="h-5 w-5 mr-3 text-primary" />
                  <div>
                    <span className="font-medium">{friend.nickname}</span>
                    {friend.name && <span className="text-xs text-muted-foreground ml-2">({friend.name})</span>}
                  </div>
                </div>
                <div className="flex space-x-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(friend)} className="h-8 w-8" disabled={isPending || isReadOnly}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>수정</p></TooltipContent>
                  </Tooltip>
                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isPending || isReadOnly}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent><p>삭제</p></TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                          이 작업은 되돌릴 수 없습니다. '{friend.nickname}' 친구 정보가 영구적으로 삭제됩니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending || isReadOnly}>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(friend.id)} disabled={isPending || isReadOnly} className="bg-destructive hover:bg-destructive/90">
                          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          삭제
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Fragment>
            )}
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}
