'use client';
import React, { useEffect, useState } from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import type { Friend, Meeting } from '@/lib/types';
import type { MeetingFormData } from './meeting-form-schema';
import type { calculateReserveFundBreakdown } from '@/lib/reserve-fund-settlement';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  form: UseFormReturn<MeetingFormData>;
  isPending: boolean;
  isEditMode: boolean;
  initialData?: Meeting;
  watchUseReserveFund?: boolean;
  watchedIsTemporary?: boolean;
  reserveFundPreview: ReturnType<typeof calculateReserveFundBreakdown>;
  handleApplyTotalReserveFundAmount: () => void;
  reserveFundInput: string;
  setReserveFundInput: (value: string) => void;
  selectedParticipants: Friend[];
  currentUserId: string;
  watchRefundReserveFundToNonParticipants?: boolean;
  refundableNonParticipants: Friend[];
}
export function MeetingReserveFundSection({ form, isPending, isEditMode, initialData, watchUseReserveFund, watchedIsTemporary, reserveFundPreview, handleApplyTotalReserveFundAmount, reserveFundInput, setReserveFundInput, selectedParticipants, currentUserId, watchRefundReserveFundToNonParticipants, refundableNonParticipants }: Props) {
  const [open, setOpen] = useState(Boolean(initialData?.useReserveFund));
  const coverAll = useWatch({ control: form.control, name: 'reserveFundCoverAll' });
  const errors = form.formState.errors;
  useEffect(() => {
    if (errors.partialReserveFundAmount || errors.nonReserveFundParticipants || errors.reserveFundRefundRecipientIds) setOpen(true);
  }, [errors]);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="rounded-lg border">
    <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">회비 사용 · 제외 멤버 · 환급 설정 (선택)</summary>
    <div className="p-4 pt-1">
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
                  disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary}
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
              모임 회비 사용 {(isEditMode && initialData?.isSettled) && "(정산 확정됨 - 수정 불가)"}
            </Label>
          </div>

          {watchUseReserveFund && !watchedIsTemporary && (
            <div className="space-y-4 mt-4 pl-2 border-l-2 ml-2">
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Controller control={form.control} name="reserveFundCoverAll" render={({ field }) => (
                    <Checkbox id="reserveFundCoverAll" checked={field.value || false} onCheckedChange={checked => {
                      field.onChange(checked === true);
                      if (checked === false) form.setValue('partialReserveFundAmount', reserveFundPreview.applicableContributionTotal || undefined, { shouldDirty: true });
                      void form.trigger('partialReserveFundAmount');
                    }} disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary} />
                  )} />
                  <Label htmlFor="reserveFundCoverAll">참가자 비용 전액을 회비로 지원 (자동 계산)</Label>
                </div>
                <p className="text-xs text-muted-foreground">지출을 추가·수정·삭제하면 지원 금액도 자동으로 바뀝니다. 회비 지원 제외자의 부담은 남고, 미참가자 환급은 별도로 더해집니다. 정산을 확정하면 금액이 저장됩니다.</p>
              </div>
	              <div>
	                <Label
	                  htmlFor="partialReserveFundAmount"
	                  className={cn((isEditMode && initialData?.isSettled) && "text-muted-foreground")}
	                >
	                  {coverAll ? '현재 자동 계산한 참가자 지원액 (원)' : '참가자 지원 예산 (원)'} {!coverAll && <span className="text-destructive">*</span>}
	                </Label>
		                {isEditMode && !coverAll && (
		                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
		                    <Button
		                      type="button"
		                      variant="outline"
		                      size="sm"
		                      onClick={handleApplyTotalReserveFundAmount}
		                      disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary || reserveFundPreview.applicableContributionTotal <= 0}
		                    >
		                      현재 지출 전액 한 번 입력
		                    </Button>
		                    <p className="text-xs text-muted-foreground">
		                      회비 사용 제외 멤버를 뺀 현재 지출 부담 총액 {reserveFundPreview.applicableContributionTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}원을 자동 입력합니다.
		                    </p>
		                  </div>
		                )}
	                <Controller
	                  name="partialReserveFundAmount"
	                  control={form.control}
                  render={({ field }) => (
                    <Input
                      id="partialReserveFundAmount"
                      type="text"
                      value={coverAll ? reserveFundPreview.baseFundUsed.toLocaleString('ko-KR') : reserveFundInput}
                      onChange={e => {
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
                      disabled={coverAll || isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary}
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
                    <p className={cn("text-sm", (isEditMode && initialData?.isSettled) ? "text-muted-foreground/70" : "text-mutedForeground", watchedIsTemporary && "text-muted-foreground/70" )}>참여자를 먼저 선택해주세요.</p>
                  )}
	                </div>
	                {form.formState.errors.nonReserveFundParticipants && <p className="text-sm text-destructive mt-1">{form.formState.errors.nonReserveFundParticipants.message}</p>}
	              </div>

                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <div className="flex items-center space-x-2">
                    <Controller
                      control={form.control}
                      name="refundReserveFundToNonParticipants"
                      render={({ field }) => (
                        <Switch
                          id="refundReserveFundToNonParticipants"
                          checked={field.value || false}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (!checked) {
                              form.setValue('reserveFundRefundRecipientIds', [], { shouldValidate: true });
                            }
                          }}
                          disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary}
                        />
                      )}
                    />
                    <Label
                      htmlFor="refundReserveFundToNonParticipants"
                      className={cn(
                        "cursor-pointer",
                        (isEditMode && initialData?.isSettled) && "text-muted-foreground cursor-not-allowed",
                        watchedIsTemporary && "text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      미참가자 회비 돌려주기
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    회비 적용 참여자의 평균 지원액을 기준으로 환급합니다. 환급액은 참여자 지원액에 더해 회비에서 추가로 사용됩니다.
                  </p>

                  {watchRefundReserveFundToNonParticipants && (
                    <div className="space-y-3 pt-1">
                      <div className="rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground space-y-1">
                        <p>
                          참여자 평균 회비 지원액: {reserveFundPreview.perApplicableFundShare.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                        </p>
                        <p>
                          환급 예상 총액: {reserveFundPreview.refundTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                        </p>
                        <p>
                          총 회비 사용 예정: {reserveFundPreview.totalFundUsed.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                        </p>
                      </div>

                      <div>
                        <Label className={cn("font-medium", (isEditMode && initialData?.isSettled) && "text-muted-foreground")}>
                          회비 돌려받을 친구
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          현재 모임 참여자가 아닌 친구만 선택할 수 있습니다.
                        </p>
                        <div className="grid gap-2 mt-2">
                          {refundableNonParticipants.length > 0 ? (
                            refundableNonParticipants.map(friend => (
                              <div key={friend.id} className="flex items-center space-x-2">
                                <Controller
                                  control={form.control}
                                  name="reserveFundRefundRecipientIds"
                                  render={({ field }) => (
                                    <Checkbox
                                      id={`reserveFundRefundRecipient-${friend.id}`}
                                      checked={field.value?.includes(friend.id)}
                                      onCheckedChange={(checked) => {
                                        const currentRecipientIds = field.value || [];
                                        const nextRecipientIds = checked
                                          ? [...currentRecipientIds, friend.id]
                                          : currentRecipientIds.filter(id => id !== friend.id);
                                        field.onChange(nextRecipientIds);
                                      }}
                                      disabled={isPending || (isEditMode && initialData?.isSettled) || watchedIsTemporary}
                                    />
                                  )}
                                />
                                <Label
                                  htmlFor={`reserveFundRefundRecipient-${friend.id}`}
                                  className={cn(
                                    "font-normal",
                                    (isEditMode && initialData?.isSettled) && "text-muted-foreground cursor-not-allowed",
                                    watchedIsTemporary && "text-muted-foreground cursor-not-allowed"
                                  )}
                                >
                                  {friend.name}
                                  {friend.description && (
                                    <span className="ml-1 text-xs text-muted-foreground">({friend.description})</span>
                                  )}
                                  {friend.id === currentUserId && " (나)"}
                                </Label>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">현재 선택 가능한 미참가 친구가 없습니다.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
	            </div>
	          )}
	        </div>
</div>
  </details>;
}
