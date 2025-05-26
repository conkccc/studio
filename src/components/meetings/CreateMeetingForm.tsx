'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Check, ChevronsUpDown, Loader2, MapPinIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Friend, Meeting } from '@/lib/types';
import { createMeetingAction, updateMeetingAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from '@/components/ui/switch';
import { Checkbox } from "@/components/ui/checkbox";

const meetingSchemaBase = z.object({
  name: z.string().min(1, '모임 이름을 입력해주세요.').max(100, '모임 이름은 100자 이내여야 합니다.'),
  dateTime: z.date({ required_error: '날짜와 시간을 선택해주세요.' }),
  locationName: z.string().min(1, '장소를 입력해주세요.').max(100, '장소 이름은 100자 이내여야 합니다.'),
  participantIds: z.array(z.string()).min(1, '참여자를 최소 1명 선택해주세요.'),
  useReserveFund: z.boolean(),
  reserveFundUsageType: z.enum(['all', 'partial']),
  partialReserveFundAmount: z.preprocess( 
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(String(val).replace(/,/g, ''))),
    z.number().min(0, '금액은 0 이상이어야 합니다.').optional()
  ),
  nonReserveFundParticipants: z.array(z.string()),
});

const meetingSchema = meetingSchemaBase.refine(data => {
  if (data.useReserveFund && data.reserveFundUsageType === 'partial') {
    return data.partialReserveFundAmount !== undefined && data.partialReserveFundAmount > 0;
  }
  return true;
}, {
  message: '부분 사용 시 회비 사용 금액을 0보다 크게 입력해야 합니다.',
  path: ['partialReserveFundAmount'],
});

type MeetingFormData = z.infer<typeof meetingSchema>;

interface MeetingFormProps {
  friends: Friend[];
  currentUserId: string;
  isEditMode?: boolean;
  initialData?: Meeting;
}

export function CreateMeetingForm({ friends, currentUserId, isEditMode = false, initialData }: MeetingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [participantSearchOpen, setParticipantSearchOpen] = useState(false);

  const form = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      dateTime: new Date(initialData.dateTime),
      locationName: initialData.locationName,
      participantIds: initialData.participantIds,
      useReserveFund: initialData.useReserveFund,
      reserveFundUsageType: initialData.reserveFundUsageType,
      partialReserveFundAmount: initialData.partialReserveFundAmount === undefined ? undefined : Number(initialData.partialReserveFundAmount),
      nonReserveFundParticipants: initialData.nonReserveFundParticipants || [],
    } : {
      name: '',
      dateTime: undefined,
      locationName: '',
      participantIds: [currentUserId],
      useReserveFund: false,
      reserveFundUsageType: 'all', // Default to 'all', amount field hidden unless 'partial'
      partialReserveFundAmount: undefined, // Default to undefined
      nonReserveFundParticipants: [],
    },
  });

  const watchUseReserveFund = form.watch('useReserveFund');
  const watchReserveFundUsageType = form.watch('reserveFundUsageType');
  const watchParticipantIds = form.watch('participantIds');

  useEffect(() => {
    if (isEditMode && initialData) {
      const currentNonParticipants = form.getValues('nonReserveFundParticipants') || [];
      const newNonParticipants = currentNonParticipants.filter(id => watchParticipantIds?.includes(id));
      if (newNonParticipants.length !== currentNonParticipants.length) {
         form.setValue('nonReserveFundParticipants', newNonParticipants, { shouldValidate: true });
      }
    }
  }, [watchParticipantIds, isEditMode, initialData, form]);

  // Reset partialReserveFundAmount if useReserveFund is false or type is 'all'
  useEffect(() => {
    if (!watchUseReserveFund || watchReserveFundUsageType === 'all') {
      form.setValue('partialReserveFundAmount', undefined, { shouldValidate: true });
    }
  }, [watchUseReserveFund, watchReserveFundUsageType, form]);
  
  const formatNumberInput = (value: number | string | undefined) => {
    if (value === undefined || value === '' || value === null) return '';
    const num = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(num) ? '' : num.toLocaleString();
  };


  const onSubmit = (data: MeetingFormData) => {
    startTransition(async () => {
      const payload = {
        ...data,
        // Ensure partialReserveFundAmount is a number or undefined
        partialReserveFundAmount: data.useReserveFund && data.reserveFundUsageType === 'partial' 
                                    ? Number(data.partialReserveFundAmount) 
                                    : undefined,
      };

      if (isEditMode && initialData) {
        const result = await updateMeetingAction(initialData.id, payload);
        if (result.success && result.meeting) {
          toast({ title: '성공', description: '모임 정보가 수정되었습니다.' });
          router.push(`/meetings/${result.meeting.id}`);
        } else {
           toast({
            title: '오류',
            description: result.error || '모임 수정에 실패했습니다.',
            variant: 'destructive',
          });
        }
      } else {
        const result = await createMeetingAction({ ...payload, creatorId: currentUserId });
        if (result.success && result.meeting) {
          toast({ title: '성공', description: '새로운 모임이 생성되었습니다.' });
          router.push(`/meetings/${result.meeting.id}`);
        } else {
           toast({
            title: '오류',
            description: result.error || '모임 생성에 실패했습니다.',
            variant: 'destructive',
          });
        }
      }
    });
  };

  const selectedParticipants = friends.filter(friend => watchParticipantIds?.includes(friend.id));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="name">모임 이름 <span className="text-destructive">*</span></Label>
        <Input id="name" {...form.register('name')} disabled={isPending} />
        {form.formState.errors.name && <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>}
      </div>

      <div>
        <Label htmlFor="dateTime">날짜 및 시간 <span className="text-destructive">*</span></Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !form.watch('dateTime') && 'text-muted-foreground'
              )}
              disabled={isPending}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {form.watch('dateTime') ? format(form.watch('dateTime'), 'PPP HH:mm', { locale: ko }) : <span>날짜 및 시간 선택</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={form.watch('dateTime')}
              onSelect={(date) => {
                if (date) {
                  const currentTime = form.watch('dateTime') || new Date();
                  const newDateTime = new Date(date);
                  newDateTime.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);
                  form.setValue('dateTime', newDateTime, { shouldValidate: true });
                }
              }}
              initialFocus
            />
            <div className="p-3 border-t border-border">
              <Label htmlFor="time">시간</Label>
              <Input
                type="time"
                id="time"
                defaultValue={form.watch('dateTime') ? format(form.watch('dateTime'), "HH:mm") : "12:00"}
                onChange={(e) => {
                  const newTime = e.target.value;
                  const currentDateTime = form.watch('dateTime') || new Date();
                  const [hours, minutes] = newTime.split(':').map(Number);
                  currentDateTime.setHours(hours, minutes, 0, 0);
                  form.setValue('dateTime', new Date(currentDateTime), { shouldValidate: true });
                }}
                className="w-full mt-1"
              />
            </div>
          </PopoverContent>
        </Popover>
        {form.formState.errors.dateTime && <p className="text-sm text-destructive mt-1">{form.formState.errors.dateTime.message}</p>}
      </div>

      <div>
        <Label htmlFor="locationName">장소 <span className="text-destructive">*</span></Label>
        <div className="relative">
          <Input id="locationName" {...form.register('locationName')} disabled={isPending} className="pl-8" />
          <MapPinIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {form.formState.errors.locationName && <p className="text-sm text-destructive mt-1">{form.formState.errors.locationName.message}</p>}
      </div>

      <div>
        <div className="flex items-center space-x-2">
          <Controller
            control={form.control}
            name="useReserveFund"
            render={({ field }) => (
              <Switch
                id="useReserveFund"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isPending}
              />
            )}
          />
          <Label htmlFor="useReserveFund">모임 회비 사용</Label>
        </div>

        {watchUseReserveFund && (
          <div className="space-y-4 mt-4 pl-2 border-l-2 ml-2">
            <div>
              <Label>회비 사용 방식</Label>
              <Controller
                control={form.control}
                name="reserveFundUsageType"
                render={({ field }) => (
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="flex space-x-4 mt-2"
                    disabled={isPending}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="usage-all" />
                      <Label htmlFor="usage-all">모두 사용 (정산 시 계산)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="partial" id="usage-partial" />
                      <Label htmlFor="usage-partial">일정 금액 사용</Label>
                    </div>
                  </RadioGroup>
                )}
              />
               {form.formState.errors.reserveFundUsageType && <p className="text-sm text-destructive mt-1">{form.formState.errors.reserveFundUsageType.message}</p>}
            </div>

            {watchReserveFundUsageType === 'partial' && (
              <div>
                <Label htmlFor="partialReserveFundAmount">사용할 회비 금액 <span className="text-destructive">*</span></Label>
                 <Controller
                    name="partialReserveFundAmount"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        id="partialReserveFundAmount"
                        type="text"
                        value={formatNumberInput(field.value)}
                        onChange={(e) => {
                           const rawValue = e.target.value.replace(/,/g, '');
                           field.onChange(rawValue === '' ? undefined : parseFloat(rawValue));
                        }}
                        onBlur={field.onBlur}
                        disabled={isPending}
                        className="mt-1"
                        placeholder="예: 10000"
                      />
                    )}
                  />
                {form.formState.errors.partialReserveFundAmount && <p className="text-sm text-destructive mt-1">{form.formState.errors.partialReserveFundAmount.message}</p>}
              </div>
            )}

            <div>
              <Label>회비 사용 제외 멤버</Label>
              <p className="text-xs text-muted-foreground">선택된 멤버는 이 모임에서 회비 사용 혜택을 받지 않습니다.</p>
              <div className="grid gap-2 mt-2">
                 {selectedParticipants.length > 0 ? (
                    selectedParticipants.map(participant => (
                      <div key={participant.id} className="flex items-center space-x-2">
                        <Controller
                           control={form.control}
                           name="nonReserveFundParticipants"
                           render={({ field }) => (
                            <Checkbox
                              id={`nonReserveFund-${participant.id}`}
                              checked={field.value?.includes(participant.id)}
                              onCheckedChange={(checked) => {
                                const currentNonParticipants = field.value || [];
                                const newNonParticipants = checked
                                  ? [...currentNonParticipants, participant.id]
                                  : currentNonParticipants.filter(id => id !== participant.id);
                                field.onChange(newNonParticipants);
                              }}
                              disabled={isPending || (participant.id === currentUserId && selectedParticipants.length === 1 && field.value?.includes(currentUserId) && checked === false )} // Creator cannot be un-excluded if they are the only one and already excluded
                            />
                           )}
                        />
                        <Label htmlFor={`nonReserveFund-${participant.id}`}>
                          {participant.nickname} {participant.id === currentUserId && "(나)"}
                        </Label>
                      </div>
                    ))
                 ) : (
                   <p className="text-sm text-muted-foreground">참여자를 먼저 선택해주세요.</p>
                 )}
              </div>
               {form.formState.errors.nonReserveFundParticipants && <p className="text-sm text-destructive mt-1">{form.formState.errors.nonReserveFundParticipants.message}</p>}
            </div>
          </div>
        )}
      </div>

      <div>
        <Label>참여자 <span className="text-destructive">*</span></Label>
         <Popover open={participantSearchOpen} onOpenChange={setParticipantSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={participantSearchOpen}
              className="w-full justify-between"
              disabled={isPending}
            >
              {selectedParticipants.length > 0
                ? selectedParticipants.map(f => f.nickname).join(', ')
                : "참여자 선택..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
            <Command>
              <CommandInput placeholder="친구 검색..." />
              <CommandList>
                <CommandEmpty>친구를 찾을 수 없습니다.</CommandEmpty>
                <CommandGroup>
                  {friends.map((friend) => (
                    <CommandItem
                      key={friend.id}
                      value={friend.nickname}
                      onSelect={() => {
                        const currentParticipantIds = form.getValues("participantIds") || [];
                        let newParticipantIds = currentParticipantIds.includes(friend.id)
                          ? currentParticipantIds.filter(id => id !== friend.id)
                          : [...currentParticipantIds, friend.id];
                        
                        // Ensure creator is always included, unless they are the one being deselected AND others remain.
                        if (friend.id === currentUserId && !newParticipantIds.includes(currentUserId) && newParticipantIds.length > 0) {
                            // If unselecting creator and there are other participants, allow it.
                        } else if (!newParticipantIds.includes(currentUserId)) {
                           newParticipantIds.push(currentUserId); // Always keep creator if they are not explicitly removed or list becomes empty
                        }
                        if (newParticipantIds.length === 0 && friend.id === currentUserId){ // if trying to deselect the last member (creator)
                            newParticipantIds = [currentUserId]; // prevent deselection
                        }


                        form.setValue("participantIds", newParticipantIds, { shouldValidate: true });
                         const currentNonParticipants = form.getValues('nonReserveFundParticipants') || [];
                         if (!newParticipantIds.includes(friend.id) && currentNonParticipants.includes(friend.id)) {
                            form.setValue('nonReserveFundParticipants', currentNonParticipants.filter(id => id !== friend.id), { shouldValidate: true });
                         }
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          form.watch('participantIds')?.includes(friend.id) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {friend.nickname} {friend.id === currentUserId && "(나)"}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {form.formState.errors.participantIds && <p className="text-sm text-destructive mt-1">{form.formState.errors.participantIds.message}</p>}
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditMode ? '모임 수정' : '모임 만들기'}
        </Button>
      </div>
    </form>
  );
}
