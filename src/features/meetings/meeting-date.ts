// Server DTOs contain Dates. Keep legacy timestamp-shaped values readable
// without loading the Firestore browser SDK just to format a date.
export function meetingDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    try {
      const converted: unknown = value.toDate();
      if (converted instanceof Date) return converted;
    } catch { /* Invalid legacy dates fall through to an invalid Date. */ }
  }
  return new Date(Number.NaN);
}
