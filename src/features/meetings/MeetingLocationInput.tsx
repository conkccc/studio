'use client';
import { useEffect, useRef, useState } from 'react';
import type { useForm } from 'react-hook-form';
import { MapPinIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete';
import type { MeetingFormData } from './meeting-form-schema';

interface LocationSearchInputProps {
  form: ReturnType<typeof useForm<MeetingFormData>>;
  isPending: boolean;
  isMapsLoaded: boolean;
  mapsLoadError: Error | null;
  onLocationSelected: (coords: { lat: number; lng: number } | undefined, name: string) => void;
}

export function LocationSearchInput({ form, isPending, isMapsLoaded, mapsLoadError, onLocationSelected }: LocationSearchInputProps) {
  const {
    ready,
    value: placesValue,
    suggestions: { status: placesStatus, data: placesData },
    setValue: setPlacesValue,
    clearSuggestions: clearPlacesSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {},
    debounce: 300,
  });

  const { toast } = useToast();
  const [inputFocused, setInputFocused] = useState(false);
  const selectionSequence = useRef(0);

  useEffect(() => {
    const formLocationName = form.getValues('locationName');
    if (formLocationName !== placesValue && !inputFocused) {
      setPlacesValue(formLocationName || '', false);
    }
  }, [form, placesValue, setPlacesValue, inputFocused]);

  const handlePlaceSelect = async (suggestion: google.maps.places.AutocompletePrediction) => {
    const sequence = ++selectionSequence.current;
    setPlacesValue(suggestion.description, false);
    clearPlacesSuggestions();
    form.setValue('locationName', suggestion.description, { shouldValidate: true });
    form.setValue('locationCoordinates', undefined, { shouldDirty: true });

    try {
      const results = await getGeocode({ address: suggestion.description });
      const { lat, lng } = await getLatLng(results[0]);
      if (selectionSequence.current !== sequence) return;
      form.setValue('locationCoordinates', { lat, lng }, { shouldValidate: true });
      onLocationSelected({lat, lng}, suggestion.description);
      toast({ title: "장소 선택됨", description: `${suggestion.description}` });
    } catch (error) {
      if (selectionSequence.current !== sequence) return;
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
            selectionSequence.current += 1;
            setPlacesValue(e.target.value);
            form.setValue('locationName', e.target.value, { shouldDirty: true, shouldValidate: true });
            form.setValue('locationCoordinates', undefined, { shouldDirty: true });
             if (!e.target.value) {
                form.setValue('locationCoordinates', undefined, { shouldValidate: true });
                onLocationSelected(undefined, '');
            }
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => {
            setInputFocused(false);
          }}
          disabled={!ready || isPending}
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
                className="hover:bg-accent"
              >
                <button type="button" onClick={() => void handlePlaceSelect(suggestion)} className="w-full p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><strong>{main_text}</strong> <small>{secondary_text}</small></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
