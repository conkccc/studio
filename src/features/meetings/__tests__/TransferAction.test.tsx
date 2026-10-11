import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransferAction } from '../TransferAction';
import type { PaymentInfo } from '@/lib/payment-info';

let renderer: ReactTestRenderer;
afterEach(() => { act(() => renderer?.unmount()); vi.unstubAllGlobals(); });
const paymentInfo = { bankName: '국민은행', accountNumber: '0123-456', accountHolder: '받는친구' };
function render(info: PaymentInfo = paymentInfo, amount = 12345) {
  act(() => { renderer = create(<TransferAction recipient="받는친구" amount={amount} paymentInfo={info} />); });
  return renderer.root;
}

describe('transfer handoff', () => {
  it('links directly to Toss from the registered account without a popup', () => {
    const root = render();
    const links = root.findAllByType('a');
    expect(links).toHaveLength(1);
    const destination = new URL(links[0].props.href);
    expect(destination.protocol).toBe('supertoss:');
    expect(destination.searchParams.get('accountNo')).toBe('0123456');
    expect(destination.searchParams.get('amount')).toBe('12345');
    expect(links[0].props.target).toBeUndefined();
    expect(links[0].props.referrerPolicy).toBe('no-referrer');
  });

  it('copies the exact saved amount and account without opening an app', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const root = render();
    const buttons = root.findAllByType('button');
    await act(async () => buttons[0].props.onClick());
    expect(writeText).toHaveBeenLastCalledWith('12345');
    await act(async () => buttons[1].props.onClick());
    expect(writeText).toHaveBeenLastCalledWith('0123456');
  });

  it('offers manual copying when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const root = render();
    await act(async () => root.findAllByType('button')[0].props.onClick());
    expect(root.findByProps({ role: 'status' }).children.join('')).toContain('직접 복사');
  });

  it('shows missing accounts before expanding and keeps amount copying available', () => {
    const root = render({});
    expect(root.findAllByType('a')).toHaveLength(0);
    expect(root.findByType('summary').props['aria-label']).toContain('계좌 미등록');
    expect(root.findAllByType('button')).toHaveLength(1);
    expect(root.findByType('button').children).toEqual(['금액 복사']);
  });

  it('ignores legacy links and does not render zero-amount actions', () => {
    const legacy = { ...paymentInfo, tossUrl: 'javascript:alert(1)', kakaopayUrl: 'https://evil.test/' };
    const root = render(legacy);
    expect(root.findByType('a').props.href).toMatch(/^supertoss:\/\/send\?/);
    act(() => renderer.update(<TransferAction recipient="친구" amount={0} paymentInfo={paymentInfo} />));
    expect(renderer.toJSON()).toBeNull();
  });
});
