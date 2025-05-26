'use client';

import React, { useState, useTransition } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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
import type { Friend } from '@/lib/types';
import { createMeetingAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const meetingSchema = z.object({
  name: z.string().min(1, '모임 이름을 입력해주세요.').max(100, '모임 이름은 100자 이내여야 합니다.'),
  dateTime: z.date({ required_error: '날짜와 시간을 선택해주세요.' }),
  locationName: z.string().min(1, '장소를 입력해주세요.').max(100, '장소 이름은 100자 이내여야 합니다.'),
  participantIds: z.array(z.string()).min(1, '참여자를 최소 1명 선택해주세요.'),
});

type MeetingFormData = z.infer<typeof meetingSchema>;

interface CreateMeetingFormProps {
  friends: Friend[];
  currentUserId: string;
}

export function CreateMeetingForm({ friends, currentUserId }: CreateMeetingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [participantSearchOpen, setParticipantSearchOpen] = useState(false);
  
  const form = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      name: '',
      dateTime: undefined,
      locationName: '',
      participantIds: [currentUserId], // Creator is a participant by default
    },
  });

  const onSubmit = (data: MeetingFormData) => {
    startTransition(async () => {
      const result = await createMeetingAction({ ...data, creatorId: currentUserId });
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
    });
  };

  const selectedParticipants = friends.filter(friend => form.watch('participantIds').includes(friend.id));

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
                  // Preserve time if only date is changed, or set default time for new date
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
                        const newParticipantIds = currentParticipantIds.includes(friend.id)
                          ? currentParticipantIds.filter(id => id !== friend.id)
                          : [...currentParticipantIds, friend.id];
                        // Ensure creator is always included if they are deselected
                        if (!newParticipantIds.includes(currentUserId)) {
                          newParticipantIds.push(currentUserId);
                        }
                        form.setValue("participantIds", newParticipantIds, { shouldValidate: true });
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          form.watch('participantIds').includes(friend.id) ? "opacity-100" : "opacity-0"
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
          모임 만들기
        </Button>
      </div>
    </form>
  );
}
