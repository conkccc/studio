
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
import { CalendarIcon, Check, ChevronsUpDown, Loader2, MapPinIcon, Eye, ExternalLink } from 'lucide-react';
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
  if (data.useReserveFund && (data.partialReserveFundAmount === undefined || data.partialReserveFundAmount <= 0)) {
    return false;
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
  onLocationSelected: (coords: { lat: number; lng: number } | undefined, name: string) => void;
}

function LocationSearchInput({ form, isPending, initialLocationName, onLocationSelected }: LocationSearchInputProps) {
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
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    // Sync form value to placesValue if form.locationName is changed externally (e.g. by form.reset or initialData)
    const formLocationName = form.getValues('locationName');
    if (formLocationName !== placesValue && !inputFocused) {
      setPlacesValue(formLocationName || '');
    }
  }, [form.getValues('locationName'), placesValue, setPlacesValue, inputFocused]);


  const handlePlaceSelect = async (suggestion: google.maps.places.AutocompletePrediction) => {
    setPlacesValue(suggestion.description, false);
    clearPlacesSuggestions();
    form.setValue('locationName', suggestion.description, { shouldValidate: true });

    try {
      const results = await getGeocode({ address: suggestion.description });
      const { lat, lng } = await getLatLng(results[0]);
      form.setValue('locationCoordinates', { lat, lng }, { shouldValidate: true });
      onLocationSelected({lat, lng}, suggestion.description);
      toast({ title: "장소 선택됨", description: `${suggestion.description}` });
    } catch (error) {
      console.error("Error getting coordinates for selected place: ", error);
      toast({ title: "오류", description: "장소의 좌표를 가져오는 데 실패했습니다.", variant: "destructive" });
      form.setValue('locationCoordinates', undefined, { shouldValidate: true });
      onLocationSelected(undefined, suggestion.description);
    }
  };

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <MapPinIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="locationNameInput"
          value={placesValue}
          onChange={(e) => {
            setPlacesValue(e.target.value);
            form.setValue('locationName', e.target.value, { shouldValidate: true });
            if (!e.target.value) {
                form.setValue('locationCoordinates', undefined, { shouldValidate: true });
                onLocationSelected(undefined, '');
            }
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          disabled={!ready || isPending}
          className="pl-8"
          placeholder="장소 검색..."
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
  const [showMap, setShowMap] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerInstanceRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);


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
  const watchLocationName = form.watch('locationName');

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key is not configured. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env file.");
      setMapsLoadError(new Error("Google Maps API key is not configured."));
      setIsMapsLoaded(false);
      return;
    }

    const loader = new Loader({
      apiKey: apiKey,
      version: "weekly",
      libraries: libraries,
    });

    loader.load()
      .then(() => {
        if (!window.google || !window.google.maps || !window.google.maps.Map || !window.google.maps.marker || !window.google.maps.marker.AdvancedMarkerElement) {
          console.error("Google Maps API loaded, but AdvancedMarkerElement (or other core components) not found. Ensure 'marker' library is included.");
          setMapsLoadError(new Error("Google Maps API core components missing after load. Check 'marker' library."));
          setIsMapsLoaded(false); // Set to false if essential parts are missing
          return;
        }
        console.log("Google Maps API and required libraries (places, maps, marker) loaded successfully.");
        setIsMapsLoaded(true);
        setMapsLoadError(null);
      })
      .catch(e => {
        console.error("Failed to load Google Maps API. Error details:", e);
        setMapsLoadError(e as Error);
        setIsMapsLoaded(false);
      });
  }, []);


  useEffect(() => {
    if (showMap && isMapsLoaded && !mapsLoadError && mapContainerRef.current && window.google && window.google.maps && window.google.maps.marker) {
        const { AdvancedMarkerElement } = window.google.maps.marker;
        if (!AdvancedMarkerElement) {
            console.error("AdvancedMarkerElement not available. Marker library might not be loaded correctly.");
            return;
        }

      const defaultCenter = { lat: 37.5665, lng: 126.9780 }; // Seoul
      const currentCoords = watchedLocationCoordinates || defaultCenter;
      const zoomLevel = watchedLocationCoordinates ? 15 : 10;

      if (!mapInstanceRef.current) { // Create map instance if it doesn't exist or container is new
        mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
          center: currentCoords,
          zoom: zoomLevel,
          disableDefaultUI: true,
          zoomControl: true,
          mapId: 'NBBANG_MAP_ID', 
        });
      } else { // If map instance exists, just update center and zoom
        mapInstanceRef.current.setCenter(currentCoords);
        mapInstanceRef.current.setZoom(zoomLevel);
      }

      // Handle marker
      if (watchedLocationCoordinates) {
        if (!markerInstanceRef.current) {
          markerInstanceRef.current = new AdvancedMarkerElement({
            map: mapInstanceRef.current,
            position: watchedLocationCoordinates,
          });
        } else {
          markerInstanceRef.current.position = watchedLocationCoordinates;
          markerInstanceRef.current.map = mapInstanceRef.current; // Ensure marker is on the current map instance
        }
      } else { // No coordinates, remove marker
        if (markerInstanceRef.current) {
          markerInstanceRef.current.map = null;
        }
      }
    } else { // If not showing map or maps not loaded, ensure marker is off
        if (markerInstanceRef.current) {
            markerInstanceRef.current.map = null;
        }
    }
    
    // Cleanup: This effect's cleanup logic is tricky because the map instance is tied to mapContainerRef.current.
    // If mapContainerRef.current itself is unmounted (e.g. by parent conditional rendering), 
    // the map instance is implicitly destroyed.
    // We primarily need to clean up the marker if the coordinates change or map is hidden.
    // A full component unmount cleanup is handled by React for the refs.
    return () => {
        // When dependencies change and effect re-runs, or component unmounts.
        // If we are just hiding the map via CSS, the map instance might persist.
        // If the mapContainerRef is unmounted when showMap is false, this cleanup for the marker is good.
        if (markerInstanceRef.current) {
            markerInstanceRef.current.map = null;
        }
    };
  }, [isMapsLoaded, mapsLoadError, watchedLocationCoordinates, showMap]);


  useEffect(() => {
    if (watchLocationName === '' && form.getValues('locationCoordinates')) {
      form.setValue('locationCoordinates', undefined, { shouldValidate: true });
      // setShowMap(false); // No longer automatically hide map, user controls with button
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
        name: data.name,
        dateTime: data.dateTime,
        endTime: data.endTime,
        locationName: data.locationName,
        locationCoordinates: data.locationCoordinates || undefined,
        participantIds: data.participantIds,
        creatorId: currentUserId,
        useReserveFund: data.useReserveFund,
        partialReserveFundAmount: data.useReserveFund && data.partialReserveFundAmount !== undefined
                                    ? Number(data.partialReserveFundAmount)
                                    : undefined,
        nonReserveFundParticipants: data.nonReserveFundParticipants || [],
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
        const result = await createMeetingAction(payload);
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

  const handleLocationSelected = (coords: { lat: number; lng: number } | undefined, name: string) => {
    if (!coords && !name) { // If both coords and name are cleared
        setShowMap(false);
    }
    // If coords are selected, or name is present, user can decide to show map.
    // If only name is present (no coords), map can't be shown based on coords.
  };
  
  const handleToggleMap = () => {
    if (watchedLocationCoordinates) {
        setShowMap(prev => !prev);
    } else {
        toast({title: "알림", description: "지도를 표시할 장소 좌표가 없습니다. 장소를 먼저 선택해주세요.", variant: "default"});
        setShowMap(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="name" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>모임 이름 <span className="text-destructive">*</span></Label>
        <Input id="name" {...form.register('name')} disabled={isPending || (isEditMode && initialData?.isSettled)} />
        {form.formState.errors.name && <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>}
      </div>

      <div>
        <Label htmlFor="dateTime" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>시작 날짜 및 시간 <span className="text-destructive">*</span></Label>
        <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !form.watch('dateTime') && 'text-muted-foreground',
                (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed"
              )}
              disabled={isPending || (isEditMode && initialData?.isSettled)}
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
              disabled={isPending || (isEditMode && initialData?.isSettled)}
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
                disabled={isPending || (isEditMode && initialData?.isSettled)}
              />
              <Button size="sm" onClick={() => setStartDateOpen(false)} className="w-full" type="button" disabled={(isEditMode && initialData?.isSettled)}>확인</Button>
            </div>
          </PopoverContent>
        </Popover>
        {form.formState.errors.dateTime && <p className="text-sm text-destructive mt-1">{form.formState.errors.dateTime.message}</p>}
      </div>

      <div>
        <Label htmlFor="endTime" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>종료 날짜 및 시간 (선택)</Label>
        <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !form.watch('endTime') && 'text-muted-foreground',
                (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed"
              )}
              disabled={isPending || (isEditMode && initialData?.isSettled)}
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
              disabled={isPending || (isEditMode && initialData?.isSettled)}
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
                disabled={isPending || (isEditMode && initialData?.isSettled)}
              />
              <Button size="sm" onClick={() => setEndDateOpen(false)} className="w-full" type="button" disabled={(isEditMode && initialData?.isSettled)}>확인</Button>
            </div>
          </PopoverContent>
        </Popover>
        {form.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{form.formState.errors.endTime.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="locationNameInput" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>장소 <span className="text-destructive">*</span></Label>
        {(!isMapsLoaded || mapsLoadError) && (
          <div className="relative flex items-center">
              <MapPinIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                  id="locationNameFallbackInput"
                  value={form.watch('locationName')}
                  onChange={(e) => form.setValue('locationName', e.target.value, {shouldValidate: true})}
                  disabled={isPending || (isEditMode && initialData?.isSettled)}
                  className={cn("pl-8", (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed")}
                  placeholder={
                      !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? "Google Maps API 키가 설정되지 않았습니다." :
                      !isMapsLoaded && !mapsLoadError ? "지도 API 로딩 중..." :
                      mapsLoadError ? `지도 API 로드 실패: ${mapsLoadError.message.substring(0,50)}...` : "장소 검색..."
                  }
              />
          </div>
        )}
        {isMapsLoaded && !mapsLoadError && (
          <LocationSearchInput
            form={form}
            isPending={isPending || (isEditMode && initialData?.isSettled)}
            initialLocationName={initialData?.locationName}
            onLocationSelected={handleLocationSelected}
          />
        )}
        {mapsLoadError && !isMapsLoaded && <p className="text-sm text-destructive mt-1">지도 API 로드에 실패했습니다. API 키와 설정을 확인해주세요.</p>}
        {form.formState.errors.locationName && <p className="text-sm text-destructive mt-1">{form.formState.errors.locationName.message}</p>}
        
        <div className="flex flex-wrap gap-2 mt-2">
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
            {watchedLocationCoordinates && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                    const url = `https://www.google.com/maps/search/?api=1&query=${watchedLocationCoordinates.lat},${watchedLocationCoordinates.lng}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                    className="sm:w-auto"
                    disabled={isPending || (isEditMode && initialData?.isSettled)}
                >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    외부 지도에서 보기
                </Button>
            )}
        </div>
      </div>

      <div 
        className={cn(
            "mt-1",
            (showMap && isMapsLoaded && !mapsLoadError && watchedLocationCoordinates) ? 'block' : 'hidden'
        )}
      >
        <div ref={mapContainerRef} className="h-64 w-full rounded-md border">
            {(!watchedLocationCoordinates && !isPending) && <p className="flex items-center justify-center h-full text-muted-foreground">장소를 선택하면 여기에 지도가 표시됩니다.</p>}
            {(isMapsLoaded && !watchedLocationCoordinates && showMap) && <p className="flex items-center justify-center h-full text-muted-foreground">표시할 좌표가 없습니다. 장소를 선택해주세요.</p>}
            {isPending && <p className="flex items-center justify-center h-full text-muted-foreground">로딩 중...</p>}
            {!isMapsLoaded && showMap && <p className="flex items-center justify-center h-full text-muted-foreground">지도 API 로딩 중...</p>}
            {mapsLoadError && showMap && <p className="flex items-center justify-center h-full text-muted-foreground">지도 API 로드 실패.</p>}
        </div>
      </div>
      
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
                    className={cn("mt-1", (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed")}
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
                              disabled={isPending || (isEditMode && initialData?.isSettled)}
                            />
                           )}
                        />
                        <Label
                          htmlFor={`nonReserveFund-${participant.id}`}
                          className={cn(
                            "font-normal", // Make checkbox labels normal weight
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
        <Label className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>참여자 <span className="text-destructive">*</span></Label>
         <Popover open={participantSearchOpen} onOpenChange={setParticipantSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={participantSearchOpen}
              className={cn("w-full justify-between", (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed")}
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

                        // Ensure current user (creator) cannot be deselected if they are the only one, or becomes the only one
                        if (newParticipantIds.length === 0) {
                           newParticipantIds = [currentUserId]; // Always keep at least the creator if all are deselected
                        } else if (friend.id === currentUserId && !newParticipantIds.includes(currentUserId) && currentParticipantIds.length === newParticipantIds.length) {
                            // This case means current user was unchecked, making the list empty if they were the only one.
                            // This is handled by newParticipantIds.length === 0 check above.
                            // If others exist, allow unchecking self, unless it makes it empty.
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
