/** Stable ID order is also the tie-breaker for distributing indivisible won. */
export const compareParticipantIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const uniqueParticipantIds = (ids: readonly string[]) => [...new Set(ids.filter(Boolean))].sort(compareParticipantIds);
export const amountForParticipant = (amounts: Record<string, number>, id: string): number => Object.prototype.hasOwnProperty.call(amounts, id) ? amounts[id] : 0;

export function normalizeWon(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), Number.MAX_SAFE_INTEGER) : 0;
}

/** Largest-remainder allocation. Integer weights use exact integer arithmetic. */
export function allocateWon(amount: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).sort(compareParticipantIds);
  const allocations: Record<string, number> = Object.create(null);
  for (const id of ids) allocations[id] = 0;
  const total = normalizeWon(amount);
  if (!ids.length || !total) return Object.fromEntries(Object.entries(allocations));

  const maxWeight = Math.max(...ids.map(id => Math.max(weights[id] || 0, 0)));
  // Old custom amounts may contain fractions. Keep up to six fractional digits,
  // within safe integer range, without changing the persisted expense.
  const scale = ids.every(id => Number.isSafeInteger(weights[id]))
    ? 1
    : Math.max(1, Math.min(1_000_000, Math.floor(Number.MAX_SAFE_INTEGER / Math.max(maxWeight, 1))));
  let units = ids.map(id => BigInt(Math.round(Math.max(Number.isFinite(weights[id]) ? weights[id] : 0, 0) * scale)));
  let totalWeight = units.reduce((sum, value) => sum + value, BigInt(0));
  if (totalWeight === BigInt(0)) {
    units = ids.map(() => BigInt(1));
    totalWeight = BigInt(ids.length);
  }
  const remainderRows = ids.map((id, index) => {
    const numerator = BigInt(total) * units[index];
    allocations[id] = Number(numerator / totalWeight);
    return { id, remainder: numerator % totalWeight };
  }).sort((a, b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : compareParticipantIds(a.id, b.id));

  const left = total - Object.values(allocations).reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < left; index++) allocations[remainderRows[index].id]++;
  // Ordinary objects can cross the React Server Component serialization boundary.
  return Object.fromEntries(Object.entries(allocations));
}

export function allocateEqually(amount: number, ids: readonly string[]): Record<string, number> {
  return allocateWon(amount, Object.fromEntries(uniqueParticipantIds(ids).map(id => [id, 1])));
}
