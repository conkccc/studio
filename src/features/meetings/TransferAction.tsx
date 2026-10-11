'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { registeredPaymentAccount, buildTossTransferLink, type PaymentInfo } from '@/lib/payment-info';

export function TransferAction({ recipient, amount, paymentInfo }: {
  recipient: string; amount: number; paymentInfo?: PaymentInfo;
}) {
  const [status, setStatus] = useState('');
  const account = registeredPaymentAccount(paymentInfo);
  const toss = buildTossTransferLink(account, amount);
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} 복사했습니다.`);
    } catch { setStatus('복사하지 못했습니다. 표시된 내용을 길게 눌러 직접 복사해주세요.'); }
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return <details className="w-full rounded-md border bg-background text-sm">
    <summary className="cursor-pointer px-3 py-2 font-medium text-primary" aria-label={`${recipient}에게 ${amount.toLocaleString('ko-KR')}원 송금하기${account ? '' : ' · 계좌 미등록'}`}>송금하기{!account && <span className="ml-2 text-xs font-normal text-muted-foreground">계좌 미등록</span>}</summary>
    <div className="space-y-3 border-t p-3">
      <p className="select-text break-words"><strong>{recipient}</strong>에게 <strong className="tabular-nums">{amount.toLocaleString('ko-KR')}원</strong></p>
      {account && <p className="select-text break-words">{account.bankName} {account.accountNumber}<br />예금주: {account.accountHolder}</p>}
      <div className="flex flex-wrap gap-2">
        {toss && <Button asChild size="sm"><a href={toss} rel="noreferrer" referrerPolicy="no-referrer">토스로 송금</a></Button>}
        <Button type="button" size="sm" variant="outline" onClick={() => copy(String(amount), '금액을')}>금액 복사</Button>
        {account && <Button type="button" size="sm" variant="outline" onClick={() => copy(account.accountNumber.replace(/[ -]/g, ''), '계좌번호를')}>계좌번호 복사</Button>}
      </div>
      {!account && <p className="text-muted-foreground">등록된 계좌가 없습니다. 모임 관리자에게 받는 사람의 은행, 계좌번호, 예금주 등록을 요청해주세요.</p>}
      {account && <p className="text-xs text-muted-foreground">토스에서 받는 사람, 계좌와 금액을 확인한 뒤 송금해주세요. 앱이 열리지 않거나 정보가 채워지지 않으면 계좌번호와 금액을 복사해 직접 송금할 수 있습니다.</p>}
      <p className="text-xs text-muted-foreground">앱을 열어도 송금 완료로 기록되지 않습니다.</p>
      <p role="status" className="text-xs text-muted-foreground">{status}</p>
    </div>
  </details>;
}
