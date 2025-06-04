'use client';

// Removed specific import of ReserveFundTransaction as it's imported later with other types
import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  setReserveFundBalanceAction,
  getFriendGroupsForUserAction,
  getAllUsersAction // Import getAllUsersAction
} from '@/lib/actions';
import {
  getReserveFundBalanceByGroup,
  getLoggedReserveFundTransactionsByGroup
} from '@/lib/data-store'; // Assuming direct use for now
import type { ReserveFundTransaction, FriendGroup, User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { TrendingDown, Edit, Loader2, History, PiggyBank, Landmark, Users } from 'lucide-react'; // Added icons
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // For group selection
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
import { useAuth } from '@/contexts/AuthContext'; // Corrected path

type DisplayFriendGroup = FriendGroup & { isOwned: boolean };

const balanceUpdateSchema = z.object({
  newBalance: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val),
    z.number().min(0, '잔액은 0 이상이어야 합니다.')
  ),
  description: z.string().min(1, "설명을 입력해주세요.").max(100, "설명은 100자 이내여야 합니다.").optional(),
});

type BalanceUpdateFormData = z.infer<typeof balanceUpdateSchema>;

export function ReserveFundClient() {
  const { currentUser, appUser, loading: authLoading } = useAuth(); // Added appUser, authLoading
  const [accessibleGroups, setAccessibleGroups] = useState<DisplayFriendGroup[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // State for all users
  const [selectedGroup, setSelectedGroup] = useState<DisplayFriendGroup | null>(null);
  const [transactions, setTransactions] = useState<ReserveFundTransaction[]>([]);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(true); // Combined loading state for groups and users
  const [isLoadingFundDetails, setIsLoadingFundDetails] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isSubmitting, startTransition] = useTransition(); // For form submission
  const { toast } = useToast();

  const form = useForm<BalanceUpdateFormData>({
    resolver: zodResolver(balanceUpdateSchema),
    defaultValues: { newBalance: 0, description: '수동 잔액 조정' },
  });

  // Fetch accessible groups and all users
  useEffect(() => {
    if (authLoading || !currentUser?.uid || !appUser?.id) {
      setIsLoadingData(false);
      setAccessibleGroups([]);
      setAllUsers([]);
      return;
    }
    setIsLoadingData(true);
    Promise.all([
      getFriendGroupsForUserAction(appUser.id),
      getAllUsersAction()
    ]).then(([groupsResult, usersResult]) => {
      if (groupsResult.success && groupsResult.groups) {
        // getFriendGroupsForUserAction already sets isOwned and isReferenced
        setAccessibleGroups(groupsResult.groups as DisplayFriendGroup[]);
        // Auto-select first group if available (optional, can be removed if explicit selection is preferred)
        // if (groupsResult.groups.length > 0) {
        //   setSelectedGroup(groupsResult.groups[0] as DisplayFriendGroup);
        // }
      } else {
        toast({ title: '오류', description: groupsResult.error || '접근 가능한 그룹 목록을 불러오지 못했습니다.', variant: 'destructive' });
        setAccessibleGroups([]);
      }

      if (usersResult.success && usersResult.users) {
        setAllUsers(usersResult.users);
      } else {
        toast({ title: '오류', description: usersResult.error || '사용자 목록을 불러오는데 실패했습니다.', variant: 'destructive' });
        setAllUsers([]);
      }
    }).catch(() => {
      toast({ title: '오류', description: '초기 데이터 로딩 중 오류 발생.', variant: 'destructive' });
      setAccessibleGroups([]);
      setAllUsers([]);
    }).finally(() => setIsLoadingData(false));
  }, [currentUser?.uid, appUser, authLoading, toast]); // appUser.id is part of appUser dependency

  // Fetch fund details when selectedGroup changes
  useEffect(() => {
    if (!selectedGroup) {
      setCurrentBalance(null);
      setTransactions([]);
      return;
    }
    setIsLoadingFundDetails(true);
    Promise.all([
      getReserveFundBalanceByGroup(selectedGroup.id),
      getLoggedReserveFundTransactionsByGroup(selectedGroup.id, 20) // Fetch more transactions
    ]).then(([balanceResult, transactionsResult]) => {
      setCurrentBalance(balanceResult === null ? 0 : balanceResult); // Treat null balance as 0 for display/form
      form.reset({ newBalance: balanceResult === null ? 0 : balanceResult, description: '수동 잔액 조정'});
      // Assuming getLogged... returns array directly
      setTransactions(transactionsResult || []);
    }).catch(() => {
      toast({ title: '오류', description: `${selectedGroup.name} 그룹의 회비 정보를 가져오는데 실패했습니다.`, variant: 'destructive'});
      setCurrentBalance(0); // Reset on error
      setTransactions([]);
      form.reset({ newBalance: 0, description: '수동 잔액 조정'});
    }).finally(() => setIsLoadingFundDetails(false));
  }, [selectedGroup, toast, form]);


  const handleBalanceUpdate = (data: BalanceUpdateFormData) => {
    if (!selectedGroup || !appUser) return;
    // Updated permission check to align with UI visibility (canSetBalance logic)
    if (!(appUser.role === 'admin' || (appUser.role === 'user' && selectedGroup.isOwned))) {
      toast({ title: '권한 없음', description: '그룹 소유자 또는 관리자만 잔액을 수정할 수 있습니다.', variant: 'destructive'});
      return;
    }
    startTransition(async () => {
      const newBalance = typeof data.newBalance === 'number' ? data.newBalance : parseFloat(String(data.newBalance));
      const result = await setReserveFundBalanceAction(selectedGroup.id, newBalance, data.description || '', appUser.id); // Use appUser.id

      if (result.success && result.newBalance !== undefined) {
        toast({ title: '성공', description: '회비 잔액이 업데이트되었습니다.' });
        setCurrentBalance(result.newBalance);
        // Optimistically add/update transaction log or re-fetch
        const newLogEntry: ReserveFundTransaction = {
          id: `temp-${Date.now()}`, // Temporary ID
          groupId: selectedGroup.id,
          type: 'balance_update',
          amount: result.newBalance, // For balance_update, amount is the new balance.
          description: data.description || `잔액 ${result.newBalance.toLocaleString()}원으로 설정됨`,
          date: new Date(),
        };
        setTransactions(prev => [newLogEntry, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0,20));
        form.reset({ newBalance: result.newBalance, description: '수동 잔액 조정' });
        setIsUpdateDialogOpen(false);
      } else {
        toast({ title: '오류', description: result.error || '잔액 업데이트에 실패했습니다.', variant: 'destructive' });
      }
    });
  };
  
  const formatNumber = (value: number | string | undefined | null) => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') return value.toLocaleString();
    const num = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(num) ? String(value) : num.toLocaleString();
  };

  const isAdmin = appUser?.role === 'admin';
  const canSetBalance = appUser?.role === 'admin' || (appUser?.role === 'user' && selectedGroup?.isOwned === true);
  // const isViewer = appUser?.role === 'viewer'; // Not directly used, but good for clarity if needed

  const handleGroupSelect = (groupId: string) => {
    const group = accessibleGroups.find(g => g.id === groupId);
    setSelectedGroup(group || null);
  };

  if (authLoading || isLoadingData) {
    return <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">정보 로딩 중...</p></div>;
  }

  if (!appUser) {
     return <p className="text-center text-muted-foreground py-8">로그인이 필요합니다.</p>;
  }

  if (accessibleGroups.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center"><Landmark className="mr-2 h-6 w-6 text-primary" /> 회비 관리</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">접근 가능한 친구 그룹이 없습니다. 그룹에 참여하거나 새 그룹을 만들어보세요.</p>
        </CardContent>
      </Card>
    );
  }

  // Simplified main title for cards when a group is selected
  const simpleGroupTitle = selectedGroup ? `${selectedGroup.name} 회비` : "그룹 회비";

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center mb-2"> {/* Added mb-2 for spacing below title */}
            <Users className="mr-2 h-6 w-6 text-primary" />
            그룹 선택
          </CardTitle>
        </CardHeader>
        <CardContent> {/* Moved Select into CardContent for better layout control */}
          <div className="flex items-center space-x-2 mb-4"> {/* Container for Label + Select */}
            <Label htmlFor="group-select-dropdown" className="text-sm font-medium">선택된 그룹:</Label>
            <Select onValueChange={handleGroupSelect} value={selectedGroup?.id || ""}>
              <SelectTrigger id="group-select-dropdown" aria-label="그룹 선택" className="w-auto min-w-[250px] max-w-xs">
                <SelectValue placeholder="그룹을 선택하세요..." />
              </SelectTrigger>
              <SelectContent>
                {accessibleGroups.map(group => {
                  const ownerName = appUser?.role === 'admin' && !group.isOwned
                                    ? allUsers.find(u => u.id === group.ownerUserId)?.name
                                    : null;
                  const displayName = ownerName
                                    ? `${group.name} (소유자: ${ownerName})`
                                    : (group.isOwned ? `${group.name} (내 그룹)` : group.name);
                  return (
                    <SelectItem key={group.id} value={group.id}>
                      {displayName}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedGroup && (
        <>
          <Card className="shadow-md">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2 mb-1">
                    <PiggyBank className="h-5 w-5 text-primary"/>
                    {simpleGroupTitle}
                </CardTitle>
                <CardDescription className="mt-2">
                    현재 잔액: <strong className="text-3xl font-bold text-primary">{isLoadingFundDetails ? <Loader2 className="h-4 w-4 animate-spin inline-block"/> : (currentBalance !== null ? currentBalance.toLocaleString() + '원' : '정보 없음')}</strong>
                    <br/>
                    <span className="text-xs">모임에서 회비를 사용하면 이 잔액에서 자동으로 차감됩니다.</span>
                </CardDescription>
              </div>
              {canSetBalance && ( // Updated condition here
                <AlertDialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={isLoadingFundDetails || isSubmitting}>
                      <Edit className="mr-2 h-4 w-4" /> 현재 잔액 설정
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle>'{selectedGroup.name}' 회비 잔액 직접 수정</AlertDialogTitle>
                      {/* Removed redundant description from here as per feedback, title is clear */}
                    </AlertDialogHeader>
                    <form onSubmit={form.handleSubmit(handleBalanceUpdate)} className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="newBalance">새로운 잔액 (원) <span className="text-destructive">*</span></Label>
                        <Input
                            id="newBalance"
                            type="text"
                            value={formatNumber(form.watch('newBalance'))}
                            onChange={(e) => {
                              const rawValue = e.target.value.replace(/,/g, '');
                              form.setValue('newBalance', rawValue === '' ? 0 : parseFloat(rawValue), {shouldValidate: true});
                            }}
                            disabled={isSubmitting}
                          />
                        {form.formState.errors.newBalance && <p className="text-sm text-destructive mt-1">{form.formState.errors.newBalance.message}</p>}
                      </div>
                      <div>
                        <Label htmlFor="description">설명 (선택)</Label>
                        <Input
                            id="description"
                            {...form.register('description')}
                            placeholder="예: 2024년 정산 후 잔액"
                            disabled={isSubmitting}
                          />
                        {form.formState.errors.description && <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>}
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsUpdateDialogOpen(false)} disabled={isSubmitting}>취소</AlertDialogCancel>
                        <AlertDialogAction type="submit" disabled={isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          잔액 저장
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </form>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardHeader>
            {/* Balance display moved to CardDescription */}
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 mb-2">
                <History className="h-5 w-5 text-primary"/>
                변경 내역 {/* Static title as per refined interpretation */}
              </CardTitle>
              <CardDescription>
                {selectedGroup ? `'${selectedGroup.name}' 그룹의 ` : ""}
                모임에서의 회비 사용 또는 수동 잔액 설정 내역입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {isLoadingFundDetails ? (
                <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">회비 내역 로딩 중...</p></div>
              ) : transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <ScrollArea className="h-[400px] min-w-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>날짜</TableHead>
                          <TableHead>설명</TableHead>
                          <TableHead>유형</TableHead>
                          <TableHead className="text-right">금액 (원)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell>{format(new Date(tx.date), 'yyyy.MM.dd HH:mm', { locale: ko })}</TableCell>
                            <TableCell>{tx.description}</TableCell>
                            <TableCell>
                              {tx.type === 'meeting_deduction' ? (
                                <span className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                  <TrendingDown className="h-3 w-3 mr-1"/> 모임 차감
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                  <PiggyBank className="h-3 w-3 mr-1"/> 잔액 설정
                                </span>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${tx.type === 'meeting_deduction' ? 'text-red-600' : 'text-foreground'}`}>
                               {tx.type === 'meeting_deduction' && tx.amount < 0 ? tx.amount.toLocaleString() : tx.amount.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  기록된 회비 변경 내역이 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
