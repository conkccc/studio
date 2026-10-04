import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import { PaymentSummary } from '../PaymentSummary';
import { calculateSettlement } from '@/lib/settlement';
import { makeExpense, makeFriend, makeMeeting } from '@/lib/actions/__tests__/fixtures';
import type { Expense, Meeting } from '@/lib/types';

const friends = ['a', 'b', 'c', 'd', 'e', 'absent'].map(id => makeFriend({ id, name: `이름-${id}` }));
let renderer: ReactTestRenderer | undefined;
const text = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(text).join('');
function render(meeting: Meeting, expenses: Expense[] = []) {
  act(() => { renderer = create(React.createElement(PaymentSummary, { meeting, expenses, participants: friends.filter(f => meeting.participantIds.includes(f.id)), allFriends: friends })); });
  return renderer!.root;
}
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; });

describe('settlement summary presentation', () => {
  it('distinguishes participant burden from additional transfers and non-attendee refunds', () => {
    const meeting = makeMeeting({ participantIds: ['a', 'b'], useReserveFund: true, partialReserveFundAmount: 4000, refundReserveFundToNonParticipants: true, reserveFundRefundRecipientIds: ['absent'] });
    const root = render(meeting, [makeExpense({ paidById: 'a', splitAmongIds: ['a', 'b'] })]);
    expect(text(root.findByProps({ 'aria-label': '참여자 부담 합계' }))).toBe('참여자 부담 합계6,000원');
    expect(text(root.findByProps({ 'aria-label': '부담금 계산식' }))).toBe('총 지출 10,000원−참가자에 적용한 회비 4,000원=6,000원');
    expect(text(root.findByProps({ 'aria-labelledby': 'settlement-fund-title' }))).toContain('미참가자 환급2,000원총 회비 사용액6,000원');
    expect(text(root)).toContain('추가로 보낼 금액은 아래 송금 안내');
    const sections = root.findAll(node => node.type === 'section' && ['participant-transfers-title', 'fund-transfers-title', 'refund-transfers-title'].includes(node.props['aria-labelledby']));
    expect(sections.map(section => section.props['aria-labelledby'])).toEqual(['participant-transfers-title', 'fund-transfers-title', 'refund-transfers-title']);
    expect(text(sections[0])).toContain('3,000원');
    expect(text(sections[1])).toContain('4,000원');
    expect(text(sections[2])).toContain('2,000원');
  });

  it('matches the March meeting with supported members, excluded attendee and absent recipient', () => {
    const meeting = makeMeeting({ participantIds: ['a', 'b', 'c', 'd', 'e'], useReserveFund: true, partialReserveFundAmount: 439344, nonReserveFundParticipants: ['b'], refundReserveFundToNonParticipants: true, reserveFundRefundRecipientIds: ['absent'] });
    const expenses = [makeExpense({ totalAmount: 513430, paidById: 'e', splitType: 'custom', customSplits: ['a', 'b', 'c', 'd', 'e'].map(friendId => ({ friendId, amount: friendId === 'b' ? 74086 : 109836 })) })];
    const root = render(meeting, expenses);
    expect(text(root.findByProps({ 'aria-label': '참여자 부담 합계' }))).toContain('74,086원');
    const fund = text(root.findByProps({ 'aria-labelledby': 'settlement-fund-title' }));
    expect(fund).toContain('참가자 지출 지원439,344원미참가자 환급109,836원총 회비 사용액549,180원');
    expect(fund).toContain('두 번 지급하는 금액이 아닙니다');
    const table = root.findByType('table');
    expect(table.findAllByType('tbody')[0].findAllByType('tr')).toHaveLength(5);
    const excludedRow = table.findAllByType('tr').find(row => text(row).includes('이름-b'))!;
    expect(text(excludedRow)).toContain('회비 지원 제외');
    expect(text(excludedRow)).toContain('보낼 금액 74,086원');
    const receiverRow = table.findAllByType('tr').find(row => text(row).includes('이름-e'))!;
    expect(text(receiverRow)).toContain('받을 금액 513,430원');
    expect(text(root.findByProps({ 'aria-labelledby': 'refund-transfers-title' }))).toContain('이름-absent');
    expect(text(root)).toContain('참가자 5명 중 회비 지원 대상 4명 · 회비 지원 제외 1명');
    const participantTransfer = text(root.findByProps({ 'aria-labelledby': 'participant-transfers-title' }));
    expect(participantTransfer).not.toContain('보내는 사람');
    expect(participantTransfer).not.toContain('합계');
    expect(participantTransfer).toContain('이름-b이름-e74,086원');
  });

  it('keeps the same sender consecutive even in an interleaved saved snapshot, with fund last', () => {
    const meeting = makeMeeting({ participantIds: ['a', 'b', 'c', 'd'], useReserveFund: true, partialReserveFundAmount: 4000 });
    const expenses = [makeExpense({ totalAmount: 20000, paidById: 'a', splitAmongIds: meeting.participantIds }), makeExpense({ totalAmount: 20000, paidById: 'b', splitAmongIds: meeting.participantIds })];
    const snapshot = calculateSettlement({ meeting, expenses, participants: friends });
    snapshot.transfers = [
      { from: null, to: 'a', amount: 4000, kind: 'fund' },
      { from: 'c', to: 'a', amount: 6000, kind: 'participant' },
      { from: 'd', to: 'b', amount: 8000, kind: 'participant' },
      { from: 'c', to: 'b', amount: 3000, kind: 'participant' },
      { from: 'd', to: 'a', amount: 1000, kind: 'participant' },
    ];
    const original = JSON.stringify(snapshot);
    const root = render({ ...meeting, isSettled: true, settlementSnapshot: snapshot }, []);
    const transfers = root.findByProps({ 'aria-labelledby': 'participant-transfers-title' });
    const rows = transfers.findAll(node => node.type === 'li' && node.findAllByType('svg').length === 1);
    expect(rows.map(row => text(row.findAllByType('span')[0]))).toEqual(['이름-c', '이름-c', '이름-d', '이름-d']);
    expect(text(transfers)).toContain('보낼 합계 9,000원');
    expect(JSON.stringify(snapshot)).toBe(original);
    const sectionOrder = root.findAllByType('h4').map(text);
    expect(sectionOrder).toEqual(['참여자 간 송금', '회비에서 결제자에게 지급']);
  });

  it('uses the saved amount even when live expenses change and distinguishes confirmation from payment', () => {
    const meeting = makeMeeting({ participantIds: ['a', 'b'] });
    const expenses = [makeExpense({ paidById: 'a', splitAmongIds: ['a', 'b'] })];
    const snapshot = calculateSettlement({ meeting, expenses, participants: friends });
    const root = render({ ...meeting, isSettled: true, settlementSnapshot: snapshot }, [{ ...expenses[0], totalAmount: 99000 }]);
    expect(text(root.findByProps({ 'aria-label': '참여자 부담 합계' }))).toContain('10,000원');
    expect(text(root)).toContain('확정할 때 저장한 금액');
    expect(text(root)).toContain('실제 송금 여부는 별도로 확인');
    expect(text(root)).not.toContain('정산 완료');
  });

  it('hides per-sender headings for single transfers even when the list has multiple senders', () => {
    const root = render(makeMeeting({ participantIds: ['a', 'b', 'c'] }), [makeExpense({ totalAmount: 9000, paidById: 'a', splitAmongIds: ['a', 'b', 'c'] })]);
    const transfers = text(root.findByProps({ 'aria-labelledby': 'participant-transfers-title' }));
    expect(transfers).toContain('합계 6,000원');
    expect(transfers).not.toContain('보낼 합계');
    expect(transfers).not.toContain('보내는 사람');
  });

  it('hides fund columns and empty fund transfers when the fund is disabled', () => {
    const root = render(makeMeeting({ participantIds: ['a', 'b'] }), [makeExpense({ paidById: 'a', splitAmongIds: ['a', 'b'] })]);
    expect(root.findAllByProps({ 'aria-labelledby': 'settlement-fund-title' })).toHaveLength(0);
    expect(root.findAllByType('th').map(text)).not.toContain('적용한 회비');
    expect(root.findAllByType('h4').map(text)).toEqual(['참여자 간 송금']);
  });

  it('shows a real zero burden when the fund covers the whole expense', () => {
    const root = render(makeMeeting({ participantIds: ['a', 'b'], useReserveFund: true, partialReserveFundAmount: 10000 }), [makeExpense({ paidById: 'a', splitAmongIds: ['a', 'b'] })]);
    expect(text(root.findByProps({ 'aria-label': '참여자 부담 합계' }))).toBe('참여자 부담 합계0원');
    expect(text(root)).not.toContain('계산 대기');
    expect(root.findAllByProps({ 'aria-labelledby': 'participant-transfers-title' })).toHaveLength(0);
  });

  it('shows an empty state without repeated zero tables before expenses are registered', () => {
    const root = render(makeMeeting({ participantIds: ['a', 'b', 'c', 'd'] }));
    expect(text(root)).toContain('참여자 4명');
    expect(text(root.findByProps({ 'aria-label': '참여자 부담 합계' }))).toContain('계산 대기');
    expect(root.findAllByType('table')).toHaveLength(0);
    expect(text(root.findByType('summary'))).toBe('계산 기준과 정산 상태');
  });

  it('discloses reconstruction and old recorded fund amounts for a legacy finalized meeting', () => {
    const root = render(makeMeeting({ participantIds: ['a', 'b'], isSettled: true, settledReserveFundAmount: 5000 }), [makeExpense({ paidById: 'a', splitAmongIds: ['a', 'b'] })]);
    expect(text(root)).toContain('과거 송금 내역과 다를 수 있습니다');
    expect(text(root.findByType('details'))).toContain('기존에 기록된 회비 사용액: 5,000원');
  });
});
