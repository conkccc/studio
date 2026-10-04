import type { Expense, Meeting } from './types';
import { allocateEqually, allocateWon, amountForParticipant, normalizeWon, uniqueParticipantIds } from './settlement-money';

type ReserveFundSettings = Pick<Meeting,
  'useReserveFund' | 'reserveFundCoverAll' | 'partialReserveFundAmount' | 'nonReserveFundParticipants' |
  'refundReserveFundToNonParticipants' | 'reserveFundRefundRecipientIds'>;

export interface ReserveFundBreakdown {
  individualExpenseContributions: Record<string, number>;
  fundApplicableIds: string[];
  fundNonApplicableIds: string[];
  applicableContributionTotal: number;
  /** Rounded averages are descriptive only; per-person maps are authoritative. */
  perApplicableExpenseShare: number;
  configuredFundAmount: number;
  baseFundUsed: number;
  perApplicableFundShare: number;
  fundContributionById: Record<string, number>;
  refundRecipientIds: string[];
  refundById: Record<string, number>;
  refundTotal: number;
  totalFundUsed: number;
  configuredFundLeft: number;
  perFundApplicableCost: number;
  perPersonCostWithFund: Record<string, number>;
}

export function calculateExpenseAllocation(expense: Expense, participantIds: string[]): Record<string, number> {
  const total = normalizeWon(expense.totalAmount);
  if (expense.splitType === 'custom' && expense.customSplits?.length) {
    const weights: Record<string, number> = Object.create(null);
    for (const split of expense.customSplits) {
      // Keep historical references even when the current friends list changes.
      weights[split.friendId] = (weights[split.friendId] || 0) + Math.max(split.amount || 0, 0);
    }
    return allocateWon(total, weights);
  }
  return allocateEqually(total, expense.splitAmongIds?.length ? expense.splitAmongIds : participantIds);
}

export function calculateIndividualExpenseContributions(expenses: Expense[], participantIds: string[]): Record<string, number> {
  const contributions: Record<string, number> = Object.create(null);
  for (const id of uniqueParticipantIds(participantIds)) contributions[id] = 0;
  for (const expense of expenses) {
    for (const [id, amount] of Object.entries(calculateExpenseAllocation(expense, participantIds))) {
      contributions[id] = (contributions[id] || 0) + amount;
    }
  }
  return Object.fromEntries(Object.entries(contributions));
}

export function calculateReserveFundBreakdown({ settings, expenses, participantIds }: {
  settings: ReserveFundSettings;
  expenses: Expense[];
  participantIds: string[];
}): ReserveFundBreakdown {
  const individualExpenseContributions = calculateIndividualExpenseContributions(expenses, participantIds);
  const ids = uniqueParticipantIds(participantIds);
  const fundNonApplicableIds = ids.filter(id => settings.nonReserveFundParticipants?.includes(id));
  const fundApplicableIds = ids.filter(id => !fundNonApplicableIds.includes(id));
  const applicableContributionTotal = fundApplicableIds.reduce((sum, id) => sum + (individualExpenseContributions[id] || 0), 0);
  const configuredFundAmount = settings.useReserveFund
    ? settings.reserveFundCoverAll ? applicableContributionTotal : normalizeWon(settings.partialReserveFundAmount || 0)
    : 0;
  const baseFundUsed = Math.min(configuredFundAmount, applicableContributionTotal);
  // Preserve each person's expense responsibility. The same percentage of each
  // eligible obligation is covered, so unequal custom splits never turn negative.
  const fundContributionById = allocateWon(baseFundUsed, Object.fromEntries(fundApplicableIds.map(id => [id, individualExpenseContributions[id] || 0])));
  const refundRecipientIds = settings.useReserveFund && settings.refundReserveFundToNonParticipants
    ? uniqueParticipantIds((settings.reserveFundRefundRecipientIds || []).filter(id => !ids.includes(id)))
    : [];
  // Existing product policy: the configured amount funds attendee expenses;
  // non-attendee refunds are additional fund deductions at the average benefit.
  const refundTotal = fundApplicableIds.length
    ? Number((BigInt(baseFundUsed) * BigInt(refundRecipientIds.length) + BigInt(Math.floor(fundApplicableIds.length / 2))) / BigInt(fundApplicableIds.length))
    : 0;
  const refundById = allocateEqually(refundTotal, refundRecipientIds);
  const perPersonCostWithFund = { ...individualExpenseContributions };
  for (const id of ids) perPersonCostWithFund[id] = amountForParticipant(individualExpenseContributions, id) - amountForParticipant(fundContributionById, id);

  return {
    individualExpenseContributions,
    fundApplicableIds,
    fundNonApplicableIds,
    applicableContributionTotal,
    perApplicableExpenseShare: fundApplicableIds.length ? Math.round(applicableContributionTotal / fundApplicableIds.length) : 0,
    configuredFundAmount,
    baseFundUsed,
    perApplicableFundShare: fundApplicableIds.length ? Math.round(baseFundUsed / fundApplicableIds.length) : 0,
    fundContributionById,
    refundRecipientIds,
    refundById,
    refundTotal,
    totalFundUsed: baseFundUsed + refundTotal,
    configuredFundLeft: configuredFundAmount - baseFundUsed,
    perFundApplicableCost: fundApplicableIds.length ? Math.round((applicableContributionTotal - baseFundUsed) / fundApplicableIds.length) : 0,
    perPersonCostWithFund,
  };
}
