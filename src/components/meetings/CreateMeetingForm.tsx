
'use client';

import React, { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from "@/components/ui/checkbox";
import { Loader } from '@googlemaps/js-api-loader';
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete';

const meetingSchemaBase = z.object({
  name: z.string().min(1, '모임 이름을 입력해주세요.').max(100, '모임 이름은 100자 이내여야 합니다.'),
  dateTime: z.date({ required_error: '시작 날짜와 시간을 선택해주세요.' }),
  endTime: z.date().optional(),
  locationName: z.string().min(1, '장소를 입력해주세요.').max(100, '장소 이름은 100자 이내여야 합니다.'),
  locationCoordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  participantIds: z.array(z.string()).min(1, '참여자를 최소 1명 선택해주세요.'),
  useReserveFund: z.boolean(),
  partialReserveFundAmount: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(String(val).replace(/,/g, ''))),
    z.number().min(0, '금액은 0 이상이어야 합니다.').optional()
  ),
  nonReserveFundParticipants: z.array(z.string()),
});

const meetingSchema = meetingSchemaBase.refine(data => {
  if (data.useReserveFund) {
    return data.partialReserveFundAmount !== undefined && data.partialReserveFundAmount > 0;
  }
  return true;
}, {
  message: '회비 사용 시, 사용할 회비 금액을 0보다 크게 입력해야 합니다.',
  path: ['partialReserveFundAmount'],
}).refine(data => {
  if (data.endTime && data.dateTime && data.dateTime >= data.endTime) {
    return false;
  }
  return true;
}, {
  message: '종료 시간은 시작 시간보다 이후여야 합니다.',
  path: ['endTime'],
});

type MeetingFormData = z.infer<typeof meetingSchema>;

interface MeetingFormProps {
  friends: Friend[];
  currentUserId: string;
  isEditMode?: boolean;
  initialData?: Meeting;
}

const libraries: ("places" | "maps" | "marker")[] = ["places", "maps", "marker"];

interface LocationSearchInputProps {
  form: ReturnType<typeof useForm<MeetingFormData>>;
  isPending: boolean;
  initialLocationName?: string;
}

function LocationSearchInput({ form, isPending, initialLocationName }: LocationSearchInputProps) {
  const {
    ready,
    value: placesValue,
    suggestions: { status: placesStatus, data: placesData },
    setValue: setPlacesValue,
    clearSuggestions: clearPlacesSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: { /* Optional: configure to your liking */ },
    debounce: 300,
    defaultValue: initialLocationName || "",
  });

  const { toast } = useToast();

  useEffect(() => {
    console.log("Places Autocomplete ready state:", ready);
  }, [ready]);

  const handlePlaceSelect = async (suggestion: google.maps.places.AutocompletePrediction) => {
    setPlacesValue(suggestion.description, false);
    clearPlacesSuggestions();
    form.setValue('locationName', suggestion.description, { shouldValidate: true });

    try {
      const results = await getGeocode({ address: suggestion.description });
      const { lat, lng } = await getLatLng(results[0]);
      form.setValue('locationCoordinates', { lat, lng }, { shouldValidate: true });
      console.log("Location selected:", suggestion.description, { lat, lng });
      toast({ title: "장소 선택됨", description: `${suggestion.description}` });
    } catch (error) {
      console.error("Error getting coordinates for selected place: ", error);
      toast({ title: "오류", description: "장소의 좌표를 가져오는 데 실패했습니다.", variant: "destructive" });
      form.setValue('locationCoordinates', undefined, { shouldValidate: true });
    }
  };

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <MapPinIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="locationName"
          {...form.register('locationName', {
             onChange: (e) => setPlacesValue(e.target.value) 
          })}
          value={placesValue} 
          onChange={(e) => {
            setPlacesValue(e.target.value); 
            form.setValue('locationName', e.target.value, { shouldValidate: true }); 
          }}
          disabled={!ready || isPending}
          className="pl-8"
          placeholder={"장소 검색..."}
          autoComplete="off"
        />
      </div>
      {form.formState.errors.locationName && <p className="text-sm text-destructive mt-1">{form.formState.errors.locationName.message}</p>}
      {form.formState.errors.locationCoordinates && <p className="text-sm text-destructive mt-1">{form.formState.errors.locationCoordinates.message}</p>}

      {ready && placesStatus === 'OK' && placesData.length > 0 && (
        <ul className="absolute z-10 w-full bg-background border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
          {placesData.map((suggestion) => {
            const {
              place_id,
              structured_formatting: { main_text, secondary_text },
            } = suggestion;
            return (
              <li
                key={place_id}
                onClick={() => handlePlaceSelect(suggestion)}
                className="p-2 hover:bg-accent cursor-pointer"
              >
                <strong>{main_text}</strong> <small>{secondary_text}</small>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


export function CreateMeetingForm({ friends, currentUserId, isEditMode = false, initialData }: MeetingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [participantSearchOpen, setParticipantSearchOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const [isMapsLoaded, setIsMapsLoaded] = useState(false);
  const [mapsLoadError, setMapsLoadError] = useState<Error | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerInstanceRef = useRef<google.maps.Marker | null>(null);


  const form = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      dateTime: new Date(initialData.dateTime),
      endTime: initialData.endTime ? new Date(initialData.endTime) : undefined,
      locationName: initialData.locationName,
      locationCoordinates: initialData.locationCoordinates,
      participantIds: initialData.participantIds,
      useReserveFund: initialData.useReserveFund,
      partialReserveFundAmount: initialData.partialReserveFundAmount === undefined ? undefined : Number(initialData.partialReserveFundAmount),
      nonReserveFundParticipants: initialData.nonReserveFundParticipants || [],
    } : {
      name: '',
      dateTime: undefined,
      endTime: undefined,
      locationName: '',
      locationCoordinates: undefined,
      participantIds: [currentUserId],
      useReserveFund: false,
      partialReserveFundAmount: undefined,
      nonReserveFundParticipants: [],
    },
  });

  const watchUseReserveFund = form.watch('useReserveFund');
  const watchParticipantIds = form.watch('participantIds');
  const watchedLocationCoordinates = form.watch('locationCoordinates');
  const watchLocationName = form.watch('locationName'); // Watch locationName to clear coordinates if manually emptied

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key is not configured. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env file.");
      setMapsLoadError(new Error("Google Maps API key is not configured."));
      setIsMapsLoaded(false); // Ensure this is false
      return;
    }

    const loader = new Loader({
      apiKey: apiKey,
      version: "weekly",
      libraries: libraries,
    });

    console.log("Attempting to load Google Maps API...");
    loader.load()
      .then(() => {
        console.log("Google Maps API loaded successfully.");
        setIsMapsLoaded(true);
        setMapsLoadError(null);
      })
      .catch(e => {
        console.error("Failed to load Google Maps API. Error details:", e);
        setMapsLoadError(e);
        setIsMapsLoaded(false);
      });
  }, []);


  useEffect(() => {
    if (isMapsLoaded && !mapsLoadError && mapContainerRef.current && window.google && window.google.maps && window.google.maps.marker) {
      const defaultCenter = { lat: 37.5665, lng: 126.9780 }; // Default to Seoul
      const currentCoords = watchedLocationCoordinates || defaultCenter;
      const zoomLevel = watchedLocationCoordinates ? 15 : 10;

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
          center: currentCoords,
          zoom: zoomLevel,
          disableDefaultUI: true,
          zoomControl: true,
        });
      } else {
        mapInstanceRef.current.setCenter(currentCoords);
        mapInstanceRef.current.setZoom(zoomLevel);
      }

      if (watchedLocationCoordinates) {
        if (!markerInstanceRef.current) {
          markerInstanceRef.current = new window.google.maps.marker.AdvancedMarkerElement({
            map: mapInstanceRef.current,
            position: watchedLocationCoordinates,
          });
        } else {
          markerInstanceRef.current.position = watchedLocationCoordinates;
          if (!markerInstanceRef.current.map) { 
             markerInstanceRef.current.map = mapInstanceRef.current;
          }
        }
      } else { // No coordinates
        if (markerInstanceRef.current) {
          markerInstanceRef.current.map = null; 
          // Optional: If you want to completely remove and recreate the marker next time
          // markerInstanceRef.current = null; 
        }
      }
    }
  }, [isMapsLoaded, mapsLoadError, watchedLocationCoordinates]);

  // Effect to clear coordinates if locationName is manually emptied
  useEffect(() => {
    if (watchLocationName === '' && form.getValues('locationCoordinates')) {
      form.setValue('locationCoordinates', undefined, { shouldValidate: true });
    }
  }, [watchLocationName, form]);


  useEffect(() => {
    if (watchParticipantIds) {
      const currentNonParticipants = form.getValues('nonReserveFundParticipants') || [];
      const newNonParticipants = currentNonParticipants.filter(id => watchParticipantIds.includes(id));
      if (JSON.stringify(newNonParticipants.sort()) !== JSON.stringify(currentNonParticipants.sort())) {
         form.setValue('nonReserveFundParticipants', newNonParticipants, { shouldValidate: true });
      }
    }
  }, [watchParticipantIds, form]);

  useEffect(() => {
    if (!watchUseReserveFund) {
      form.setValue('partialReserveFundAmount', undefined, { shouldValidate: true });
      form.setValue('nonReserveFundParticipants', [], { shouldValidate: true });
    } else {
      // Optionally set a default partialReserveFundAmount if it's undefined and useReserveFund is true
      // if (form.getValues('partialReserveFundAmount') === undefined) {
      //   form.setValue('partialReserveFundAmount', 0, { shouldValidate: true });
      // }
    }
  }, [watchUseReserveFund, form]);
  
  const formatNumberInput = (value: number | string | undefined) => {
    if (value === undefined || value === '' || value === null) return '';
    const num = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(num) ? '' : num.toLocaleString();
  };


  const onSubmit = (data: MeetingFormData) => {
    startTransition(async () => {
      const payload: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'> = {
        ...data,
        locationCoordinates: data.locationCoordinates || undefined, 
        partialReserveFundAmount: data.useReserveFund && data.partialReserveFundAmount !== undefined
                                    ? Number(data.partialReserveFundAmount) 
                                    : undefined,
      };

      if (isEditMode && initialData) {
        const result = await updateMeetingAction(initialData.id, payload);
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
        <Label htmlFor="dateTime">시작 날짜 및 시간 <span className="text-destructive">*</span></Label>
        <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
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
              disabled={isPending}
            />
            <div className="p-3 border-t border-border space-y-2">
              <Label htmlFor="startTime">시작 시간</Label>
              <Input
                type="time"
                id="startTime"
                defaultValue={form.watch('dateTime') ? format(form.watch('dateTime'), "HH:mm") : "12:00"}
                onChange={(e) => {
                  const newTime = e.target.value;
                  const currentDateTime = form.watch('dateTime') || new Date();
                  const [hours, minutes] = newTime.split(':').map(Number);
                  currentDateTime.setHours(hours, minutes, 0, 0);
                  form.setValue('dateTime', new Date(currentDateTime), { shouldValidate: true });
                }}
                className="w-full"
                disabled={isPending}
              />
              <Button size="sm" onClick={() => setStartDateOpen(false)} className="w-full" type="button">확인</Button>
            </div>
          </PopoverContent>
        </Popover>
        {form.formState.errors.dateTime && <p className="text-sm text-destructive mt-1">{form.formState.errors.dateTime.message}</p>}
      </div>

      <div>
        <Label htmlFor="endTime">종료 날짜 및 시간 (선택)</Label>
        <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !form.watch('endTime') && 'text-muted-foreground'
              )}
              disabled={isPending}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {form.watch('endTime') ? format(form.watch('endTime'), 'PPP HH:mm', { locale: ko }) : <span>날짜 및 시간 선택</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={form.watch('endTime')}
              onSelect={(date) => {
                if (date) {
                  const currentTime = form.watch('endTime') || form.watch('dateTime') || new Date();
                  const newDateTime = new Date(date);
                  newDateTime.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);
                  form.setValue('endTime', newDateTime, { shouldValidate: true });
                } else {
                  form.setValue('endTime', undefined, { shouldValidate: true }); 
                }
              }}
              initialFocus
              disabled={isPending}
              fromDate={form.watch('dateTime') ? new Date(form.watch('dateTime')) : undefined}
            />
            <div className="p-3 border-t border-border space-y-2">
              <Label htmlFor="endTimeInput">종료 시간</Label>
              <Input
                type="time"
                id="endTimeInput"
                defaultValue={form.watch('endTime') ? format(form.watch('endTime'), "HH:mm") : form.watch('dateTime') ? format(form.watch('dateTime'), "HH:mm") : "12:00"}
                onChange={(e) => {
                  const newTime = e.target.value;
                  const currentDateTime = form.watch('endTime') || form.watch('dateTime') || new Date();
                  const [hours, minutes] = newTime.split(':').map(Number);
                  currentDateTime.setHours(hours, minutes, 0, 0);
                  form.setValue('endTime', new Date(currentDateTime), { shouldValidate: true });
                }}
                className="w-full"
                disabled={isPending}
              />
              <Button size="sm" onClick={() => setEndDateOpen(false)} className="w-full" type="button">확인</Button>
            </div>
          </PopoverContent>
        </Popover>
        {form.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{form.formState.errors.endTime.message}</p>}
      </div>
      
      <div>
        <Label htmlFor="locationNameInput">장소 <span className="text-destructive">*</span></Label>
        {isMapsLoaded && !mapsLoadError ? (
          <LocationSearchInput 
            form={form} 
            isPending={isPending}
            initialLocationName={initialData?.locationName}
          />
        ) : (
          <div className="relative flex items-center">
            <MapPinIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="locationNameInput" // Ensure this ID is unique if LocationSearchInput uses 'locationName' for its input
              value={form.watch('locationName')} // Display current form value
              onChange={(e) => form.setValue('locationName', e.target.value, {shouldValidate: true})} // Allow manual input if API fails
              disabled={isPending || !isMapsLoaded} // Disable if maps not loaded or pending
              className="pl-8"
              placeholder={
                mapsLoadError ? "지도 API 로드 실패" : "지도 API 로딩 중..."
              }
            />
          </div>
        )}
        {mapsLoadError && <p className="text-sm text-destructive mt-1">지도 API 로드에 실패했습니다: {mapsLoadError.message}</p>}
        {form.formState.errors.locationName && !isMapsLoaded && <p className="text-sm text-destructive mt-1">{form.formState.errors.locationName.message}</p>}
      </div>

      {isMapsLoaded && !mapsLoadError && ( // Only show map if API loaded and no error
        <div className="mt-4">
           <Label>선택된 장소 지도</Label>
           <div ref={mapContainerRef} className="h-64 w-full rounded-md border mt-1">
             {(!watchedLocationCoordinates && !isPending) && <p className="flex items-center justify-center h-full text-muted-foreground">장소를 선택하면 여기에 지도가 표시됩니다.</p>}
             {isPending && <p className="flex items-center justify-center h-full text-muted-foreground">로딩 중...</p>}
           </div>
        </div>
      )}
      
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Controller
            control={form.control}
            name="useReserveFund"
            render={({ field }) => (
              <Switch
                id="useReserveFund"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isPending || (isEditMode && initialData?.isSettled)}
              />
            )}
          />
          <Label 
            htmlFor="useReserveFund" 
            className={cn(
              "cursor-pointer", 
              (isEditMode && initialData?.isSettled) && "text-muted-foreground cursor-not-allowed"
            )}
          >
            모임 회비 사용 {(isEditMode && initialData?.isSettled) && "(정산 완료됨 - 수정 불가)"}
          </Label>
        </div>

        {watchUseReserveFund && (
          <div className="space-y-4 mt-4 pl-2 border-l-2 ml-2">
            <div>
              <Label 
                htmlFor="partialReserveFundAmount"
                className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}
              >
                사용할 회비 금액 (원) <span className="text-destructive">*</span>
              </Label>
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
                    disabled={isPending || (isEditMode && initialData?.isSettled)}
                    className="mt-1"
                    placeholder="예: 10000"
                  />
                )}
              />
              {form.formState.errors.partialReserveFundAmount && <p className="text-sm text-destructive mt-1">{form.formState.errors.partialReserveFundAmount.message}</p>}
            </div>

            <div>
              <Label className={cn("font-medium", (isEditMode && initialData?.isSettled) && "text-muted-foreground")}>회비 사용 제외 멤버</Label>
              <p className={cn("text-xs", (isEditMode && initialData?.isSettled) ? "text-muted-foreground/70" : "text-muted-foreground")}>
                선택된 멤버는 이 모임에서 회비 사용 혜택을 받지 않습니다.
              </p>
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
                              disabled={isPending || (isEditMode && initialData?.isSettled) || (participant.id === currentUserId && selectedParticipants.length === 1 && field.value?.includes(currentUserId) && checked === false )}
                            />
                           )}
                        />
                        <Label 
                          htmlFor={`nonReserveFund-${participant.id}`} 
                          className={cn(
                            "cursor-pointer", 
                            (isEditMode && initialData?.isSettled) && "text-muted-foreground cursor-not-allowed"
                          )}
                        >
                          {participant.nickname} {participant.id === currentUserId && "(나)"}
                        </Label>
                      </div>
                    ))
                 ) : (
                   <p className={cn("text-sm", (isEditMode && initialData?.isSettled) ? "text-muted-foreground/70" : "text-muted-foreground")}>참여자를 먼저 선택해주세요.</p>
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
              disabled={isPending || (isEditMode && initialData?.isSettled)}
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
                        if (isEditMode && initialData?.isSettled) return; 
                        const currentParticipantIds = form.getValues("participantIds") || [];
                        let newParticipantIds = currentParticipantIds.includes(friend.id)
                          ? currentParticipantIds.filter(id => id !== friend.id)
                          : [...currentParticipantIds, friend.id];
                        
                        if (friend.id === currentUserId && newParticipantIds.length === 0 && currentParticipantIds.length === 1) {
                           newParticipantIds = [currentUserId];
                        } else if (newParticipantIds.length === 0) {
                           newParticipantIds = [currentUserId];
                        }

                        form.setValue("participantIds", newParticipantIds, { shouldValidate: true });
                         const currentNonParticipants = form.getValues('nonReserveFundParticipants') || [];
                         if (!newParticipantIds.includes(friend.id) && currentNonParticipants.includes(friend.id)) {
                            form.setValue('nonReserveFundParticipants', currentNonParticipants.filter(id => id !== friend.id), { shouldValidate: true });
                         }
                      }}
                      className={cn((isEditMode && initialData?.isSettled) && "cursor-not-allowed opacity-50")}
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
        <Button type="submit" disabled={isPending || (isEditMode && initialData?.isSettled)}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditMode ? (initialData?.isSettled ? '정산 완료됨' : '모임 수정') : '모임 만들기'}
        </Button>
      </div>
    </form>
  );
}

    