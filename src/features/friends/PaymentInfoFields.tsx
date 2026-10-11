'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PaymentInfo } from '@/lib/payment-info';

export function PaymentInfoFields({ value, onChange, disabled }: {
  value: PaymentInfo; onChange: (value: PaymentInfo) => void; disabled?: boolean;
}) {
  const id = useId();
  const fields = [
    ['bankName', '은행', '은행명'], ['accountNumber', '계좌번호', '계좌번호'], ['accountHolder', '예금주', '예금주명'],
  ] as const;
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border p-3">
    <legend className="px-1 text-sm font-medium">송금받을 계좌 (선택)</legend>
    <p className="text-xs text-muted-foreground">등록한 정보는 모임 정산 공유 링크에도 표시됩니다. 받는 사람에게 확인한 정보만 입력해주세요.</p>
    {fields.map(([key, label, placeholder]) => <div key={key} className="space-y-1">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} value={value[key] || ''} onChange={event => onChange({ ...value, [key]: event.target.value })}
        placeholder={placeholder} type="text" inputMode={key === 'accountNumber' ? 'tel' : undefined} maxLength={key === 'bankName' ? 30 : key === 'accountNumber' ? 40 : 50} />
    </div>)}
    <p className="text-xs text-muted-foreground">계좌를 등록하면 정산 금액과 함께 토스로 연결합니다. 토스가 열리지 않으면 계좌번호와 금액을 복사해 사용하는 은행 앱에서 송금할 수 있습니다.</p>
  </fieldset>;
}
