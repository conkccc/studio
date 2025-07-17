'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createMeetingPrepAction, getFriendGroupsForUserAction, getFriendsByGroupAction } from '@/lib/actions';
import { useAuth } from '@/contexts/AuthContext';
import type { FriendGroup, Friend } from '@/lib/types';
import { useEffect, useTransition } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';

const formSchema = z.object({
  title: z.string().min(1, { message: "제목은 필수입니다." }).max(100, { message: "제목은 100자 이내여야 합니다." }),
  memo: z.string().max(500, { message: "메모는 500자 이내여야 합니다." }).optional(),
  participantFriendIds: z.array(z.string()).min(1, { message: "하나 이상의 친구를 선택해야 합니다." }),
  selectedMonths: z.array(z.string()).min(1, { message: "하나 이상의 달을 선택해야 합니다." }),
  shareExpiryDays: z.number().min(1, { message: "공유 링크 만료일은 1일 이상이어야 합니다." }).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateMeetingPrepForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, appUser, loading: authLoading } = useAuth();
  const [friendGroups, setFriendGroups] = useState<FriendGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      memo: '',
      participantFriendIds: [],
      selectedMonths: [],
      shareExpiryDays: 7, // Default to 7 days
    },
  });

  const watchParticipantFriendIds = form.watch('participantFriendIds');
  const watchSelectedMonths = form.watch('selectedMonths');

  const [selectedFriendGroup, setSelectedFriendGroup] = useState<string | null>(null);
  const [friendsInSelectedGroup, setFriendsInSelectedGroup] = useState<Friend[]>([]);
  const [participantSearchOpen, setParticipantSearchOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && currentUser) {
      const fetchFriendGroups = async () => {
        setGroupsLoading(true);
        const result = await getFriendGroupsForUserAction(currentUser.uid);
        if (result.success && result.groups) {
          const filteredGroups = appUser?.role === 'admin'
            ? result.groups
            : result.groups; // user 역할은 본인이 소유하거나 부여된 모든 그룹을 볼 수 있도록 수정
          setFriendGroups(filteredGroups);
        } else {
          toast({
            title: "친구 그룹 로드 실패",
            description: result.error || "친구 그룹을 불러오는데 실패했습니다.",
            variant: "destructive",
          });
        }
        setGroupsLoading(false);
      };
      fetchFriendGroups();
    }
  }, [authLoading, currentUser, appUser, toast]);

  useEffect(() => {
    const fetchFriends = async () => {
      if (selectedFriendGroup) {
        const result = await getFriendsByGroupAction(selectedFriendGroup);
        if (result.success && result.friends) {
          setFriendsInSelectedGroup(result.friends);
          // Automatically select all friends from the newly selected group
          form.setValue('participantFriendIds', result.friends.map(f => f.id), { shouldValidate: true });
        } else {
          toast({
            title: "친구 목록 로드 실패",
            description: result.error || "선택된 그룹의 친구 목록을 불러오는데 실패했습니다.",
            variant: "destructive",
          });
          setFriendsInSelectedGroup([]);
          form.setValue('participantFriendIds', [], { shouldValidate: true });
        }
      } else {
        setFriendsInSelectedGroup([]);
        form.setValue('participantFriendIds', [], { shouldValidate: true });
      }
    };
    fetchFriends();
  }, [selectedFriendGroup, form, toast]);

  const onSubmit = async (values: FormValues) => {
    if (!currentUser) {
      toast({
        title: "인증 오류",
        description: "로그인 정보가 없습니다. 다시 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedFriendGroup) {
      toast({
        title: "유효성 검사 오류",
        description: "친구 그룹을 선택해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      const result = await createMeetingPrepAction(
        { ...values, friendGroupId: selectedFriendGroup }, 
        currentUser.uid
      );

      if (result.success) {
        toast({
          title: "모임 준비 생성 성공",
          description: "새로운 모임 준비가 성공적으로 생성되었습니다.",
        });
        router.push(`/meeting-prep/${result.meetingPrep?.id}`);
      } else {
        toast({
          title: "모임 준비 생성 실패",
          description: result.error || "모임 준비 생성 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    });
  };

  const generateMonthOptions = () => {
    const options = [];
    const today = new Date();
    for (let i = 0; i < 6; i++) { // 현재 달부터 6개월 후까지
      const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
      options.push({
        label: `${date.getFullYear()}년 ${date.getMonth() + 1}월`,
        value: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`,
      });
    }
    return options;
  };

  const monthOptions = generateMonthOptions();

  const shareExpiryDate = form.watch('shareExpiryDays') !== undefined
    ? addDays(new Date(), form.watch('shareExpiryDays') || 0)
    : undefined;

  if (authLoading || groupsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-24" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>제목</FormLabel>
              <FormControl>
                <Input placeholder="모임 준비 제목" {...field} />
              </FormControl>
              <FormDescription>
                모임 준비의 목적을 명확히 나타내는 제목을 입력해주세요.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="memo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>메모</FormLabel>
              <FormControl>
                <Textarea placeholder="모임 준비에 대한 추가 설명" {...field} />
              </FormControl>
              <FormDescription>
                모임 준비에 대한 상세 설명이나 특별한 요청사항을 입력할 수 있습니다.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem className="flex flex-col">
          <FormLabel>친구 그룹 선택</FormLabel>
          <Popover open={groupPopoverOpen} onOpenChange={setGroupPopoverOpen}>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={groupPopoverOpen}
                  className="w-full justify-between"
                  disabled={isPending || friendGroups.length === 0}
                >
                  {selectedFriendGroup
                    ? friendGroups.find((group) => group.id === selectedFriendGroup)?.name
                    : "그룹 선택..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="그룹 검색..." />
                <CommandList>
                  <CommandEmpty>그룹을 찾을 수 없습니다.</CommandEmpty>
                  <CommandGroup>
                    {friendGroups.map((group) => (
                      <CommandItem
                        value={group.name}
                        key={group.id}
                        onSelect={() => {
                          setSelectedFriendGroup(group.id);
                          setGroupPopoverOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedFriendGroup === group.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {group.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FormDescription>
            참여자를 선택할 친구 그룹을 선택해주세요.
          </FormDescription>
        </FormItem>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FormLabel>친구 목록</FormLabel>
            <div className="mt-2 h-64 overflow-y-auto rounded-md border">
              {friendsInSelectedGroup.length > 0 ? (
                friendsInSelectedGroup.map((friend) => (
                  <div key={friend.id} className="flex items-center justify-between p-2">
                    <span>{friend.name}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentSelected = new Set(form.getValues('participantFriendIds'));
                        if (currentSelected.has(friend.id)) {
                          currentSelected.delete(friend.id);
                        } else {
                          currentSelected.add(friend.id);
                        }
                        form.setValue('participantFriendIds', Array.from(currentSelected), { shouldValidate: true });
                      }}
                    >
                      {Array.isArray(form.watch('participantFriendIds')) && form.watch('participantFriendIds').includes(friend.id) ? '선택됨' : '선택'}
                    </Button>
                  </div>
                ))
              ) : (
                <div className="p-2 text-muted-foreground">친구 그룹을 선택해주세요.</div>
              )}
            </div>
          </div>
          <div>
            <FormLabel>선택된 참여자</FormLabel>
            <div className="mt-2 h-64 overflow-y-auto rounded-md border">
              {form.watch('participantFriendIds').length > 0 ? (
                form.watch('participantFriendIds').map((friendId) => {
                  const friend = friendsInSelectedGroup.find((f) => f.id === friendId);
                  return friend ? (
                    <div key={friend.id} className="flex items-center justify-between p-2">
                      <span>{friend.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const currentSelected = new Set(form.getValues('participantFriendIds'));
                          currentSelected.delete(friend.id);
                          form.setValue('participantFriendIds', Array.from(currentSelected), { shouldValidate: true });
                        }}
                      >
                        X
                      </Button>
                    </div>
                  ) : null;
                })
              ) : (
                <div className="p-2 text-muted-foreground">참여자를 선택해주세요.</div>
              )}
            </div>
          </div>
        </div>

        <FormField
          control={form.control}
          name="participantFriendIds"
          render={({ field }) => (
            <FormItem className="hidden">
              <FormLabel>참여자</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        

        <FormField
          control={form.control}
          name="selectedMonths"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>날짜를 수집할 달 선택</FormLabel>
              <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={monthPopoverOpen}
                      className="w-full justify-between"
                      disabled={isPending}
                    >
                      {field.value.length > 0
                        ? field.value
                            .map((monthValue) => monthOptions.find((m) => m.value === monthValue)?.label)
                            .filter(Boolean)
                            .join(', ')
                        : "달 선택..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="달 검색..." />
                    <CommandList>
                      <CommandEmpty>달을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {monthOptions.map((month) => (
                          <CommandItem
                            value={month.label}
                            key={month.value}
                            onSelect={() => {
                              const currentSelected = new Set(field.value);
                              if (currentSelected.has(month.value)) {
                                currentSelected.delete(month.value);
                              } else {
                                currentSelected.add(month.value);
                              }
                              field.onChange(Array.from(currentSelected));
                              form.trigger('selectedMonths'); // 수동으로 유효성 검사 트리거
                            }}
                          >
                            <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  Array.isArray(field.value) && field.value.includes(month.value) ? "opacity-100" : "opacity-0"
                                )}
                              />
                            {month.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormDescription>
                참석 가능 여부를 수집할 달을 선택해주세요. 선택된 달의 날짜만 달력에 표시됩니다.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="shareExpiryDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>공유 링크 만료일 (일)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="7"
                  {...field}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    field.onChange(isNaN(value) ? undefined : value);
                  }}
                  disabled={isPending}
                />
              </FormControl>
              <FormDescription>
                공유 링크가 유효할 일수를 입력하세요. (기본값: 7일)
                {shareExpiryDate && (
                  <span className="block text-sm text-muted-foreground mt-1">
                    만료 예정일: {format(shareExpiryDate, 'yyyy년 MM월 dd일', { locale: ko })}
                  </span>
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            모임 준비 수정
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
            취소
          </Button>
        </div>
      </form>
    </Form>
  );
}
