'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2, MapPinIcon, Eye, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Expense, Friend, Meeting, FriendGroup } from '@/lib/types';
import { createMeetingAction, updateMeetingAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useGoogleMaps } from '@/hooks/use-google-maps';
import { meetingSchema, type MeetingFormData } from './meeting-form-schema';
import { SelectDate } from './MeetingDateInput';
import { LocationSearchInput } from './MeetingLocationInput';
import { MeetingReserveFundSection } from './MeetingReserveFundSection';
import { useMeetingDraft } from './use-meeting-draft';
import { calculateReserveFundBreakdown } from '@/lib/reserve-fund-settlement';

interface MeetingFormProps {
  friends: Friend[];
  expenses?: Expense[];
  isLoadingFriends?: boolean;
  currentUserId: string;
  isEditMode?: boolean;
  initialData?: Meeting;
  groupId?: string;
  groups?: FriendGroup[];
  selectedGroupId?: string | null;
  onGroupChange?: (id: string | null) => void;
}

export function CreateMeetingForm({
  friends,
  expenses = [],
  isLoadingFriends,
  currentUserId,
  isEditMode = false,
  initialData,
  groups = [],
  selectedGroupId: currentMeetingGroupId,
  onGroupChange,
}: MeetingFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const [participantSearchOpen, setParticipantSearchOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const [temporaryParticipants, setTemporaryParticipants] = useState<{ id?: string; name: string }[]>([]);
  const [addedTempParticipantsOnEdit, setAddedTempParticipantsOnEdit] = useState<{ id?: string; name: string }[]>([]);
  const [currentTempParticipantName, setCurrentTempParticipantName] = useState('');
  const [tempMeetingFeeType, setTempMeetingFeeType] = useState<'total' | 'perPerson'>('total');
  const [tempMeetingTotalFee, setTempMeetingTotalFee] = useState<number | undefined>(undefined);
  const [tempMeetingFeePerPerson, setTempMeetingFeePerPerson] = useState<number | undefined>(undefined);

  const [showMap, setShowMap] = useState(false);
  const [placeSearchEnabled, setPlaceSearchEnabled] = useState(false);
  const { isMapsLoaded, mapsLoadError, retryMaps } = useGoogleMaps(showMap || placeSearchEnabled);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerInstanceRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const pendingGroupSelection = useRef<{ id: string; sawLoading: boolean } | null>(null);

  const form = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      dateTime: initialData.dateTime ? new Date(initialData.dateTime) : new Date(),
      endTime: initialData.endTime ? new Date(initialData.endTime) : undefined,
      locationName: initialData.locationName,
      locationCoordinates: initialData.locationCoordinates,
      participantIds: initialData.participantIds || [],
      useReserveFund: initialData.useReserveFund || false,
      reserveFundCoverAll: initialData.reserveFundCoverAll || false,
      partialReserveFundAmount: initialData.partialReserveFundAmount === undefined ? undefined : Number(initialData.partialReserveFundAmount),
      nonReserveFundParticipants: initialData.nonReserveFundParticipants || [],
      refundReserveFundToNonParticipants: initialData.refundReserveFundToNonParticipants || false,
      reserveFundRefundRecipientIds: initialData.reserveFundRefundRecipientIds || [],
      memo: initialData.memo || '',
      isTemporary: initialData.isTemporary || false,
      temporaryParticipants: initialData.temporaryParticipants || [],
      totalFee: initialData.totalFee,
      feePerPerson: initialData.feePerPerson,
    } : {
      name: '',
      dateTime: (() => { const t = new Date(); t.setHours(11, 0, 0, 0); return t; })(),
      endTime: undefined,
      locationName: '',
      locationCoordinates: undefined,
      participantIds: friends.map(f => f.id),
      useReserveFund: false,
      reserveFundCoverAll: false,
      partialReserveFundAmount: undefined,
      nonReserveFundParticipants: [],
      refundReserveFundToNonParticipants: false,
      reserveFundRefundRecipientIds: [],
      memo: '',
      isTemporary: false,
      temporaryParticipants: [],
      totalFee: undefined,
      feePerPerson: undefined,
    },
  });

  const { draft, saved, dismissDraft, discardDraft, completeDraft } = useMeetingDraft(form, currentUserId, !isEditMode, currentMeetingGroupId);

  const restoreDraft = () => {
    if (!draft) return;
    if (draft.groupId && !draft.values.isTemporary && !groups.some(group => group.id === draft.groupId)) {
      toast({ title: '그룹 확인 필요', description: '임시 저장한 그룹을 사용할 수 없습니다. 그룹을 다시 선택해주세요.', variant: 'destructive' });
    }
    const validGroupId = groups.some(group => group.id === draft.groupId) ? draft.groupId : null;
    onGroupChange?.(validGroupId);
    form.reset({ ...form.getValues(), ...draft.values });
    setTemporaryParticipants(draft.values.temporaryParticipants || []);
    setTempMeetingTotalFee(draft.values.totalFee);
    setTempMeetingFeePerPerson(draft.values.feePerPerson);
    setTempMeetingFeeType(draft.values.feePerPerson !== undefined ? 'perPerson' : 'total');
    dismissDraft();
  };

  const watchUseReserveFund = useWatch({ control: form.control, name: 'useReserveFund' });
  const watchReserveFundCoverAll = useWatch({ control: form.control, name: 'reserveFundCoverAll' });
  const watchParticipantIds = useWatch({ control: form.control, name: 'participantIds' });

  useEffect(() => {
    const pending = pendingGroupSelection.current;
    if (!pending || pending.id !== currentMeetingGroupId) return;
    if (isLoadingFriends) { pending.sawLoading = true; return; }
    if (friends.some(friend => friend.groupId !== pending.id)) return;
    if (!friends.length && !pending.sawLoading) return;
    form.setValue('participantIds', friends.filter(friend => !friend.isArchived).map(friend => friend.id), { shouldValidate: true, shouldDirty: true });
    form.setValue('nonReserveFundParticipants', [], { shouldValidate: true });
    pendingGroupSelection.current = null;
  }, [currentMeetingGroupId, friends, isLoadingFriends, form]);
  const watchedLocationCoordinates = useWatch({ control: form.control, name: 'locationCoordinates' });
  const watchLocationName = useWatch({ control: form.control, name: 'locationName' });
  const watchedIsTemporary = useWatch({ control: form.control, name: 'isTemporary' });
  const startTimeValue = useWatch({ control: form.control, name: 'dateTime' });
  const endTimeValue = useWatch({ control: form.control, name: 'endTime' });
  const watchPartialReserveFundAmount = useWatch({ control: form.control, name: 'partialReserveFundAmount' });
  const watchNonReserveFundParticipants = useWatch({ control: form.control, name: 'nonReserveFundParticipants' });
  const watchRefundReserveFundToNonParticipants = useWatch({ control: form.control, name: 'refundReserveFundToNonParticipants' });
  const watchReserveFundRefundRecipientIds = useWatch({ control: form.control, name: 'reserveFundRefundRecipientIds' });

  const selectedParticipants = useMemo(
    () => friends.filter(friend => watchParticipantIds?.includes(friend.id)),
    [friends, watchParticipantIds]
  );

  const selectedParticipantIds = useMemo(
    () => selectedParticipants.map(participant => participant.id),
    [selectedParticipants]
  );

  const refundableNonParticipants = useMemo(
    () => friends.filter(friend => !(watchParticipantIds || []).includes(friend.id)),
    [friends, watchParticipantIds]
  );

  const reserveFundPreview = useMemo(
    () =>
      calculateReserveFundBreakdown({
        settings: {
          useReserveFund: watchUseReserveFund || false,
          reserveFundCoverAll: watchReserveFundCoverAll || false,
          partialReserveFundAmount: watchPartialReserveFundAmount,
          nonReserveFundParticipants: watchNonReserveFundParticipants || [],
          refundReserveFundToNonParticipants: watchRefundReserveFundToNonParticipants || false,
          reserveFundRefundRecipientIds: watchReserveFundRefundRecipientIds || [],
        },
        expenses,
        participantIds: selectedParticipantIds,
      }),
    [
      expenses,
      watchNonReserveFundParticipants,
      watchPartialReserveFundAmount,
      watchRefundReserveFundToNonParticipants,
      watchReserveFundRefundRecipientIds,
      watchUseReserveFund,
      watchReserveFundCoverAll,
      selectedParticipantIds,
    ]
  );

  useEffect(() => {
    if (showMap && isMapsLoaded && !mapsLoadError && mapContainerRef.current && window.google?.maps?.Map && window.google?.maps?.marker?.AdvancedMarkerElement) {
        const { AdvancedMarkerElement } = window.google.maps.marker;

        const defaultCenter = { lat: 37.5665, lng: 126.9780 };
        const currentCoords = watchedLocationCoordinates || defaultCenter;
        const zoomLevel = watchedLocationCoordinates ? 15 : 10;

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
                center: currentCoords,
                zoom: zoomLevel,
                disableDefaultUI: true,
                zoomControl: true,
                mapId: 'NBBANG_MAP_ID_CREATE_FORM',
            });
        } else {
            mapInstanceRef.current.setCenter(currentCoords);
            mapInstanceRef.current.setZoom(zoomLevel);
        }

        if (watchedLocationCoordinates) {
            if (!markerInstanceRef.current) {
                markerInstanceRef.current = new AdvancedMarkerElement({
                    map: mapInstanceRef.current,
                    position: watchedLocationCoordinates,
                    title: watchLocationName || '선택된 장소',
                });
            } else {
                markerInstanceRef.current.position = watchedLocationCoordinates;
                markerInstanceRef.current.title = watchLocationName || '선택된 장소';
                markerInstanceRef.current.map = mapInstanceRef.current;
            }
        } else {
            if (markerInstanceRef.current) {
                markerInstanceRef.current.map = null;
            }
        }
    } else if (!showMap && markerInstanceRef.current) {
        markerInstanceRef.current.map = null;
    }

    return () => {
      if (markerInstanceRef.current) {
        markerInstanceRef.current.map = null;
      }
    };
  }, [isMapsLoaded, mapsLoadError, watchedLocationCoordinates, watchLocationName, showMap]);

  useEffect(() => {
    if (isEditMode && initialData) {
      setTemporaryParticipants(initialData.isTemporary ? (initialData.temporaryParticipants || []) : []);
      if (initialData.isTemporary) {
        if (initialData.totalFee !== undefined) {
          setTempMeetingFeeType('total');
          setTempMeetingTotalFee(initialData.totalFee);
          setTempMeetingFeePerPerson(undefined);
        } else if (initialData.feePerPerson !== undefined) {
          setTempMeetingFeeType('perPerson');
          setTempMeetingFeePerPerson(initialData.feePerPerson);
          setTempMeetingTotalFee(undefined);
        } else {
          setTempMeetingFeeType('total');
          setTempMeetingTotalFee(undefined);
          setTempMeetingFeePerPerson(undefined);
        }
      }
    }
  }, [isEditMode, initialData]);

  const [reserveFundInput, setReserveFundInput] = useState<string>(
    initialData && initialData.partialReserveFundAmount !== undefined && initialData.partialReserveFundAmount !== null
      ? Number(initialData.partialReserveFundAmount).toLocaleString()
      : ''
  );

  useEffect(() => {
    if (watchPartialReserveFundAmount === undefined || watchPartialReserveFundAmount === null || isNaN(watchPartialReserveFundAmount)) {
      setReserveFundInput('');
    } else {
      setReserveFundInput(Number(watchPartialReserveFundAmount).toLocaleString());
    }
  }, [watchPartialReserveFundAmount]);

  useEffect(() => {
    if (watchUseReserveFund) {
      return;
    }

    if (watchRefundReserveFundToNonParticipants) {
      form.setValue('refundReserveFundToNonParticipants', false, { shouldValidate: true });
    }
    if ((watchReserveFundRefundRecipientIds || []).length > 0) {
      form.setValue('reserveFundRefundRecipientIds', [], { shouldValidate: true });
    }
  }, [form, watchRefundReserveFundToNonParticipants, watchReserveFundRefundRecipientIds, watchUseReserveFund]);

  useEffect(() => {
    if (isLoadingFriends || !friends.length) return;
    const validRecipientIds = (watchReserveFundRefundRecipientIds || []).filter(
      id => !(watchParticipantIds || []).includes(id) && friends.some(friend => friend.id === id)
    );

    if (validRecipientIds.length !== (watchReserveFundRefundRecipientIds || []).length) {
      form.setValue('reserveFundRefundRecipientIds', validRecipientIds, { shouldValidate: true });
    }
  }, [form, friends, isLoadingFriends, watchParticipantIds, watchReserveFundRefundRecipientIds]);

  const handleApplyTotalReserveFundAmount = useCallback(() => {
    form.setValue('partialReserveFundAmount', reserveFundPreview.applicableContributionTotal, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, reserveFundPreview.applicableContributionTotal]);

  const onSubmit = async (data: MeetingFormData) => {
    if (isPending) return;
    const resolvedGroupId = currentMeetingGroupId || (initialData?.groupId ?? '');
    if (!data.isTemporary && (!resolvedGroupId || !resolvedGroupId.trim())) {
      toast({
        title: '그룹 선택 필요',
        description: '일반 모임은 반드시 친구 그룹을 선택해야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsPending(true);
    try {
      type PayloadType = Omit<Meeting, 'id' | 'createdAt' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate'> & { creatorId: string };
      let payloadForDb: PayloadType;

      if (data.isTemporary) {
        payloadForDb = {
          name: data.name,
          dateTime: data.dateTime,
          endTime: data.endTime,
          locationName: data.locationName || '',
          locationCoordinates: data.locationCoordinates || undefined,
          creatorId: currentUserId,
          groupId: resolvedGroupId,
          memo: data.memo || undefined,
          isTemporary: true,
          temporaryParticipants: data.temporaryParticipants || [],
          totalFee: data.totalFee,
          feePerPerson: data.feePerPerson,
          participantIds: [],
          useReserveFund: false,
          reserveFundCoverAll: false,
          partialReserveFundAmount: undefined,
          nonReserveFundParticipants: [],
          refundReserveFundToNonParticipants: false,
          reserveFundRefundRecipientIds: [],
        };
      } else {
        payloadForDb = {
          name: data.name,
          dateTime: data.dateTime,
          endTime: data.endTime,
          locationName: data.locationName || '',
          locationCoordinates: data.locationCoordinates || undefined,
          participantIds: data.participantIds || [],
          creatorId: currentUserId,
          useReserveFund: data.useReserveFund || false,
          reserveFundCoverAll: Boolean(data.useReserveFund && data.reserveFundCoverAll),
          partialReserveFundAmount:
            data.useReserveFund && typeof data.partialReserveFundAmount === 'number' && !isNaN(data.partialReserveFundAmount)
              ? data.partialReserveFundAmount
              : undefined,
          nonReserveFundParticipants: data.nonReserveFundParticipants || [],
          refundReserveFundToNonParticipants: data.useReserveFund ? (data.refundReserveFundToNonParticipants || false) : false,
          reserveFundRefundRecipientIds:
            data.useReserveFund && data.refundReserveFundToNonParticipants
              ? data.reserveFundRefundRecipientIds || []
              : [],
          memo: data.memo || undefined,
          groupId: resolvedGroupId,
          isTemporary: false,
          temporaryParticipants: undefined,
          totalFee: undefined,
          feePerPerson: undefined,
        };
      }

      if (isEditMode && initialData) {
        const result = await updateMeetingAction(initialData.id, payloadForDb as Partial<Meeting>, currentUserId);
        if (result.success && result.meeting) {
          toast({ title: '성공', description: '모임 정보가 수정되었습니다.' });
          router.push(`/meetings/${result.meeting.id}`);
          router.refresh();
        } else {
           toast({
            title: '오류',
            description: result.error || '모임 수정에 실패했습니다.',
            variant: 'destructive',
          });
        }
      } else {
        if (!currentUserId) {
          toast({ title: '로그인이 필요합니다.', description: '로그인 후 다시 시도해 주세요.', variant: 'destructive' });
          return;
        }
        const result = await createMeetingAction(payloadForDb, currentUserId);
        if (result.success && result.meeting) {
          completeDraft();
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
    } catch (cause) {
      toast({ title: '저장 실패', description: cause instanceof Error ? cause.message : '모임 저장 중 오류가 발생했습니다. 작성 내용은 유지됩니다.', variant: 'destructive' });
    } finally { setIsPending(false); }
  };

  const handleLocationSelected = useCallback((coords: { lat: number; lng: number } | undefined, name: string) => {
    if (!coords && !name && showMap) {
        setShowMap(false);
    }
  }, [showMap]);

  const handleToggleMap = () => {
    if (watchedLocationCoordinates) {
        setShowMap(prev => !prev);
    } else {
        toast({title: "알림", description: "지도를 표시할 장소 좌표가 없습니다. 장소를 먼저 선택해주세요.", variant: "default"});
        setShowMap(false);
    }
  };

  const isAddedTempParticipantsOnEdit = (addedName: string) => {
    return addedTempParticipantsOnEdit.some(p => p.name === addedName);
  };

  const handleAddTemporaryParticipant = (name: string) => {
    const participant = name.trim();
    if (participant !== '') {
      if (temporaryParticipants.filter(p => p.name === participant).length > 0) {
        toast({title: "알림", description: "이미 추가된 참여자입니다.", variant: "default"});
        return;
      }
      const newParticipant = { id: crypto.randomUUID(), name: participant };
      const newList = [...temporaryParticipants, newParticipant];
      setTemporaryParticipants(newList);
      form.setValue('temporaryParticipants', newList, { shouldValidate: true });
      setCurrentTempParticipantName('');

      setAddedTempParticipantsOnEdit(previous => [...previous, newParticipant]);
    }
  };

  const handleRemoveTemporaryParticipant = (name: string) => {
    const newList = temporaryParticipants.filter(p => p.name != name);
    setTemporaryParticipants(newList);
    form.setValue('temporaryParticipants', newList, { shouldValidate: true });

    setAddedTempParticipantsOnEdit(addedTempParticipantsOnEdit.filter(p => p.name != name));
  };

  const isFormDisabled = useMemo(() => isPending || (isEditMode && initialData?.isSettled), [isPending, isEditMode, initialData]);

  return (
    <form
      onSubmit={form.handleSubmit(
        onSubmit,
        (formErrors) => {
          const firstError = Object.values(formErrors)[0];
          if (firstError) {
            const msg =
              typeof firstError.message === 'string'
                ? firstError.message
                : '입력값을 확인해주세요.';
            toast({
              title: '입력 오류',
              description: msg,
              variant: 'destructive',
            });
          }
        }
      )}
      className="space-y-6"
    >
      {!isEditMode && draft && <div className="space-y-2 rounded-lg border bg-secondary/30 p-4" role="status">
        <p className="text-sm">이전에 작성하던 모임이 있습니다.</p>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={restoreDraft}>작성 내용 복원</Button><Button type="button" variant="ghost" size="sm" onClick={discardDraft}>저장 내용 지우기</Button></div>
      </div>}
      {!isEditMode && !draft && saved && <p className="text-xs text-muted-foreground" role="status">작성 내용이 이 브라우저에 임시 저장되었습니다.</p>}
      <div>
        <Label htmlFor="name" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>모임 이름 <span className="text-destructive">*</span></Label>
        <Input id="name" {...form.register('name')} disabled={isPending || (isEditMode && initialData?.isSettled)} />
        {form.formState.errors.name && <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>}
      </div>

      <div className="mb-4">
        <div className="flex items-center space-x-2 mt-2">
          <Controller
            control={form.control}
            name="isTemporary"
            render={({ field }) => (
              <Switch
                id="temporaryMeetingSwitch"
                checked={!!field.value}
                onCheckedChange={field.onChange}
                disabled={isFormDisabled || isEditMode}
              />
            )}
          />
          <Label htmlFor="temporaryMeetingSwitch" className={cn("cursor-pointer", (isPending || (isEditMode && initialData?.isSettled)) && "text-muted-foreground cursor-not-allowed")}>임시 모임 만들기</Label>
        </div>
        {form.formState.errors.isTemporary && <p className="text-sm text-destructive mt-1">{form.formState.errors.isTemporary.message}</p>}
      </div>

      {!watchedIsTemporary && typeof onGroupChange === 'function' && (
        <div className="mt-2 mb-4">
          <label className="block mb-1 font-medium">친구 그룹 선택 {!initialData?.groupId && <span className="text-destructive">*</span>}</label>
          <Popover open={groupPopoverOpen} onOpenChange={setGroupPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-label="친구 그룹 선택"
                aria-expanded={groupPopoverOpen}
                className="w-full justify-between"
                onClick={() => setGroupPopoverOpen((prev) => !prev)}
              >
                {currentMeetingGroupId
                  ? (groups.find(g => g.id === currentMeetingGroupId)?.name || '그룹 선택...')
                  : '그룹 선택...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="그룹 이름 검색..." />
                <CommandList>
                  <CommandEmpty>그룹을 찾을 수 없습니다.</CommandEmpty>
                  <CommandGroup>
                    {groups.map(group => (
                      <CommandItem
                        key={group.id}
                        value={group.name}
                        onSelect={() => {
                          if (group.id !== currentMeetingGroupId) {
                            pendingGroupSelection.current = { id: group.id, sawLoading: false };
                            form.setValue('participantIds', [], { shouldValidate: true, shouldDirty: true });
                          }
                          if (onGroupChange) onGroupChange(group.id);
                          setGroupPopoverOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", currentMeetingGroupId === group.id ? "opacity-100" : "opacity-0")} />
                        <span>{group.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div>
        <SelectDate
          isEditMode={isEditMode}
          isPending={isPending}
          initialData={initialData}
          timeValue={startTimeValue}
          varName='dateTime'
          titleNode={<>시작 날짜 및 시간 <span className="text-destructive">*</span></>}
          openState={startDateOpen}
          openStateFunc={setStartDateOpen}
          onDateChanged={date => form.setValue('dateTime', date!, { shouldValidate: true })}
        />
        {form.formState.errors.dateTime && <p className="text-sm text-destructive mt-1">{form.formState.errors.dateTime.message}</p>}
      </div>

      <div>
        <SelectDate
          isEditMode={isEditMode}
          isPending={isPending}
          initialData={initialData}
          timeValue={endTimeValue}
          checkStartTimeValue={startTimeValue}
          varName='endTime'
          titleNode='종료 날짜 및 시간 (선택)'
          openState={endDateOpen}
          openStateFunc={setEndDateOpen}
          onDateChanged={date => form.setValue('endTime', date, { shouldValidate: true })}
        />
        {form.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{form.formState.errors.endTime.message}</p>}
      </div>

      {!watchedIsTemporary && (
        <div>
          <Label className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground", watchedIsTemporary && "text-muted-foreground")}>
            참여자 <span className="text-destructive">*</span>
          </Label>
          <Popover open={participantSearchOpen} onOpenChange={setParticipantSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-label="참여자 선택"
                aria-expanded={participantSearchOpen}
                className={cn(
                  "w-full justify-between",
                  (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed",
                  watchedIsTemporary && "bg-muted/50 cursor-not-allowed opacity-50"
                )}
                disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary}
              >
                {selectedParticipants.length > 0
                  ? selectedParticipants.map(f => f.name + (f.description ? ` (${f.description})` : "")).join(', ')
                  : "참여자 선택..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="친구 이름 또는 설명으로 검색..." />
                <CommandList>
                  <CommandEmpty>친구를 찾을 수 없습니다.</CommandEmpty>
                  <CommandGroup>
                    {isLoadingFriends ? (
                      <CommandItem disabled className="text-muted-foreground">친구 목록 로딩 중...</CommandItem>
                    ) : friends.length === 0 ? (
                      <CommandItem disabled className="text-muted-foreground">
                        {watchedIsTemporary ? "임시 모임에는 참여자를 직접 추가합니다." : (currentMeetingGroupId ? "선택된 그룹에 친구가 없습니다." : "먼저 그룹을 선택해주세요.")}
                      </CommandItem>
                    ) : (
                      friends.map((friend) => {
                        const isChecked = watchParticipantIds?.includes(friend.id);
                        return (
                          <CommandItem
                            key={friend.id}
                            value={friend.name + (friend.description ? ` ${friend.description}` : "")}
                            onSelect={() => {
                              if (isEditMode && initialData?.isSettled || watchedIsTemporary) return;
                              const currentParticipantIds = watchParticipantIds || [];
                              let newParticipantIds = [...currentParticipantIds];

                              if (newParticipantIds.includes(friend.id)) {
                                newParticipantIds = newParticipantIds.filter(id => id !== friend.id);
                              } else {
                                newParticipantIds.push(friend.id);
                              }
                              form.setValue("participantIds", newParticipantIds, { shouldValidate: true });

                              const currentNonParticipants = watchNonReserveFundParticipants || [];
                              if (!newParticipantIds.includes(friend.id) && currentNonParticipants.includes(friend.id)) {
                                  form.setValue('nonReserveFundParticipants', currentNonParticipants.filter(id => id !== friend.id), { shouldValidate: true });
                              }
                            }}
                            className={cn(
                              (isEditMode && initialData?.isSettled) && "cursor-not-allowed opacity-50",
                              watchedIsTemporary && "cursor-not-allowed opacity-30"
                              )}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                isChecked ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span>
                              {friend.name}
                              {friend.description && (
                                <span className="ml-1 text-xs text-muted-foreground">({friend.description})</span>
                              )}
                              {friend.id === currentUserId && " (나)"}
                            </span>
                          </CommandItem>
                        );
                      })
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {form.formState.errors.participantIds && <p className="text-sm text-destructive mt-1">{form.formState.errors.participantIds.message}</p>}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="locationNameInput" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>장소</Label>
        {isMapsLoaded && !mapsLoadError ? (
          <LocationSearchInput
            form={form}
            isPending={isPending || (isEditMode && (initialData?.isSettled ?? false))}
            isMapsLoaded={isMapsLoaded}
            mapsLoadError={mapsLoadError}
            onLocationSelected={handleLocationSelected}
          />
        ) : (
            <div className="relative flex items-center">
                <MapPinIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    id="locationNameInput"
                    value={watchLocationName}
                    onChange={(e) => {
                      form.setValue('locationName', e.target.value, { shouldDirty: true, shouldValidate: true });
                      form.setValue('locationCoordinates', undefined, { shouldDirty: true });
                    }}
                    disabled={isPending || (isEditMode && initialData?.isSettled)}
                    className={cn("pl-8", (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed")}
                    placeholder="장소 이름을 직접 입력하거나 장소 검색을 사용하세요."
                />
            </div>
        )}
        {form.formState.errors.locationName && <p className="text-sm text-destructive mt-1">{form.formState.errors.locationName.message}</p>}
        {placeSearchEnabled && !isMapsLoaded && !mapsLoadError && <p role="status" className="mt-2 text-sm text-muted-foreground">장소 검색을 불러오는 중입니다.</p>}
        {mapsLoadError && <div className="mt-2 text-sm text-muted-foreground" role="alert">{mapsLoadError.message} <Button type="button" variant="ghost" size="sm" onClick={retryMaps}>다시 시도</Button></div>}

        <div className="flex flex-wrap gap-2 mt-2">
            {!placeSearchEnabled && <Button type="button" variant="outline" size="sm" onClick={() => setPlaceSearchEnabled(true)} disabled={isFormDisabled}><MapPinIcon className="mr-2 h-4 w-4" />장소 검색</Button>}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggleMap}
                className="sm:w-auto"
                disabled={isPending || (isEditMode && initialData?.isSettled) || !watchedLocationCoordinates}
            >
                <Eye className="mr-2 h-4 w-4" />
                {showMap ? '지도 숨기기' : '지도 보기'}
            </Button>
            {(watchLocationName || watchedLocationCoordinates) && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                    const placeName = watchLocationName;
                    let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName || '')}`;
                    if (watchedLocationCoordinates) {
                        url = `https://www.google.com/maps/place/${encodeURIComponent(placeName || '')}/@${watchedLocationCoordinates.lat},${watchedLocationCoordinates.lng},15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!7e2!8m2!3d${watchedLocationCoordinates.lat}!4d${watchedLocationCoordinates.lng}`;
                        if (placeName && watchedLocationCoordinates) {
                             url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}&ll=${watchedLocationCoordinates.lat},${watchedLocationCoordinates.lng}`;
                        } else if (placeName) {
                             url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}`;
                        } else if (watchedLocationCoordinates) {
                             url = `https://www.google.com/maps?q=${watchedLocationCoordinates.lat},${watchedLocationCoordinates.lng}`;
                        }
                    }
                    window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                    className="sm:w-auto"
                    disabled={isPending || (isEditMode && initialData?.isSettled) || (!watchLocationName && !watchedLocationCoordinates)}
                >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    외부 지도에서 보기
                </Button>
            )}
        </div>
      </div>

      <div
        ref={mapContainerRef}
        className={cn(
            "mt-1 h-64 w-full rounded-md border",
            (showMap && isMapsLoaded && !mapsLoadError && watchedLocationCoordinates) ? 'block' : 'hidden'
        )}
      >
            {(!watchedLocationCoordinates && showMap && isMapsLoaded) && <p className="flex items-center justify-center h-full text-muted-foreground">표시할 좌표가 없습니다. 장소를 선택해주세요.</p>}
            {(isPending && showMap) && <p className="flex items-center justify-center h-full text-muted-foreground">로딩 중...</p>}
            {(!isMapsLoaded && showMap) && <p className="flex items-center justify-center h-full text-muted-foreground">지도 API 로딩 중...</p>}
            {(mapsLoadError && showMap) && <p className="flex items-center justify-center h-full text-muted-foreground">지도 API 로드 실패: {mapsLoadError.message}</p>}
      </div>

      {!watchedIsTemporary && <MeetingReserveFundSection
        form={form} isPending={isPending} isEditMode={isEditMode} initialData={initialData}
        watchUseReserveFund={watchUseReserveFund} watchedIsTemporary={watchedIsTemporary}
        reserveFundPreview={reserveFundPreview} handleApplyTotalReserveFundAmount={handleApplyTotalReserveFundAmount}
        reserveFundInput={reserveFundInput} setReserveFundInput={setReserveFundInput}
        selectedParticipants={selectedParticipants} currentUserId={currentUserId}
        watchRefundReserveFundToNonParticipants={watchRefundReserveFundToNonParticipants}
        refundableNonParticipants={refundableNonParticipants}
      />}

      {watchedIsTemporary && (
        <div className="space-y-4 border p-4 rounded-md mt-4">
          <h3 className="text-lg font-medium">임시 모임 정보</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tempParticipantName">임시 참여자 이름 <span className="text-destructive">*</span></Label>
              <div className="flex space-x-2">
                <Input
                  id="tempParticipantName"
                  value={currentTempParticipantName}
                  onChange={(e) => setCurrentTempParticipantName(e.target.value)}
                  placeholder="참여자 이름"
                  disabled={isPending || (isEditMode && initialData?.isSettled)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddTemporaryParticipant(currentTempParticipantName)}
                  disabled={isPending || initialData?.isSettled}
                >
                  추가
                </Button>
              </div>
              {form.formState.errors.temporaryParticipants && !temporaryParticipants.length && <p className="text-sm text-destructive mt-1">{form.formState.errors.temporaryParticipants.message}</p>}
              <ul className="mt-2 space-y-1">
                {temporaryParticipants.map((p, index) => (
                  <li key={p.id || `${p.name}-${index}`} className="text-sm flex justify-between items-center p-1 bg-secondary rounded-md">
                    {p.name}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTemporaryParticipant(p.name)}
                      disabled={isPending || initialData?.isSettled || (isEditMode && isAddedTempParticipantsOnEdit(p.name) != true)}
                    >
                      삭제
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="space-y-2">
            <Label>회비 설정 (임시 모임) <span className="text-xs text-muted-foreground">(선택 사항)</span></Label>
            <RadioGroup
              value={tempMeetingFeeType}
              onValueChange={(value: 'total' | 'perPerson') => {
                 if (!(isEditMode && initialData?.isSettled)) {
                   setTempMeetingFeeType(value);
                   form.setValue('totalFee', value === 'total' ? tempMeetingTotalFee : undefined, { shouldDirty: true });
                   form.setValue('feePerPerson', value === 'perPerson' ? tempMeetingFeePerPerson : undefined, { shouldDirty: true });
                 }
              }}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="total" id="tempFeeTotal" disabled={isPending || (isEditMode && initialData?.isSettled)} />
                <Label htmlFor="tempFeeTotal" className={cn((isPending || (isEditMode && initialData?.isSettled)) && "text-muted-foreground cursor-not-allowed")}>총액</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="perPerson" id="tempFeePerPerson" disabled={isPending || (isEditMode && initialData?.isSettled)} />
                <Label htmlFor="tempFeePerPerson" className={cn((isPending || (isEditMode && initialData?.isSettled)) && "text-muted-foreground cursor-not-allowed")}>1인당</Label>
              </div>
            </RadioGroup>
            {tempMeetingFeeType === 'total' ? (
              <div>
                <Label htmlFor="tempTotalFee" className={cn((isPending || (isEditMode && initialData?.isSettled)) && "text-muted-foreground")}>총 회비 <span className="text-xs text-muted-foreground">(선택 사항)</span></Label>
                <Input
                  id="tempTotalFee"
                  type="number"
                  placeholder="전체 회비 금액"
                  value={tempMeetingTotalFee === undefined ? '' : tempMeetingTotalFee}
                  onChange={(e) => { const value = e.target.value === '' ? undefined : Number(e.target.value); setTempMeetingTotalFee(value); form.setValue('totalFee', value, { shouldDirty: true, shouldValidate: true }); }}
                  disabled={isPending || (isEditMode && initialData?.isSettled)}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="tempFeePerPersonInput" className={cn((isPending || (isEditMode && initialData?.isSettled)) && "text-muted-foreground")}>1인당 회비 <span className="text-xs text-muted-foreground">(선택 사항)</span></Label>
                <Input
                  id="tempFeePerPersonInput"
                  type="number"
                  placeholder="1인당 회비 금액"
                  value={tempMeetingFeePerPerson === undefined ? '' : tempMeetingFeePerPerson}
                  onChange={(e) => { const value = e.target.value === '' ? undefined : Number(e.target.value); setTempMeetingFeePerPerson(value); form.setValue('feePerPerson', value, { shouldDirty: true, shouldValidate: true }); }}
                  disabled={isPending || (isEditMode && initialData?.isSettled)}
                />
              </div>
            )}
            {form.formState.errors.totalFee && tempMeetingFeeType === 'total' && <p className="text-sm text-destructive mt-1">{form.formState.errors.totalFee.message}</p>}
            {form.formState.errors.feePerPerson && tempMeetingFeeType === 'perPerson' && <p className="text-sm text-destructive mt-1">{form.formState.errors.feePerPerson.message}</p>}
            {form.formState.errors.totalFee && form.formState.errors.totalFee.type === 'custom' && <p className="text-sm text-destructive mt-1">{form.formState.errors.totalFee.message}</p>}

          </div>
        </div>
      )}


      <div className="space-y-2">
        <Label htmlFor="memo" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>메모</Label>
        <Controller
          name="memo"
          control={form.control}
          render={({ field }) => (
            <textarea
              id="memo"
              className={cn(
                "w-full min-h-[80px] p-2 border rounded-md text-sm",
                (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed"
              )}
              maxLength={2000}
              placeholder="모임에 대한 메모를 입력하세요..."
              disabled={isPending || (isEditMode && initialData?.isSettled)}
              {...field}
            />
          )}
        />
        {form.formState.errors.memo && <p className="text-sm text-destructive mt-1">{form.formState.errors.memo.message}</p>}
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          취소
        </Button>
        <Button type="submit" disabled={isPending || (isEditMode && initialData?.isSettled)}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditMode ? (initialData?.isSettled ? '정산 확정됨' : '모임 수정') : '모임 만들기'}
        </Button>
      </div>
    </form>
  );
}
