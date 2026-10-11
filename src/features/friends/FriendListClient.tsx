'use client';

import type { Friend } from '@/lib/types';
import React, { useState, useTransition, Fragment, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { updateFriendAction, deleteFriendAction, getFriendsByGroupAction } from '@/lib/client-actions';
import { useAuth } from '@/contexts/AuthContext';
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
import type { PaymentInfo } from '@/lib/payment-info';
import { PaymentInfoFields } from './PaymentInfoFields';
import { registeredPaymentAccount } from '@/lib/payment-info';

interface FriendListClientProps {
  initialFriends: Friend[];
  onFriendAdded?: () => void;
  onFriendDeleted?: (friendId: string) => void;
  onFriendUpdated?: (friend: Friend) => void;
}

export function FriendListClient({ initialFriends, isReadOnly = false, onFriendDeleted, onFriendUpdated }: FriendListClientProps & { isReadOnly?: boolean }) {
  const [friends, setFriends] = useState<Friend[]>(initialFriends);
  const [editingFriendId, setEditingFriendId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description?: string; paymentInfo: PaymentInfo }>({ name: '', description: '', paymentInfo: {} });
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { appUser } = useAuth();

  useEffect(() => {
    setFriends(initialFriends);
  }, [initialFriends]);

  const handleEdit = (friend: Friend) => {
    setEditingFriendId(friend.id);
    setEditForm({ name: friend.name, description: friend.description || '', paymentInfo: friend.paymentInfo || {} });
  };

  const handleCancelEdit = () => {
    setEditingFriendId(null);
  };

  const handleSaveEdit = (id: string) => {
    if (!editForm.name.trim()) {
      toast({ title: '오류', description: '이름은 비워둘 수 없습니다.', variant: 'destructive' });
      return;
    }
    startTransition(async () => {
      const result = await updateFriendAction(id, editForm);
      if (result.success && result.friend) {
        setFriends(prev => prev.map(f => (f.id === id ? result.friend! : f)));
        onFriendUpdated?.(result.friend);
        setEditingFriendId(null);
        toast({ title: '성공', description: '친구 정보가 수정되었습니다.' });
      } else {
        toast({ title: '오류', description: result.error || '친구 정보 수정에 실패했습니다.', variant: 'destructive' });
      }
    });
  };

  const handleDelete = (friendId: string) => {
    const friendToDelete = friends.find(f => f.id === friendId);
    if (!friendToDelete) {
      toast({ title: '오류', description: '삭제할 친구 정보를 찾을 수 없습니다.', variant: 'destructive' });
      return;
    }
    if (!friendToDelete.groupId) {
      toast({ title: '오류', description: '친구의 그룹 정보가 없습니다. 삭제할 수 없습니다.', variant: 'destructive' });
      return;
    }
    if (!appUser?.id) {
      toast({ title: '오류', description: '사용자 인증 정보를 찾을 수 없습니다. 다시 로그인해주세요.', variant: 'destructive' });
      return;
    }

    startTransition(async () => {
      const result = await deleteFriendAction({
        friendId: friendToDelete.id,
        groupId: friendToDelete.groupId,
        currentUserId: appUser.id,
      });
      if (result.success) {
        setFriends(prev => prev.filter(f => f.id !== friendToDelete.id));
        toast({ title: '성공', description: `'${friendToDelete.name}' 친구가 삭제되었습니다.` });
        onFriendDeleted?.(friendToDelete.id);
      } else {
        toast({ title: '오류', description: result.error || '친구 삭제에 실패했습니다.', variant: 'destructive' });
      }
    });
  };

  return (
    <TooltipProvider>
      <ul className="space-y-3">
        {friends.map((friend) => (
          <li key={friend.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-secondary/50 rounded-lg shadow-sm hover:bg-secondary transition-colors">
            {editingFriendId === friend.id ? (
              <Fragment>
                <div className="min-w-0 flex-grow grid grid-cols-1 sm:grid-cols-2 gap-2 items-center mr-2">
                  <Input
                    aria-label="친구 이름"
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="이름"
                    disabled={isPending || isReadOnly}
                  />
                  <Input
                    aria-label="친구 설명"
                    type="text"
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="설명 (선택)"
                    disabled={isPending || isReadOnly}
                  />
                  <div className="sm:col-span-2"><PaymentInfoFields value={editForm.paymentInfo} onChange={paymentInfo => setEditForm({ ...editForm, paymentInfo })} disabled={isPending || isReadOnly} /></div>
                </div>
                <div className="flex space-x-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button aria-label={`${friend.name} 정보 저장`} size="sm" onClick={() => handleSaveEdit(friend.id)} disabled={isPending || isReadOnly}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                        <span className="ml-1">저장</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>저장</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isPending || isReadOnly}>
                        <X className="h-4 w-4 text-red-600" />
                        <span className="ml-1">취소</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>취소</p></TooltipContent>
                  </Tooltip>
                </div>
              </Fragment>
            ) : (
              <Fragment>
                <div className="flex min-w-0 items-center">
                  <User className="h-5 w-5 shrink-0 mr-3 text-primary" />
                  <div>
                    <span className="font-medium">{friend.name}</span>
                    {friend.description && <span className="text-xs text-muted-foreground ml-2">({friend.description})</span>}
                    <p className="mt-1 text-xs text-muted-foreground">{registeredPaymentAccount(friend.paymentInfo) ? `${friend.paymentInfo!.bankName} · 계좌 등록됨` : '계좌 미등록'}</p>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button aria-label={`${friend.name} 정보 및 계좌 수정`} variant="outline" size="sm" onClick={() => handleEdit(friend)} className="h-9 whitespace-nowrap" disabled={isPending || isReadOnly}>
                        <Edit3 className="mr-1 h-4 w-4" />{registeredPaymentAccount(friend.paymentInfo) ? '정보 수정' : '계좌 등록'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>친구 정보와 송금받을 계좌 수정</p></TooltipContent>
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
                          '{friend.name}' 친구를 현재 목록에서 제외합니다. 과거 모임과 정산 기록은 유지됩니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending || isReadOnly}>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(friend.id)} disabled={isPending || isReadOnly} variant="destructive">
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

interface FriendListByGroupProps {
  groupId: string;
  isReadOnly?: boolean;
}

export function FriendListByGroup({ groupId, isReadOnly = false }: FriendListByGroupProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  const handleFriendAdded = () => {
    setLoading(true);
    getFriendsByGroupAction(groupId).then(res => {
      if (res.success && res.friends) setFriends(res.friends);
      else setFriends([]);
      setLoading(false);
    });
  };

  useEffect(() => {
    setLoading(true);
    getFriendsByGroupAction(groupId).then(res => {
      if (res.success && res.friends) setFriends(res.friends);
      else setFriends([]);
      setLoading(false);
    });
  }, [groupId]);

  if (loading) return <div>친구 목록 로딩 중...</div>;
  if (friends.length === 0) return <div>이 그룹에 등록된 친구가 없습니다.</div>;

  return <FriendListClient initialFriends={friends} isReadOnly={isReadOnly} onFriendAdded={handleFriendAdded} />;
}
