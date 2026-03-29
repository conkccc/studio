import type { Expense, Meeting } from './types';

type ReserveFundSettings = Pick<
  Meeting,
  'useReserveFund' | 'partialReserveFundAmount' | 'nonReserveFundParticipants' | 'refundReserveFundToNonParticipants' | 'reserveFundRefundRecipientIds'
>;

export interface ReserveFundBreakdown {
  individualExpenseContributions: Record<string, number>;
  fundApplicableIds: string[];
  fundNonApplicableIds: string[];
  applicableContributionTotal: number;
  perApplicableExpenseShare: number;
  configuredFundAmount: number;
  baseFundUsed: number;
  perApplicableFundShare: number;
  refundRecipientIds: string[];
  refundTotal: number;
  totalFundUsed: number;
  configuredFundLeft: number;
  perFundApplicableCost: number;
  perPersonCostWithFund: Record<string, number>;
}

const roundAmount = (value: number) => Number(value.toFixed(2));

export function calculateIndividualExpenseContributions(
  expenses: Expense[],
  participantIds: string[]
): Record<string, number> {
  const contributions: Record<string, number> = {};

  participantIds.forEach(id => {
    contributions[id] = 0;
  });

  expenses.forEach(expense => {
    if (expense.splitType === 'equally') {
      const relevantParticipants = expense.splitAmongIds?.filter(id => participantIds.includes(id)) || [];
      if (relevantParticipants.length === 0) {
        return;
      }

      const amountPerPerson = expense.totalAmount / relevantParticipants.length;
      relevantParticipants.forEach(id => {
        contributions[id] = roundAmount((contributions[id] || 0) + amountPerPerson);
      });
      return;
    }

    if (expense.splitType === 'custom' && expense.customSplits) {
      expense.customSplits.forEach(split => {
        if (!participantIds.includes(split.friendId)) {
          return;
        }
        contributions[split.friendId] = roundAmount((contributions[split.friendId] || 0) + split.amount);
      });
    }
  });

  return contributions;
}

export function calculateReserveFundBreakdown({
  settings,
  expenses,
  participantIds,
}: {
  settings: ReserveFundSettings;
  expenses: Expense[];
  participantIds: string[];
}): ReserveFundBreakdown {
  const individualExpenseContributions = calculateIndividualExpenseContributions(expenses, participantIds);
  const fundNonApplicableIds = (settings.nonReserveFundParticipants || []).filter(id => participantIds.includes(id));
  const fundApplicableIds = participantIds.filter(id => !fundNonApplicableIds.includes(id));
  const applicableContributionTotal = roundAmount(
    fundApplicableIds.reduce((sum, id) => sum + (individualExpenseContributions[id] || 0), 0)
  );
  const configuredFundAmount = settings.useReserveFund ? Math.max(settings.partialReserveFundAmount || 0, 0) : 0;
  const perApplicableExpenseShare =
    fundApplicableIds.length > 0 ? roundAmount(applicableContributionTotal / fundApplicableIds.length) : 0;
  const baseFundUsed =
    settings.useReserveFund && fundApplicableIds.length > 0
      ? roundAmount(Math.min(configuredFundAmount, applicableContributionTotal))
      : 0;
  const perApplicableFundShare =
    baseFundUsed > 0 && fundApplicableIds.length > 0 ? roundAmount(baseFundUsed / fundApplicableIds.length) : 0;
  const refundRecipientIds =
    settings.useReserveFund && settings.refundReserveFundToNonParticipants
      ? Array.from(new Set((settings.reserveFundRefundRecipientIds || []).filter(id => !participantIds.includes(id))))
      : [];
  const refundTotal = roundAmount(perApplicableFundShare * refundRecipientIds.length);
  const totalFundUsed = roundAmount(baseFundUsed + refundTotal);
  const configuredFundLeft = roundAmount(Math.max(configuredFundAmount - baseFundUsed, 0));
  const fundRemainingCost = roundAmount(Math.max(applicableContributionTotal - baseFundUsed, 0));
  const perFundApplicableCost =
    fundApplicableIds.length > 0 ? roundAmount(fundRemainingCost / fundApplicableIds.length) : 0;
  const perPersonCostWithFund: Record<string, number> = { ...individualExpenseContributions };

  if (baseFundUsed > 0 && fundApplicableIds.length > 0) {
    fundApplicableIds.forEach(id => {
      perPersonCostWithFund[id] = perFundApplicableCost;
    });
  }

  fundNonApplicableIds.forEach(id => {
    perPersonCostWithFund[id] = roundAmount(individualExpenseContributions[id] || 0);
  });

  return {
    individualExpenseContributions,
    fundApplicableIds,
    fundNonApplicableIds,
    applicableContributionTotal,
    perApplicableExpenseShare,
    configuredFundAmount,
    baseFundUsed,
    perApplicableFundShare,
    refundRecipientIds,
    refundTotal,
    totalFundUsed,
    configuredFundLeft,
    perFundApplicableCost,
    perPersonCostWithFund,
  };
}
