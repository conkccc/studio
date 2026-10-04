'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { meetingDraftSchema, type MeetingFormData } from './meeting-form-schema';

export interface MeetingDraft {
  values: Partial<MeetingFormData>;
  groupId: string | null;
  savedAt: string;
}

// Drafts stay in the current browser session and are scoped to the signed-in user.
export function useMeetingDraft(form: UseFormReturn<MeetingFormData>, userId: string, enabled: boolean, groupId?: string | null) {
  const key = `meeting:new:${userId}`;
  const [draft, setDraft] = useState<MeetingDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const activeKey = useRef(key);
  activeKey.current = key;
  const saveControl = useRef<{ pending: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const groupRef = useRef(groupId);
  groupRef.current = groupId;
  const completed = useRef(false);

  useEffect(() => {
    setDraft(null);
    setSaved(false);
    setLoadedKey(key);
    if (!enabled || !userId) return;
    completed.current = false;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const stored = JSON.parse(raw);
      const values = {
        ...stored.values,
        dateTime: stored.values?.dateTime ? new Date(stored.values.dateTime) : undefined,
        endTime: stored.values?.endTime ? new Date(stored.values.endTime) : undefined,
      };
      const parsed = meetingDraftSchema.safeParse(values);
      if (parsed.success) setDraft({ values: parsed.data, groupId: typeof stored.groupId === 'string' ? stored.groupId : null, savedAt: stored.savedAt });
    } catch { /* A damaged or unavailable draft must not prevent editing. */ }
  }, [key, enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const control: { pending: boolean; timer?: ReturnType<typeof setTimeout> } = { pending: false };
    saveControl.current = control;
    const save = () => {
      if (completed.current || !control.pending || activeKey.current !== key) return;
      control.pending = false;
      try {
        sessionStorage.setItem(key, JSON.stringify({ values: form.getValues(), groupId: groupRef.current || null, savedAt: new Date().toISOString() }));
        setSaved(true);
      } catch { /* Storage can be disabled or full. */ }
    };
    const subscription = form.watch((_values, info) => {
      if (!info.name || completed.current) return;
      control.pending = true;
      clearTimeout(control.timer);
      control.timer = setTimeout(save, 500);
    });
    return () => { clearTimeout(control.timer); save(); subscription.unsubscribe(); };
  }, [form, key, enabled, userId]);

  const discardDraft = () => {
    if (saveControl.current) {
      saveControl.current.pending = false;
      clearTimeout(saveControl.current.timer);
    }
    setDraft(null);
    setSaved(false);
    try { sessionStorage.removeItem(key); } catch { /* unavailable storage */ }
  };
  const completeDraft = () => { completed.current = true; discardDraft(); };
  return { draft: enabled && loadedKey === key ? draft : null, saved: enabled && loadedKey === key && saved, dismissDraft: () => setDraft(null), discardDraft, completeDraft };
}
