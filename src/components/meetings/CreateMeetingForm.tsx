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
import { CalendarIcon, Check, ChevronsUpDown, Loader2, MapPinIcon, Eye, ExternalLink, Search } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Friend, Meeting, FriendGroup } from '@/lib/types';
import { createMeetingAction, updateMeetingAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from '@/components/ui/switch';
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // Added for temporary fee type
import { Loader } from '@googlemaps/js-api-loader';
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete';

const meetingSchemaBase = z.object({
  name: z.string().min(1, '모임 이름을 입력해주세요.').max(100, '모임 이름은 100자 이내여야 합니다.'),
  dateTime: z.date({ required_error: '시작 날짜와 시간을 선택해주세요.' }),
  endTime: z.date().optional(),
  locationName: z.string().max(100, '장소 이름은 100자 이내여야 합니다.').optional(), // min(1) 제거, optional 추가
  locationCoordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  participantIds: z.array(z.string()).optional(), // Made optional, will be validated by refine
  useReserveFund: z.boolean().optional(), // Made optional
  isTemporary: z.boolean().optional(),
  temporaryParticipants: z.array(z.object({ name: z.string().min(1, '임시 참여자 이름은 비워둘 수 없습니다.') })).optional(),
  totalFee: z.number().min(0, '총 회비는 0 이상이어야 합니다.').optional(),
  feePerPerson: z.number().min(0, '1인당 회비는 0 이상이어야 합니다.').optional(),
  partialReserveFundAmount: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(String(val).replace(/,/g, ''))),
    z.number().min(0, '금액은 0 이상이어야 합니다.').optional()
  ),
  nonReserveFundParticipants: z.array(z.string()).optional(), // Made optional
  memo: z.string().max(2000, '메모는 2000자 이내여야 합니다.').optional(),
});

// const meetingSchema = meetingSchemaBase.refine(data => {
//   if (data.useReserveFund && (data.partialReserveFundAmount === undefined || data.partialReserveFundAmount <= 0)) {
//     return false;
//   }
//   return true;
// }, {
//   message: '회비 사용 시, 사용할 회비 금액을 0보다 크게 입력해야 합니다.',
//   path: ['partialReserveFundAmount'],
// }).refine(data => {
//   if (data.endTime && data.dateTime && data.dateTime >= data.endTime) {
//     return false;
//   }
//   return true;
// }, {
//   message: '종료 시간은 시작 시간보다 이후여야 합니다.',
//   path: ['endTime'],
// });

const meetingSchema = meetingSchemaBase
  .refine(data => { // 기존 회비 사용 시 금액 검증
    if (!data.isTemporary && data.useReserveFund && (data.partialReserveFundAmount === undefined || data.partialReserveFundAmount <= 0)) {
      return false;
    }
    return true;
  }, {
    message: '회비 사용 시, 사용할 회비 금액을 0보다 크게 입력해야 합니다.',
    path: ['partialReserveFundAmount'],
  })
  .refine(data => { // 기존 종료 시간 검증
    if (data.endTime && data.dateTime && data.dateTime >= data.endTime) {
      return false;
    }
    return true;
  }, {
    message: '종료 시간은 시작 시간보다 이후여야 합니다.',
    path: ['endTime'],
  })
  .refine(data => { // 참여자 검증 (기존 모임)
    if (!data.isTemporary && (!data.participantIds || data.participantIds.length === 0)) {
      return false;
    }
    return true;
  }, {
    message: '기존 모임에는 참여자를 최소 1명 선택해주세요.',
    path: ['participantIds'],
  })
  .refine(data => { // 참여자 검증 (임시 모임)
    if (data.isTemporary && (!data.temporaryParticipants || data.temporaryParticipants.length === 0)) {
      return false;
    }
    return true;
  }, {
    message: '임시 모임에는 참여자를 최소 1명 추가해주세요.',
    path: ['temporaryParticipants'], // 실제 UI와 연결된 경로로 수정 필요할 수 있음
  })
  // Removed refine that made temporary fees mandatory. min(0) on fields themselves will validate if provided.
  .refine(data => { // 임시 모임 회비 유효성 검사 (값이 있다면 0 이상) - This is already covered by min(0) in schema base.
    if (data.isTemporary) { // This refine is now only for negative checks if min(0) was not present. Given min(0) exists, this refine is redundant or could be more specific.
      if (data.totalFee !== undefined && data.totalFee < 0) { // min(0) already covers this
        return false;
      }
      if (data.feePerPerson !== undefined && data.feePerPerson < 0) { // min(0) already covers this
        return false;
      }
    }
    return true;
  }, {
    // message: '회비는 0 이상의 값이어야 합니다.', // This message might be too generic if it flags.
    // Specific field errors from Zod schema base for min(0) are likely better.
    // For now, let's ensure no conflicting message if values are positive or undefined.
    // Path can be tricky; if we keep this refine, it should point to a relevant path or be a form-level error.
    // However, since min(0) is on the fields, this refine might be entirely removable.
    // Let's simplify and rely on the field-level min(0).
    // If specific cross-field validation for temp fees is needed later (e.g. if totalFee and feePerPerson are mutually exclusive), a refine would be appropriate.
    // For now, removing the mandatory check is the main goal. The negative check is already there.
    // To be safe and ensure no new error messages appear unexpectedly from this refine,
    // let's just remove the previous mandatory check and ensure this one doesn't cause issues.
    // The most straightforward way is to remove the previous mandatory refine block entirely.
    // The min(0) on totalFee and feePerPerson in meetingSchemaBase handles the "0 이상" part.
    // So, the entire block for "회비 검증 (임시 모임)" can be removed.
    // Let's re-evaluate: The original task was to make it optional. min(0).optional() in base does this.
    // The refine was for "one of them must be present". That's what needs to go.
    // The negative check part of that refine is redundant with min(0).
    // So, just removing that specific refine block that checks `data.totalFee === undefined && data.feePerPerson === undefined` is the primary goal.
    // The other part of that refine `if (data.isTemporary && data.totalFee !== undefined && data.totalFee < 0) return false;` is covered by `totalFee: z.number().min(0)...`
    // Thus, the entire refine block for temporary fee validation can be removed.
    // This means the last .refine in the provided code will be deleted.
  });

type MeetingFormData = z.infer<typeof meetingSchema>;

interface MeetingFormProps {
  friends: Friend[];
  isLoadingFriends?: boolean; // Added this prop
  currentUserId: string;
  isEditMode?: boolean;
  initialData?: Meeting;
  groupId?: string; // This is the groupId the meeting will be associated with
  onTemporaryChange?: (isTemporary: boolean) => void;
  groups?: FriendGroup[]; // List of groups for the "Assign to Group" dropdown
  selectedGroupId?: string | null; // Currently selected group ID for the meeting
  onGroupChange?: (id: string | null) => void; // Callback when group selection changes
}

const googleMapsLibraries: ("places" | "maps" | "marker")[] = ["places", "maps", "marker"];

interface LocationSearchInputProps {
  form: ReturnType<typeof useForm<MeetingFormData>>;
  isPending: boolean;
  isMapsLoaded: boolean;
  mapsLoadError: Error | null;
  onLocationSelected: (coords: { lat: number; lng: number } | undefined, name: string) => void;
}

function LocationSearchInput({ form, isPending, isMapsLoaded, mapsLoadError, onLocationSelected }: LocationSearchInputProps) {
  const {
    ready,
    value: placesValue,
    suggestions: { status: placesStatus, data: placesData },
    setValue: setPlacesValue,
    clearSuggestions: clearPlacesSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: { /* Optional: configure to your liking */ },
    debounce: 300,
    // disabled: !isMapsLoaded || !!mapsLoadError, // This was the problematic line causing build errors, now removed
  });

  const { toast } = useToast();
  const [inputFocused, setInputFocused] = useState(false);
  
  useEffect(() => {
    const formLocationName = form.getValues('locationName');
    if (formLocationName !== placesValue && !inputFocused) {
      setPlacesValue(formLocationName || '', false); // Set 'false' to not trigger suggestions
    }
  }, [form, placesValue, setPlacesValue, inputFocused]);


  useEffect(() => {
    if (ready) {
      console.log("Places Autocomplete ready state: true");
    } else {
      console.log("Places Autocomplete ready state: false (isMapsLoaded:", isMapsLoaded, ", mapsLoadError:", mapsLoadError,")");
    }
  }, [ready, isMapsLoaded, mapsLoadError]);


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
          id="locationNameInput" // Changed ID for clarity
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
          onBlur={() => {
            setInputFocused(false);
            // If there are suggestions and user clicks away, clear them
            // setTimeout(() => clearPlacesSuggestions(), 100); // Small delay to allow click on suggestion
          }}
          disabled={!ready || isPending} // Simplified disabled state, relies on `ready` from usePlacesAutocomplete
          className="pl-8"
          placeholder={!isMapsLoaded ? "지도 API 로딩 중..." : mapsLoadError ? `지도 API 로드 실패: ${mapsLoadError.message.substring(0,30)}...` : "장소 검색..."}
          autoComplete="off"
        />
      </div>
      {form.formState.errors.locationName && <p className="text-sm text-destructive mt-1">{form.formState.errors.locationName.message}</p>}
      {form.formState.errors.locationCoordinates && <p className="text-sm text-destructive mt-1">{form.formState.errors.locationCoordinates.message}</p>}

      {ready && isMapsLoaded && !mapsLoadError && placesStatus === 'OK' && placesData.length > 0 && (
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


export function CreateMeetingForm({
  friends,
  isLoadingFriends, // Destructure new prop
  currentUserId,
  isEditMode = false,
  initialData,
  // groupId prop seems redundant if selectedGroupId from parent is used for meeting's group
  // Let's assume selectedGroupId (passed as prop) is the definitive group for the meeting
  onTemporaryChange,
  groups = [],
  selectedGroupId: currentMeetingGroupId, // Renaming for clarity within form, this is the group for the meeting
  onGroupChange, // This is the callback to parent when form's group dropdown changes
}: MeetingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [participantSearchOpen, setParticipantSearchOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Removed local isTemporaryMeeting state, will use form.watch('isTemporary') directly
  const [temporaryParticipants, setTemporaryParticipants] = useState<{ name: string }[]>([]);
  const [currentTempParticipantName, setCurrentTempParticipantName] = useState('');
  const [tempMeetingFeeType, setTempMeetingFeeType] = useState<'total' | 'perPerson'>('total');
  const [tempMeetingTotalFee, setTempMeetingTotalFee] = useState<number | undefined>(undefined);
  const [tempMeetingFeePerPerson, setTempMeetingFeePerPerson] = useState<number | undefined>(undefined);

  const [isMapsLoaded, setIsMapsLoaded] = useState(false);
  const [mapsLoadError, setMapsLoadError] = useState<Error | null>(null);
  const [showMap, setShowMap] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerInstanceRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);


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
      partialReserveFundAmount: initialData.partialReserveFundAmount === undefined ? undefined : Number(initialData.partialReserveFundAmount),
      nonReserveFundParticipants: initialData.nonReserveFundParticipants || [],
      memo: initialData.memo || '',
      isTemporary: initialData.isTemporary || false,
      temporaryParticipants: initialData.temporaryParticipants || [],
      totalFee: initialData.totalFee,
      feePerPerson: initialData.feePerPerson,
    } : {
      name: '',
      dateTime: new Date(), // Default to now for new meetings
      endTime: undefined,
      locationName: '',
      locationCoordinates: undefined,
      participantIds: friends.map(f => f.id), // 모든 친구가 기본 선택
      useReserveFund: false,
      partialReserveFundAmount: undefined,
      nonReserveFundParticipants: [],
      memo: '',
      isTemporary: false,
      temporaryParticipants: [],
      totalFee: undefined,
      feePerPerson: undefined,
    },
  });

  const watchUseReserveFund = form.watch('useReserveFund');
  const watchParticipantIds = form.watch('participantIds');
  const watchedLocationCoordinates = form.watch('locationCoordinates');
  const watchLocationName = form.watch('locationName');
  const watchedIsTemporary = form.watch('isTemporary');

  useEffect(() => {
    // This effect calls the onTemporaryChange prop when the form's isTemporary value changes.
    // It's important that onTemporaryChange itself doesn't cause a re-render that changes watchedIsTemporary again.
    // (Assuming onTemporaryChange is a stable function or handled correctly by parent)
    if (onTemporaryChange) {
      onTemporaryChange(watchedIsTemporary || false);
    }
  }, [watchedIsTemporary, onTemporaryChange]);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      const errorMsg = "Google Maps API key is not configured. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.";
      console.error(errorMsg);
      setMapsLoadError(new Error(errorMsg));
      setIsMapsLoaded(false); // Explicitly set to false
      return;
    }

    const loader = new Loader({
      apiKey: apiKey,
      version: "weekly",
      libraries: googleMapsLibraries,
    });

    console.log("Attempting to load Google Maps API...");
    loader.load()
      .then(() => {
        if (!window.google || !window.google.maps || !window.google.maps.places || !window.google.maps.marker || !window.google.maps.marker.AdvancedMarkerElement) {
          const errorMsg = "Google Maps API or required libraries (places, maps, marker) not found after load. Check API key restrictions or enabled APIs in GCP console.";
          console.error(errorMsg);
          setMapsLoadError(new Error(errorMsg));
          setIsMapsLoaded(false);
          return;
        }
        console.log("Google Maps API and required libraries loaded successfully.");
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
    if (showMap && isMapsLoaded && !mapsLoadError && mapContainerRef.current && window.google?.maps?.Map && window.google?.maps?.marker?.AdvancedMarkerElement) {
        const { AdvancedMarkerElement } = window.google.maps.marker;
        
        const defaultCenter = { lat: 37.5665, lng: 126.9780 }; // Seoul
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
                markerInstanceRef.current.map = mapInstanceRef.current; // Ensure marker is on the map
            }
        } else {
            if (markerInstanceRef.current) {
                markerInstanceRef.current.map = null; // Hide marker if no coords
            }
        }
    } else if (!showMap && markerInstanceRef.current) {
        markerInstanceRef.current.map = null; 
    }

    return () => {
      if (markerInstanceRef.current) {
        markerInstanceRef.current.map = null;
        // markerInstanceRef.current = null; // Avoid nullifying ref directly here, let React manage it
      }
      // if (mapInstanceRef.current) { // Map instance cleanup is more complex if needed
      //   mapInstanceRef.current = null;
      // }
      // console.log("Map effect cleanup run");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [isMapsLoaded, mapsLoadError, watchedLocationCoordinates, watchLocationName, showMap]); // Removed mapInstanceRef, markerInstanceRef from deps


  useEffect(() => {
    if (watchLocationName === '' && form.getValues('locationCoordinates')) {
      form.setValue('locationCoordinates', undefined, { shouldValidate: true });
      if(showMap) setShowMap(false); // Hide map if location name is cleared
    }
  }, [watchLocationName, form, showMap]);


  useEffect(() => {
    if (!watchedIsTemporary && watchParticipantIds) { // Corrected: isTemporaryMeeting to watchedIsTemporary
      const currentNonParticipants = form.getValues('nonReserveFundParticipants') || [];
      const newNonParticipants = currentNonParticipants.filter(id => watchParticipantIds.includes(id));
      if (JSON.stringify(newNonParticipants.sort()) !== JSON.stringify(currentNonParticipants.sort())) {
         form.setValue('nonReserveFundParticipants', newNonParticipants, { shouldValidate: true });
      }
    }
  }, [watchParticipantIds, form, watchedIsTemporary]); // Use watchedIsTemporary

  useEffect(() => {
    if (!watchedIsTemporary && !watchUseReserveFund) { // Use watchedIsTemporary
      form.setValue('partialReserveFundAmount', undefined, { shouldValidate: true });
      form.setValue('nonReserveFundParticipants', [], { shouldValidate: true });
    }
  }, [watchUseReserveFund, form, watchedIsTemporary]); // Use watchedIsTemporary and form.setValue (stable)

  // This useEffect handles changes based on watchedIsTemporary
  useEffect(() => {
    // form.setValue('isTemporary', watchedIsTemporary); // This line is redundant as watchedIsTemporary IS form.isTemporary
    if (watchedIsTemporary) {
      // 임시 모임일 경우 기존 참여자/회비 관련 필드 초기화 또는 비활성화
      form.setValue('participantIds', [], { shouldValidate: true, shouldDirty: true });
      form.setValue('useReserveFund', false, { shouldValidate: true, shouldDirty: true });
      form.setValue('partialReserveFundAmount', undefined, { shouldValidate: true, shouldDirty: true });
      form.setValue('nonReserveFundParticipants', [], { shouldValidate: true, shouldDirty: true });
      // Also reset temporary specific local states if needed, or ensure they are only used when watchedIsTemporary is true
      setTemporaryParticipants(initialData?.isTemporary && initialData.temporaryParticipants ? initialData.temporaryParticipants : []);
      setTempMeetingFeeType(initialData?.isTemporary && initialData.totalFee !== undefined ? 'total' : (initialData?.isTemporary && initialData.feePerPerson !== undefined ? 'perPerson' : 'total'));
      setTempMeetingTotalFee(initialData?.isTemporary ? initialData.totalFee : undefined);
      setTempMeetingFeePerPerson(initialData?.isTemporary ? initialData.feePerPerson : undefined);

    } else {
      // 기존 모임으로 전환 시 임시 관련 필드 초기화
      form.setValue('temporaryParticipants', undefined, { shouldValidate: true, shouldDirty: true });
      form.setValue('totalFee', undefined, { shouldValidate: true, shouldDirty: true });
      form.setValue('feePerPerson', undefined, { shouldValidate: true, shouldDirty: true });

      // 기존 모임의 기본값으로 participantIds 재설정 (모든 친구 선택 또는 initialData 기반)
      // This part might need careful review if `friends` prop changes or if default selection logic is complex
      if (!isEditMode || !initialData?.participantIds) {
         // Only set default participants if not in edit mode or if initialData doesn't specify them
        form.setValue('participantIds', friends.map(f => f.id), { shouldValidate: true, shouldDirty: true });
      } else if (initialData?.participantIds) {
        form.setValue('participantIds', initialData.participantIds, { shouldValidate: true, shouldDirty: true });
      }
    }
  }, [watchedIsTemporary, isEditMode, initialData, friends, form.setValue]); // form.setValue is stable

  useEffect(() => {
    if (watchedIsTemporary) { // Use watchedIsTemporary
      form.setValue('temporaryParticipants', temporaryParticipants, { shouldValidate: true });
    }
  }, [temporaryParticipants, watchedIsTemporary, form.setValue]); // Use watchedIsTemporary

  useEffect(() => {
    if (watchedIsTemporary) { // Use watchedIsTemporary
      if (tempMeetingFeeType === 'total') {
        form.setValue('totalFee', tempMeetingTotalFee, { shouldValidate: true });
        form.setValue('feePerPerson', undefined, { shouldValidate: true });
      } else {
        form.setValue('feePerPerson', tempMeetingFeePerPerson, { shouldValidate: true });
        form.setValue('totalFee', undefined, { shouldValidate: true });
      }
    } else {
      // These are also reset in the main watchedIsTemporary effect, but good to be sure
      form.setValue('totalFee', undefined, { shouldValidate: true });
      form.setValue('feePerPerson', undefined, { shouldValidate: true });
    }
  }, [tempMeetingFeeType, tempMeetingTotalFee, tempMeetingFeePerPerson, watchedIsTemporary, form.setValue]); // Use watchedIsTemporary

  // This effect is for initializing form when in edit mode or when initialData changes.
  // It also sets the initial local state for isTemporaryMeeting.
  useEffect(() => {
    if (isEditMode && initialData) {
      // Set the form's isTemporary field first
      form.setValue('isTemporary', initialData.isTemporary || false, {shouldDirty: true});
      // The local state for temporaryParticipants, tempMeetingFeeType etc.
      // will be set based on initialData when watchedIsTemporary changes (handled by other useEffect)
      // This helps avoid direct setIsTemporaryMeeting here.
      if (initialData.isTemporary) {
        setTemporaryParticipants(initialData.temporaryParticipants || []);
        if (initialData.totalFee !== undefined) {
          setTempMeetingFeeType('total');
            setTempMeetingTotalFee(initialData.totalFee || undefined); // Ensure undefined if null/0 from data
          setTempMeetingFeePerPerson(undefined);
        } else if (initialData.feePerPerson !== undefined) {
          setTempMeetingFeeType('perPerson');
            setTempMeetingFeePerPerson(initialData.feePerPerson || undefined);
          setTempMeetingTotalFee(undefined);
          } else { // Default if isTemporary but no fee info
            setTempMeetingFeeType('total');
            setTempMeetingTotalFee(undefined);
            setTempMeetingFeePerPerson(undefined);
        }
      }
        // Other fields are reset by the useEffect watching `watchedIsTemporary`
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditMode, initialData, form.setValue]); // Only include form.setValue as it's stable

  const formatNumberInput = (value: number | string | undefined) => {
    if (value === undefined || value === '' || value === null) return '';
    const num = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(num) ? '' : num.toLocaleString();
  };

  // --- 회비 금액 입력: 입력 중에는 raw value, onBlur에서만 콤마 포맷 적용 ---
  const [reserveFundInput, setReserveFundInput] = useState<string>(
    initialData && initialData.partialReserveFundAmount !== undefined && initialData.partialReserveFundAmount !== null
      ? Number(initialData.partialReserveFundAmount).toLocaleString()
      : ''
  );

  useEffect(() => {
    // form의 값이 바뀌면 reserveFundInput도 동기화 (예: 참여자 변경 등)
    const formValue = form.watch('partialReserveFundAmount');
    if (formValue === undefined || formValue === null || isNaN(formValue)) {
      setReserveFundInput('');
    } else {
      setReserveFundInput(Number(formValue).toLocaleString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch('partialReserveFundAmount')]);

  const onSubmit = (data: MeetingFormData) => {
    startTransition(async () => {
      let payload: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>;

      if (data.isTemporary) {
        payload = {
          name: data.name,
          dateTime: data.dateTime,
          endTime: data.endTime,
          locationName: data.locationName || '', // Ensure string
          locationCoordinates: data.locationCoordinates || undefined,
          creatorId: currentUserId,
          groupId: currentMeetingGroupId || (initialData?.groupId ?? ''), // Use currentMeetingGroupId
          memo: data.memo || undefined,
          isTemporary: true,
          temporaryParticipants: data.temporaryParticipants || [],
          totalFee: data.totalFee,
          feePerPerson: data.feePerPerson,
          // 기존 모임 필드는 초기화/제외
          participantIds: [],
          useReserveFund: false,
          partialReserveFundAmount: undefined,
          nonReserveFundParticipants: [],
        };
      } else {
        payload = {
          name: data.name,
          dateTime: data.dateTime,
          endTime: data.endTime,
          locationName: data.locationName || '', // Ensure string
          locationCoordinates: data.locationCoordinates || undefined,
          participantIds: data.participantIds || [],
          creatorId: currentUserId,
          useReserveFund: data.useReserveFund || false,
          partialReserveFundAmount:
            data.useReserveFund && typeof data.partialReserveFundAmount === 'number' && !isNaN(data.partialReserveFundAmount)
              ? data.partialReserveFundAmount
              : undefined,
          nonReserveFundParticipants: data.nonReserveFundParticipants || [],
          memo: data.memo || undefined,
          groupId: currentMeetingGroupId || (initialData?.groupId ?? ''), // Use currentMeetingGroupId
          isTemporary: false,
          // 임시 모임 필드는 초기화/제외
          temporaryParticipants: undefined,
          totalFee: undefined,
          feePerPerson: undefined,
        };
      }

      // Firestore에 저장 시 undefined가 아닌 null로 저장하고 싶다면 여기서 변환
      // 예: payload.endTime = payload.endTime || null;

      if (isEditMode && initialData) {
        const result = await updateMeetingAction(initialData.id, payload, currentUserId);
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
        // 로그인 체크: currentUserId 없으면 에러
        if (!currentUserId) {
          toast({ title: '로그인이 필요합니다.', description: '로그인 후 다시 시도해 주세요.', variant: 'destructive' });
          return;
        }
        const result = await createMeetingAction(payload, currentUserId);
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

  const handleLocationSelected = useCallback((coords: { lat: number; lng: number } | undefined, name: string) => {
    if (!coords && !name && showMap) { // If location is cleared
        setShowMap(false);
    }
    // If coords are selected, user can click "지도 보기" to show map.
    // No automatic showing of map on selection.
  }, [showMap]);

  const handleToggleMap = () => {
    if (watchedLocationCoordinates) {
        setShowMap(prev => !prev);
    } else {
        toast({title: "알림", description: "지도를 표시할 장소 좌표가 없습니다. 장소를 먼저 선택해주세요.", variant: "default"});
        setShowMap(false);
    }
  };

  const dateTimeValue = form.watch('dateTime');
  const endTimeValue = form.watch('endTime');


  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="name" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>모임 이름 <span className="text-destructive">*</span></Label>
        <Input id="name" {...form.register('name')} disabled={isPending || (isEditMode && initialData?.isSettled)} />
        {form.formState.errors.name && <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>}
      </div>

      {/* Temporary Meeting Switch moved here */}
      <div className="mb-4">
        <div className="flex items-center space-x-2 mt-2">
          <Switch
            id="temporaryMeetingSwitch"
            checked={watchedIsTemporary || false} // Controlled by form state
            onCheckedChange={(checked) => {
              if (isEditMode && initialData?.isSettled) return;
              form.setValue('isTemporary', checked, { shouldDirty: true, shouldTouch: true });
              // Local state setIsTemporaryMeeting is removed, effect on watchedIsTemporary will handle side effects.
            }}
            disabled={isPending || (isEditMode && initialData?.isSettled)}
          />
          <Label htmlFor="temporaryMeetingSwitch" className={cn("cursor-pointer", (isPending || (isEditMode && initialData?.isSettled)) && "text-muted-foreground cursor-not-allowed")}>임시 모임 만들기</Label>
        </div>
        {form.formState.errors.isTemporary && <p className="text-sm text-destructive mt-1">{form.formState.errors.isTemporary.message}</p>}
      </div>

      {/* 그룹 선택 드롭다운: 임시 모임이 아닐 때만 표시, 임시 모임 UI 바로 아래 */}
      {/* Ensure `groups` is not empty and `onGroupChange` (renamed from setSelectedGroupId in parent) is provided */}
      {!watchedIsTemporary && groups && groups.length > 0 && typeof onGroupChange === 'function' && (
        <div className="mt-2 mb-4">
          <label className="block mb-1 font-medium">친구 그룹 선택 <span className="text-destructive">*</span></label>
          <Popover open={groupPopoverOpen} onOpenChange={setGroupPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={groupPopoverOpen}
                className="w-full justify-between"
                onClick={() => setGroupPopoverOpen((prev) => !prev)}
              >
                {currentMeetingGroupId /* Use aliased prop */
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
                          if (onGroupChange) onGroupChange(group.id); // Use onGroupChange
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
        <Label htmlFor="dateTime" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>시작 날짜 및 시간 <span className="text-destructive">*</span></Label>
        <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !dateTimeValue && 'text-muted-foreground',
                (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed"
              )}
              disabled={isPending || (isEditMode && initialData?.isSettled)}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateTimeValue instanceof Date && !isNaN(dateTimeValue.getTime())
                ? format(dateTimeValue, 'PPP HH:mm', { locale: ko })
                : <span>날짜 및 시간 선택</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={dateTimeValue}
              onSelect={(date) => {
                if (date) {
                  const currentTime = dateTimeValue || new Date();
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
                defaultValue={dateTimeValue ? format(dateTimeValue, "HH:mm") : "12:00"}
                onChange={(e) => {
                  const newTime = e.target.value;
                  const currentDateTime = dateTimeValue || new Date(); // Fallback to new Date() if dateTime is undefined
                  const [hours, minutes] = newTime.split(':').map(Number);
                  const newDate = new Date(currentDateTime); // Create a new Date object to avoid mutating the original
                  newDate.setHours(hours, minutes, 0, 0);
                  form.setValue('dateTime', newDate, { shouldValidate: true });
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
                !endTimeValue && 'text-muted-foreground',
                (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed"
              )}
              disabled={isPending || (isEditMode && initialData?.isSettled)}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {
                (() => {
                  const val = endTimeValue; // Use the watched value directly
                  return val instanceof Date && !isNaN(val.getTime())
                    ? format(val, 'PPP HH:mm', { locale: ko })
                    : <span>날짜 및 시간 선택</span>;
                })()
              }
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={endTimeValue}
              onSelect={(date) => {
                if (date) {
                  const currentTime = endTimeValue || dateTimeValue || new Date();
                  const newDateTime = new Date(date);
                  newDateTime.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);
                  form.setValue('endTime', newDateTime, { shouldValidate: true });
                } else {
                  form.setValue('endTime', undefined, { shouldValidate: true });
                }
              }}
              initialFocus
              disabled={isPending || (isEditMode && initialData?.isSettled)}
              fromDate={dateTimeValue ? new Date(dateTimeValue) : undefined}
            />
            <div className="p-3 border-t border-border space-y-2">
              <Label htmlFor="endTimeInput">종료 시간</Label>
              <Input
                type="time"
                id="endTimeInput"
                defaultValue={endTimeValue ? format(endTimeValue, "HH:mm") : (dateTimeValue ? format(dateTimeValue, "HH:mm") : "12:00")}
                onChange={(e) => {
                  const newTime = e.target.value;
                  // Use endTimeValue if it exists, otherwise dateTimeValue, or fallback to new Date()
                  const baseDate = form.watch('endTime') || form.watch('dateTime') || new Date();
                  const [hours, minutes] = newTime.split(':').map(Number);
                  const newDate = new Date(baseDate); // Create new Date object
                  newDate.setHours(hours, minutes, 0, 0);
                  form.setValue('endTime', newDate, { shouldValidate: true });
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
        <Label htmlFor="locationNameInput" className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}>장소</Label> {/* Asterisk removed */}
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
                    id="locationNameFallbackInput" // Fallback ID
                    value={form.watch('locationName')}
                    onChange={(e) => form.setValue('locationName', e.target.value, {shouldValidate: true})}
                    disabled={isPending || (isEditMode && initialData?.isSettled)}
                    className={cn("pl-8", (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed")}
                    placeholder={mapsLoadError ? `지도 API 로드 실패: ${mapsLoadError.message.substring(0,30)}...` : "지도 API 로딩 중..."}
                />
            </div>
        )}
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
            {/* 외부 지도 보기 버튼 추가 */}
            {(form.getValues('locationName') || watchedLocationCoordinates) && ( // Show if either name or coords exist
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                    const placeName = form.getValues('locationName');
                    // Using a more robust URL construction that includes coordinates if available,
                    // falling back to name only. This can help disambiguate if name is common.
                    let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName || '')}`;
                    if (watchedLocationCoordinates) {
                        url = `https://www.google.com/maps/place/${encodeURIComponent(placeName || '')}/@${watchedLocationCoordinates.lat},${watchedLocationCoordinates.lng},15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!7e2!8m2!3d${watchedLocationCoordinates.lat}!4d${watchedLocationCoordinates.lng}`;
                        // A simpler alternative if place_id was available and stored:
                        // url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName || '')}&query_place_id=YOUR_PLACE_ID_HERE`;
                        // Sticking to a robust option that works with name and coords:
                        // If name is primary:
                        // url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName || '')}`;
                        // If coords should pinpoint:
                        // url = `https://www.google.com/maps?q=${watchedLocationCoordinates.lat},${watchedLocationCoordinates.lng}`;
                        // The example from MeetingDetailsClient was just name, let's try to be consistent but slightly more helpful if coords exist
                        if (placeName && watchedLocationCoordinates) {
                             url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}&ll=${watchedLocationCoordinates.lat},${watchedLocationCoordinates.lng}`;
                        } else if (placeName) {
                             url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}`;
                        } else if (watchedLocationCoordinates) { // Only coordinates available
                             url = `https://www.google.com/maps?q=${watchedLocationCoordinates.lat},${watchedLocationCoordinates.lng}`;
                        }
                    }
                    window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                    className="sm:w-auto"
                    disabled={isPending || (isEditMode && initialData?.isSettled) || (!form.getValues('locationName') && !watchedLocationCoordinates)}
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

      {!watchedIsTemporary && ( // Corrected: isTemporaryMeeting to watchedIsTemporary
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Controller
              control={form.control}
              name="useReserveFund"
              render={({ field }) => (
                <Switch
                  id="useReserveFund"
                  checked={field.value || false}
                  onCheckedChange={field.onChange}
                  disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary} // Corrected
                />
              )}
            />
            <Label
              htmlFor="useReserveFund"
              className={cn(
                "cursor-pointer",
                (isEditMode && initialData?.isSettled) && "text-muted-foreground cursor-not-allowed",
                watchedIsTemporary && "text-muted-foreground cursor-not-allowed"
              )}
            >
              모임 회비 사용 {(isEditMode && initialData?.isSettled) && "(정산 완료됨 - 수정 불가)"}
            </Label>
          </div>

          {watchUseReserveFund && !watchedIsTemporary && ( // Use watchedIsTemporary
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
                      value={reserveFundInput}
                      onChange={e => {
                        // 숫자만 허용, 앞자리 0 제거, 모두 지울 수 있음
                        let raw = e.target.value.replace(/[^0-9]/g, '');
                        if (raw.startsWith('0') && raw.length > 1) raw = raw.replace(/^0+/, '');
                        if (raw === '') {
                          setReserveFundInput('');
                          field.onChange(undefined);
                        } else {
                          const formatted = Number(raw).toLocaleString();
                          setReserveFundInput(formatted);
                          field.onChange(Number(raw));
                        }
                      }}
                      onBlur={e => {
                        // 포맷팅: 콤마 추가, 모두 지울 수 있음
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        if (raw === '') {
                          setReserveFundInput('');
                          field.onChange(undefined);
                        } else {
                          const formatted = Number(raw).toLocaleString();
                          setReserveFundInput(formatted);
                          field.onChange(Number(raw));
                        }
                      }}
                      disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary} // Corrected here
                      placeholder="0"
                      autoComplete="off"
                    />
                  )}
                />
                {form.formState.errors.partialReserveFundAmount && <p className="text-sm text-destructive mt-1">{form.formState.errors.partialReserveFundAmount.message}</p>}
              </div>

              <div>
                <Label className={cn("font-medium", (isEditMode && initialData?.isSettled) && "text-muted-foreground", watchedIsTemporary && "text-muted-foreground")}>회비 사용 제외 멤버</Label>
                <p className={cn("text-xs", (isEditMode && initialData?.isSettled) ? "text-muted-foreground/70" : "text-muted-foreground", watchedIsTemporary && "text-muted-foreground/70" )}>
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
                                disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary}
                              />
                            )}
                          />
                          <Label
                            htmlFor={`nonReserveFund-${participant.id}`}
                            className={cn(
                              "font-normal",
                              (isEditMode && initialData?.isSettled) && "text-muted-foreground cursor-not-allowed",
                              watchedIsTemporary && "text-muted-foreground cursor-not-allowed"
                            )}
                          >
                            {participant.name}
                            {participant.description && (
                              <span className="ml-1 text-xs text-muted-foreground">({participant.description})</span>
                            )}
                            {participant.id === currentUserId && " (나)"}
                          </Label>
                        </div>
                      ))
                  ) : (
                    <p className={cn("text-sm", (isEditMode && initialData?.isSettled) ? "text-muted-foreground/70" : "text-muted-foreground", watchedIsTemporary && "text-muted-foreground/70" )}>참여자를 먼저 선택해주세요.</p>
                  )}
                </div>
                {form.formState.errors.nonReserveFundParticipants && <p className="text-sm text-destructive mt-1">{form.formState.errors.nonReserveFundParticipants.message}</p>}
              </div>
            </div>
          )}
        </div>
      )}

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
                  onClick={() => {
                    if (currentTempParticipantName.trim() !== '') {
                      setTemporaryParticipants([...temporaryParticipants, { name: currentTempParticipantName.trim() }]);
                      setCurrentTempParticipantName('');
                    }
                  }}
                  disabled={isPending || (isEditMode && initialData?.isSettled)}
                >
                  추가
                </Button>
              </div>
              {form.formState.errors.temporaryParticipants && !temporaryParticipants.length && <p className="text-sm text-destructive mt-1">{form.formState.errors.temporaryParticipants.message}</p>}
              <ul className="mt-2 space-y-1">
                {temporaryParticipants.map((p, index) => (
                  <li key={index} className="text-sm flex justify-between items-center p-1 bg-secondary rounded-md">
                    {p.name}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTemporaryParticipants(temporaryParticipants.filter((_, i) => i !== index));
                      }}
                      disabled={isPending || (isEditMode && initialData?.isSettled)}
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
                 if (!(isEditMode && initialData?.isSettled)) setTempMeetingFeeType(value);
              }}
              className="flex space-x-4"
              // disabled prop for RadioGroup should be applied to items if needed or handled by parent disabled state
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
                  onChange={(e) => setTempMeetingTotalFee(e.target.value === '' ? undefined : Number(e.target.value))}
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
                  onChange={(e) => setTempMeetingFeePerPerson(e.target.value === '' ? undefined : Number(e.target.value))}
                  disabled={isPending || (isEditMode && initialData?.isSettled)}
                />
              </div>
            )}
            {form.formState.errors.totalFee && tempMeetingFeeType === 'total' && <p className="text-sm text-destructive mt-1">{form.formState.errors.totalFee.message}</p>}
            {form.formState.errors.feePerPerson && tempMeetingFeeType === 'perPerson' && <p className="text-sm text-destructive mt-1">{form.formState.errors.feePerPerson.message}</p>}
             {/* Combined error for either fee type not being set for temporary meeting */}
            {form.formState.errors.totalFee && form.formState.errors.totalFee.type === 'custom' && <p className="text-sm text-destructive mt-1">{form.formState.errors.totalFee.message}</p>}

          </div>
        </div>
      )}


      {!watchedIsTemporary && ( // Corrected: isTemporaryMeeting to watchedIsTemporary
        <div>
          <Label className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground", watchedIsTemporary && "text-muted-foreground")}>
            참여자 <span className="text-destructive">*</span>
          </Label>
          <Popover open={participantSearchOpen} onOpenChange={setParticipantSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={participantSearchOpen}
                className={cn(
                  "w-full justify-between",
                  (isEditMode && initialData?.isSettled) && "bg-muted/50 cursor-not-allowed",
                  watchedIsTemporary && "bg-muted/50 cursor-not-allowed opacity-50" // Use watchedIsTemporary
                )}
                disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary} // Use watchedIsTemporary
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
                      friends.map((friend) => (
                        <CommandItem
                          key={friend.id}
                          value={friend.name + (friend.description ? ` ${friend.description}` : "")}
                          onSelect={() => {
                            if (isEditMode && initialData?.isSettled || watchedIsTemporary) return;
                            const currentParticipantIds = form.getValues("participantIds") || [];
                            let newParticipantIds = [...currentParticipantIds];

                            if (newParticipantIds.includes(friend.id)) {
                              newParticipantIds = newParticipantIds.filter(id => id !== friend.id);
                            } else {
                              newParticipantIds.push(friend.id);
                            }
                            form.setValue("participantIds", newParticipantIds, { shouldValidate: true });

                            const currentNonParticipants = form.getValues('nonReserveFundParticipants') || [];
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
                              form.watch('participantIds')?.includes(friend.id) ? "opacity-100" : "opacity-0"
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
                      ))
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
          {isEditMode ? (initialData?.isSettled ? '정산 완료됨' : '모임 수정') : '모임 만들기'}
        </Button>
      </div>
    </form>
  );
}

