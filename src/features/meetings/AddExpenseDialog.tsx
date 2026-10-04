'use client';

import React, { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { createExpenseSchema, type ExpenseFormData } from '@/lib/expense-schema';
import type { Friend, Expense } from '@/lib/types';
import { createExpenseAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';


interface AddExpenseDialogProps {
  meetingId: string;
  participants: Friend[];
  roomCreatorName: string,
  onExpenseAdded: (expense: Expense) => void;
  triggerButton?: React.ReactNode;
}

export function AddExpenseDialog({ meetingId, participants, roomCreatorName, onExpenseAdded, triggerButton }: AddExpenseDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const submitInFlight = useRef(false);
  const { toast } = useToast();
  const [payerSearchOpen, setPayerSearchOpen] = useState(false);
  const { currentUser } = useAuth();

  const matchingCreators = participants.filter(p => roomCreatorName === p.name || roomCreatorName === `${p.name} (${p.description})`);
  const roomCreatorId = matchingCreators.length === 1 ? matchingCreators[0].id : '';

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(createExpenseSchema(participants.map(participant => participant.id))),
    defaultValues: {
      description: '',
      totalAmount: 0,
      paidById: roomCreatorId || (participants.length > 0 ? participants[0].id : ''),
      splitType: 'equally',
      splitAmongIds: participants.map(p => p.id),
      customSplits: participants.map(p => ({ friendId: p.id, amount: 0 })),
    },
  });

  const watchSplitType = form.watch('splitType');
  const watchTotalAmount = form.watch('totalAmount');
  const customSplitsError = form.formState.errors.customSplits;
  const customSplitsMessage =
    customSplitsError?.message ||
    (customSplitsError && typeof customSplitsError === 'object' && 'root' in customSplitsError
      ? (customSplitsError as { root?: { message?: string } }).root?.message
      : undefined) || (customSplitsError ? '개별 금액은 0 이상인 정수 원으로 입력해주세요.' : undefined);

  React.useEffect(() => {
    if (open) {
        const defaultPayerId = roomCreatorId && participants.some(p => p.id === roomCreatorId)
            ? roomCreatorId
            : (participants.length > 0 ? participants[0].id : '');

        form.reset({
            description: '',
            totalAmount: 0,
            paidById: defaultPayerId,
            splitType: 'equally',
            splitAmongIds: participants.map(p => p.id),
            customSplits: participants.map(p => ({ friendId: p.id, amount: 0 })),
        });
    }
  }, [open, participants, form, roomCreatorId]);

  const onSubmit = async (data: ExpenseFormData) => {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setIsPending(true);
    try {
      const payload: Omit<Expense, 'id' | 'createdAt'> = {
        meetingId,
        description: data.description,
        totalAmount: data.totalAmount,
        paidById: data.paidById,
        splitType: data.splitType,
        ...(data.splitType === 'equally' && { splitAmongIds: data.splitAmongIds }),
        ...(data.splitType === 'custom' && { customSplits: data.customSplits }),
      };
      const result = await createExpenseAction(payload, currentUser?.uid || null);
      if (result.success && result.expense) {
        toast({ title: '성공', description: '새로운 지출 항목이 추가되었습니다.' });
        onExpenseAdded(result.expense);
        setOpen(false);
      } else {
        toast({
          title: '오류',
          description: result.error || '지출 항목 추가에 실패했습니다.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: '오류', description: '지출을 저장하지 못했습니다. 입력한 내용을 확인하고 다시 시도해주세요.', variant: 'destructive' });
    } finally {
      submitInFlight.current = false;
      setIsPending(false);
    }
  };

  const formatNumber = (value: number | string): string => {
    if (typeof value === 'number') return value.toLocaleString();
    if (value === '' || value === null || value === undefined) return '';
    const num = Number(String(value).replace(/,/g, ''));
    return isNaN(num) ? String(value) : num.toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!submitInFlight.current) setOpen(isOpen);
    }}>
      <DialogTrigger asChild disabled={isPending}>
        {triggerButton ? triggerButton : <Button>새 지출 추가</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 지출 항목 추가</DialogTitle>
          <DialogDescription>지출 내역을 입력하고 정산 방식을 선택하세요.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} aria-busy={isPending} className="space-y-4">
          <ScrollArea className="h-[60vh] p-1 pr-3">
            <div className="space-y-4 p-2">
              <div>
                <Label htmlFor="description">설명 <span className="text-destructive">*</span></Label>
                <Textarea id="description" {...form.register('description')} disabled={isPending} />
                {form.formState.errors.description && <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>}
              </div>

              <div>
                <Label htmlFor="totalAmount">총 금액 (원, 정수) <span className="text-destructive">*</span></Label>
                 <Controller
                    name="totalAmount"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        id="totalAmount"
                        type="text" inputMode="numeric"
                        value={formatNumber(field.value)}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          field.onChange(rawValue);
                        }}
                        onBlur={field.onBlur}
                        disabled={isPending}
                      />
                    )}
                  />
                {form.formState.errors.totalAmount && <p className="text-sm text-destructive mt-1">{form.formState.errors.totalAmount.message}</p>}
              </div>

              <div>
                <Label htmlFor="paidById">결제자 <span className="text-destructive">*</span></Label>
                <Controller
                  name="paidById"
                  control={form.control}
                  render={({ field }) => (
                    <Popover open={payerSearchOpen} onOpenChange={setPayerSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={payerSearchOpen}
                          className="w-full justify-between"
                          disabled={isPending}
                        >
                          {field.value ? (() => {
                            const p = participants.find(p => p.id === field.value);
                            return p ? p.name + (p.description ? ` (${p.description})` : '') : "결제자 선택...";
                          })() : "결제자 선택..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="친구 검색..." />
                           <CommandList>
                            <CommandEmpty>참여자를 찾을 수 없습니다.</CommandEmpty>
                            <CommandGroup>
                              {participants.map((participant) => (
                                <CommandItem
                                  key={participant.id}
                                  value={`${participant.name} ${participant.id}`}
                                  onSelect={() => {
                                    field.onChange(participant.id);
                                    setPayerSearchOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn("mr-2 h-4 w-4", participant.id === field.value ? "opacity-100" : "opacity-0")}
                                  />
                                  <span>{participant.name + (participant.description ? ` ${participant.description}` : '')}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {form.formState.errors.paidById && <p className="text-sm text-destructive mt-1">{form.formState.errors.paidById.message}</p>}
              </div>

              <div>
                <Label>정산 방식 <span className="text-destructive">*</span></Label>
                <Controller
                  name="splitType"
                  control={form.control}
                  render={({ field }) => (
                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4 mt-1" disabled={isPending}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="equally" id="equally" />
                        <Label htmlFor="equally">균등 분배</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="custom" id="custom" />
                        <Label htmlFor="custom">개별 금액 지정</Label>
                      </div>
                    </RadioGroup>
                  )}
                />
              </div>

              {watchSplitType === 'equally' && (
                <div>
                  <Label>균등 분배 대상 <span className="text-destructive">*</span></Label>
                  <div className="space-y-2 mt-1 p-3 border rounded-md max-h-40 overflow-y-auto">
                    {participants.map(participant => (
                      <div key={participant.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`split-${participant.id}`}
                          checked={(form.watch('splitAmongIds') || []).includes(participant.id)}
                          onCheckedChange={(checked) => {
                            const currentIds = form.watch('splitAmongIds') || [];
                            const newIds = checked
                              ? [...currentIds, participant.id]
                              : currentIds.filter(id => id !== participant.id);
                            form.setValue('splitAmongIds', newIds, { shouldValidate: true });
                          }}
                          disabled={isPending}
                        />
                        <Label htmlFor={`split-${participant.id}`}>{participant.name}{participant.description && (<span className="ml-1 text-xs text-muted-foreground">({participant.description})</span>)}</Label>
                      </div>
                    ))}
                  </div>
                  {form.formState.errors.splitAmongIds && <p className="text-sm text-destructive mt-1">{form.formState.errors.splitAmongIds.message}</p>}
                </div>
              )}

              {watchSplitType === 'custom' && (
                <div>
                  <Label>개별 금액 <span className="text-destructive">*</span></Label>
                  <div className="space-y-2 mt-1 p-3 border rounded-md max-h-60 overflow-y-auto">
                    {participants.map((participant, index) => (
                      <div key={participant.id} className="flex items-center justify-between space-x-2">
                        <Label htmlFor={`custom-${participant.id}`} className="flex-shrink-0">{participant.name}{participant.description && (<span className="ml-1 text-xs text-muted-foreground">({participant.description})</span>)}</Label>
                        <Controller
                          name={`customSplits.${index}.amount`}
                          control={form.control}
                          defaultValue={0}
                          render={({ field }) => (
                             <Input
                                type="text" inputMode="numeric"
                                id={`custom-${participant.id}`}
                                className="w-32 h-8 text-right"
                                value={formatNumber(field.value)}
                                onChange={(e) => {
                                  const rawValue = e.target.value.replace(/,/g, '');
                                  field.onChange(rawValue);
                                }}
                                onBlur={field.onBlur}
                                disabled={isPending}
                              />
                          )}
                        />
                        <Controller name={`customSplits.${index}.friendId`} control={form.control} defaultValue={participant.id} render={({field}) => <input type="hidden" {...field} />} />
                      </div>
                    ))}
                  </div>
                   {customSplitsMessage && <p className="text-sm text-destructive mt-1">{customSplitsMessage}</p>}
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    총액: {formatNumber((form.watch('customSplits') || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0))} / {formatNumber(watchTotalAmount || 0)}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>취소</Button>
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
