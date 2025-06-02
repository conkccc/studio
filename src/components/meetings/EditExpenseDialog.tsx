'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import * as z from 'zod';
import type { Friend, Expense } from '@/lib/types';
import { updateExpenseAction } from '@/lib/actions';
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
import { Check, ChevronsUpDown, Loader2, Edit3 } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const expenseSchema = z.object({
  description: z.string().min(1, '설명을 입력해주세요.').max(100, '설명은 100자 이내여야 합니다.'),
  totalAmount: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val),
    z.number().positive('금액은 0보다 커야 합니다.')
  ),
  paidById: z.string().min(1, '결제자를 선택해주세요.'),
  splitType: z.enum(['equally', 'custom'], { required_error: '분배 방식을 선택해주세요.' }),
  splitAmongIds: z.array(z.string()).optional(),
  customSplits: z.array(z.object({
    friendId: z.string(),
    amount: z.preprocess(
      (val) => (typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val),
      z.number().min(0, '금액은 0 이상이어야 합니다.')
    ),
  })).optional(),
}).refine(data => {
  if (data.splitType === 'equally' && (!data.splitAmongIds || data.splitAmongIds.length === 0)) {
    return false;
  }
  return true;
}, {
  message: '균등 분배 시 최소 1명의 참여자를 선택해야 합니다.',
  path: ['splitAmongIds'],
}).refine(data => {
  if (data.splitType === 'custom') {
    if (!data.customSplits || data.customSplits.length === 0) return false;
    const sum = data.customSplits.reduce((acc, split) => acc + split.amount, 0);
    return Math.abs(sum - data.totalAmount) < 0.01;
  }
  return true;
}, {
  message: '개별 금액의 총합이 전체 금액과 일치해야 합니다.',
  path: ['customSplits'],
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface EditExpenseDialogProps {
  expenseToEdit: Expense;
  meetingId: string;
  participants: Friend[]; // Participants of the current meeting
  allFriends: Friend[];
  onExpenseUpdated: (updatedExpense: Expense) => void;
  triggerButton?: React.ReactNode;
  canManage: boolean;
  isMeetingSettled: boolean;
}

export function EditExpenseDialog({
  expenseToEdit,
  meetingId,
  participants, // These are actual meeting participants for this expense
  allFriends, // All friends for finding names by ID
  onExpenseUpdated,
  triggerButton,
  canManage, // Prop to control if editing is allowed (passed from ExpenseItem)
  isMeetingSettled,
}: EditExpenseDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [payerSearchOpen, setPayerSearchOpen] = useState(false);
  const { currentUser } = useAuth(); // For passing currentUserId to action

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    // Default values are set based on expenseToEdit when the dialog opens (see useEffect)
  });
  
  useEffect(() => {
    if (open) { // Reset form when dialog opens with new/current expenseToEdit data
      form.reset({
        description: expenseToEdit.description,
        totalAmount: expenseToEdit.totalAmount,
        paidById: expenseToEdit.paidById,
        splitType: expenseToEdit.splitType,
        splitAmongIds: expenseToEdit.splitType === 'equally' 
          ? expenseToEdit.splitAmongIds || participants.map(p => p.id) 
          : participants.map(p => p.id), // Default to all for custom if not set
        customSplits: expenseToEdit.splitType === 'custom' 
          ? participants.map(p => {
              const existingSplit = expenseToEdit.customSplits?.find(cs => cs.friendId === p.id);
              return { friendId: p.id, amount: existingSplit ? existingSplit.amount : 0 };
            })
          : participants.map(p => ({ friendId: p.id, amount: 0 })), // Default structure for custom
      });
    }
  }, [open, expenseToEdit, participants, form]);


  const watchSplitType = form.watch('splitType');
  const watchTotalAmount = form.watch('totalAmount');

  const onSubmit = (data: ExpenseFormData) => {
    startTransition(async () => {
      const payload: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>> = {
        description: data.description,
        totalAmount: data.totalAmount,
        paidById: data.paidById,
        splitType: data.splitType,
        splitAmongIds: data.splitType === 'equally' ? data.splitAmongIds : undefined, // Use undefined if not applicable
        customSplits: data.splitType === 'custom' ? data.customSplits : undefined,
      };
      const result = await updateExpenseAction(expenseToEdit.id, meetingId, payload, currentUser?.uid || null);
      if (result.success && result.expense) {
        toast({ title: '성공', description: '지출 항목이 수정되었습니다.' });
        onExpenseUpdated(result.expense);
        setOpen(false);
      } else {
        toast({
          title: '오류',
          description: result.error || '지출 항목 수정에 실패했습니다.',
          variant: 'destructive',
        });
      }
    });
  };
  
  const formatNumber = (value: number | string) => {
    if (typeof value === 'number') return value.toLocaleString();
    if (value === '' || value === null || value === undefined) return '';
    const num = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(num) ? String(value) : num.toLocaleString();
  };
  
  const currentMeetingParticipants = participants; // Use the passed 'participants' prop directly

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        // No need to form.reset() here if useEffect handles it on `open`
    }}>
      <DialogTrigger asChild>
        {triggerButton ? (
            React.cloneElement(triggerButton as React.ReactElement, { disabled: !canManage || isMeetingSettled || isPending })
        ) : (
          <Button variant="outline" disabled={!canManage || isMeetingSettled || isPending}>
            <Edit3 className="mr-2 h-4 w-4" /> 수정
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>지출 항목 수정</DialogTitle>
          <DialogDescription>지출 내역을 수정하고 정산 방식을 선택하세요.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <ScrollArea className="h-[60vh] p-1 pr-3">
            <div className="space-y-4 p-2">
              <div>
                <Label htmlFor="edit-description">설명 <span className="text-destructive">*</span></Label>
                <Textarea id="edit-description" {...form.register('description')} disabled={isPending} />
                {form.formState.errors.description && <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>}
              </div>

              <div>
                <Label htmlFor="edit-totalAmount">총 금액 <span className="text-destructive">*</span></Label>
                 <Controller
                    name="totalAmount"
                    control={form.control}
                    render={({ field }) => (
                      <Input 
                        id="edit-totalAmount" 
                        type="text" 
                        value={formatNumber(field.value)}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          field.onChange(rawValue === '' ? 0 : parseFloat(rawValue));
                        }}
                        onBlur={field.onBlur}
                        disabled={isPending} 
                      />
                    )}
                  />
                {form.formState.errors.totalAmount && <p className="text-sm text-destructive mt-1">{form.formState.errors.totalAmount.message}</p>}
              </div>

              <div>
                <Label htmlFor="edit-paidById">결제자 <span className="text-destructive">*</span></Label>
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
                          {field.value ? currentMeetingParticipants.find(p => p.id === field.value)?.name : "결제자 선택..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="친구 검색..." />
                           <CommandList>
                            <CommandEmpty>참여자를 찾을 수 없습니다.</CommandEmpty>
                            <CommandGroup>
                              {currentMeetingParticipants.map((participant) => (
                                <CommandItem
                                  key={participant.id}
                                  value={participant.name} // Use name for search, but set ID onSelect
                                  onSelect={() => {
                                    field.onChange(participant.id);
                                    setPayerSearchOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn("mr-2 h-4 w-4", participant.id === field.value ? "opacity-100" : "opacity-0")}
                                  />
                                  {participant.name}
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
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4 mt-1" disabled={isPending}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="equally" id="edit-equally" />
                        <Label htmlFor="edit-equally">균등 분배</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="custom" id="edit-custom" />
                        <Label htmlFor="edit-custom">개별 금액 지정</Label>
                      </div>
                    </RadioGroup>
                  )}
                />
              </div>

              {watchSplitType === 'equally' && (
                <div>
                  <Label>균등 분배 대상 <span className="text-destructive">*</span></Label>
                  <div className="space-y-2 mt-1 p-3 border rounded-md max-h-40 overflow-y-auto">
                    {currentMeetingParticipants.map(participant => (
                      <div key={participant.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-split-${participant.id}`}
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
                        <Label htmlFor={`edit-split-${participant.id}`}>{participant.name}</Label>
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
                    {currentMeetingParticipants.map((participant, index) => (
                      <div key={participant.id} className="flex items-center justify-between space-x-2">
                        <Label htmlFor={`edit-custom-${participant.id}`} className="flex-shrink-0">{participant.name}</Label>
                        <Controller
                          name={`customSplits.${index}.amount`} // This should be fine
                          control={form.control}
                          render={({ field }) => (
                             <Input 
                                type="text" 
                                id={`edit-custom-${participant.id}`} 
                                className="w-32 h-8 text-right" 
                                value={formatNumber(field.value)}
                                onChange={(e) => {
                                  const rawValue = e.target.value.replace(/,/g, '');
                                  const newAmount = rawValue === '' ? 0 : parseFloat(rawValue);
                                  const currentCustomSplits = form.getValues('customSplits') || [];
                                  // Ensure the friendId is correctly associated
                                  const updatedSplits = currentCustomSplits.map((cs, i) => 
                                    i === index ? {...cs, friendId: participant.id, amount: newAmount } : cs
                                  );
                                  form.setValue('customSplits', updatedSplits, { shouldValidate: true });
                                }}
                                onBlur={field.onBlur}
                                disabled={isPending}
                              />
                          )}
                        />
                        {/* Ensure friendId is registered for each item in the array */}
                        <Controller name={`customSplits.${index}.friendId`} control={form.control} defaultValue={participant.id} render={({field}) => <input type="hidden" {...field} />} />
                      </div>
                    ))}
                  </div>
                   {form.formState.errors.customSplits && <p className="text-sm text-destructive mt-1">{form.formState.errors.customSplits.message || (form.formState.errors.customSplits as any).root?.message}</p>}
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
              수정 저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
