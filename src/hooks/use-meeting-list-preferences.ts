'use client';

import { useEffect, useRef, useState } from 'react';
import { defaultMeetingListSelection, meetingListSelectionFromQuery, readMeetingListSelection, restoreMeetingListQuery, saveMeetingListSelection } from '@/lib/meeting-list-preferences';

export function useMeetingListPreferences(userId: string | undefined, query: string, pathname: string, replace: (url: string, options: { scroll: boolean }) => void) {
  const [readyUser, setReadyUser] = useState<string | null>(() => {
    if (!userId || typeof window === 'undefined') return null;
    try {
      return restoreMeetingListQuery(query, readMeetingListSelection(window.localStorage, userId)) === query ? userId : null;
    } catch { return userId; }
  });
  const initializedUser = useRef<string | undefined>();
  const pendingRestore = useRef<{ from: string; to: string } | null>(null);
  const ready = !!userId && readyUser === userId;

  useEffect(() => {
    if (!userId) {
      initializedUser.current = undefined;
      pendingRestore.current = null;
      setReadyUser(null);
      return;
    }
    if (initializedUser.current !== userId) {
      initializedUser.current = userId;
      setReadyUser(null);
      let restored = query;
      try { restored = restoreMeetingListQuery(query, readMeetingListSelection(window.localStorage, userId)); } catch { /* Browser storage may be unavailable. */ }
      if (restored !== query) {
        pendingRestore.current = { from: query, to: restored };
        replace(`${pathname}?${restored}`, { scroll: false });
        return;
      }
      pendingRestore.current = null;
      setReadyUser(userId);
    } else if (pendingRestore.current && query !== pendingRestore.current.from) {
      // A newer explicit navigation may supersede the restored URL.
      pendingRestore.current = null;
      setReadyUser(userId);
    }
  }, [userId, query, pathname, replace]);

  useEffect(() => {
    if (!userId || !ready || pendingRestore.current) return;
    try { saveMeetingListSelection(window.localStorage, userId, meetingListSelectionFromQuery(query)); } catch { /* unavailable storage */ }
  }, [userId, ready, query]);

  const resetRememberedSelection = () => {
    if (!userId) return;
    try { saveMeetingListSelection(window.localStorage, userId, { ...defaultMeetingListSelection }); } catch { /* unavailable storage */ }
  };

  return { ready, resetRememberedSelection };
}
