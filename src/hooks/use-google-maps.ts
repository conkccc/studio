'use client';

import { useEffect, useState } from 'react';

let mapsPromise: Promise<void> | null = null;

function loadMaps(): Promise<void> {
  if (mapsPromise) return mapsPromise;
  mapsPromise = (async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('장소 검색 설정이 없어 직접 장소를 입력해주세요.');
    const { Loader } = await import('@googlemaps/js-api-loader');
    await new Loader({ apiKey, version: 'weekly', libraries: ['places', 'maps', 'marker'] }).load();
  })().catch(error => { mapsPromise = null; throw error; });
  return mapsPromise;
}

// Import the SDK only when a user opens the map or requests place search.
export function useGoogleMaps(enabled: boolean) {
  const [isMapsLoaded, setLoaded] = useState(false);
  const [mapsLoadError, setError] = useState<Error | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError(null);
    void loadMaps().then(() => { if (active) setLoaded(true); }).catch(error => {
      if (active) { setLoaded(false); setError(error instanceof Error ? error : new Error('지도를 불러오지 못했습니다.')); }
    });
    return () => { active = false; };
  }, [enabled, retry]);
  return { isMapsLoaded, mapsLoadError, retryMaps: () => setRetry(value => value + 1) };
}
