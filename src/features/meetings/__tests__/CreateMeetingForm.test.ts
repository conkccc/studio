import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateMeetingForm } from '../CreateMeetingForm';
import { createMeetingAction, updateMeetingAction } from '@/lib/actions';
import { makeExpense, makeFriend, makeFriendGroup, makeMeeting } from '@/lib/actions/__tests__/fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/lib/actions', () => ({ createMeetingAction: vi.fn(), updateMeetingAction: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-google-maps', () => ({ useGoogleMaps: () => ({ isMapsLoaded: false, mapsLoadError: null, retryMaps: vi.fn() }) }));
vi.mock('../MeetingDateInput', () => ({ SelectDate: () => null }));
vi.mock('../MeetingLocationInput', () => ({ LocationSearchInput: () => null }));
vi.mock('../use-meeting-draft', () => ({ useMeetingDraft: () => ({ draft: null, saved: false, dismissDraft: vi.fn(), discardDraft: vi.fn(), completeDraft: vi.fn() }) }));
// Vendor popup rendering needs a DOM; expose its controls to exercise the actual form handlers/hooks.
vi.mock('@/components/ui/popover', () => {
  const Container = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return { Popover: Container, PopoverTrigger: Container, PopoverContent: Container };
});
vi.mock('@/components/ui/command', () => {
  const Container = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  const Item = ({ value, onSelect, disabled, children }: { value?: string; onSelect?: () => void; disabled?: boolean; children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', 'data-command': value, disabled, onClick: onSelect }, children);
  return { Command: Container, CommandList: Container, CommandGroup: Container, CommandEmpty: Container, CommandInput: () => null, CommandItem: Item };
});
vi.mock('@/components/ui/switch', () => ({ Switch: ({ id, checked, disabled, onCheckedChange }: { id: string; checked?: boolean; disabled?: boolean; onCheckedChange: (value: boolean) => void }) => React.createElement('button', { type: 'button', id, disabled, onClick: () => onCheckedChange(!checked) }) }));
vi.mock('@/components/ui/checkbox', () => ({ Checkbox: ({ id, checked, disabled, onCheckedChange }: { id: string; checked?: boolean; disabled?: boolean; onCheckedChange: (value: boolean) => void }) => React.createElement('button', { type: 'button', id, disabled, onClick: () => onCheckedChange(!checked) }) }));

const ids = ['a', 'b', 'c', 'd', 'e'];
const friends = ids.map(id => makeFriend({ id, name: `참여자 ${id}`, groupId: 'g1' }));
const group = makeFriendGroup({ id: 'g1', memberIds: ids });
const meeting = makeMeeting({ participantIds: ids, groupId: 'g1' });
const onGroupChange = vi.fn();
let renderer: ReactTestRenderer | undefined;
const inputNodes = new Map<string, { value: string; name: string; type: string; focus: () => void; select: () => void }>();
type Props = React.ComponentProps<typeof CreateMeetingForm>;

function render(props: Partial<Props>) {
  const element = React.createElement(CreateMeetingForm, { friends, groups: [group], currentUserId: 'owner', selectedGroupId: 'g1', onGroupChange, ...props });
  act(() => {
    if (renderer) renderer.update(element);
    else renderer = create(element, { createNodeMock: node => {
      if (node.type !== 'input') return null;
      const key = node.props.name || node.props.id || node.props.type;
      if (!inputNodes.has(key)) inputNodes.set(key, { value: node.props.defaultValue || '', name: node.props.name, type: node.props.type || 'text', focus: () => {}, select: () => {} });
      return inputNodes.get(key);
    } });
  });
}
async function choose(value: string) {
  await act(async () => renderer!.root.findByProps({ 'data-command': value }).props.onClick());
}
async function submit() {
  await act(async () => renderer!.root.findByType('form').props.onSubmit({ preventDefault: vi.fn(), persist: vi.fn() }));
}
async function toggle(id: string) {
  await act(async () => renderer!.root.find(node => node.type === 'button' && node.props.id === id).props.onClick());
}
beforeEach(() => {
  vi.clearAllMocks();
  inputNodes.clear();
  vi.mocked(createMeetingAction).mockResolvedValue({ success: true, meeting });
  vi.mocked(updateMeetingAction).mockResolvedValue({ success: true, meeting });
});
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; });

describe('meeting participant editing flow', () => {
  it('sends exactly four IDs after unselecting one of five participants', async () => {
    render({ isEditMode: true, initialData: meeting });
    await choose('참여자 e');
    await submit();
    expect(updateMeetingAction).toHaveBeenCalledWith('m1', expect.objectContaining({ participantIds: ['a', 'b', 'c', 'd'] }), 'owner');
  });

  it('does not re-add an excluded participant when selecting the same group again', async () => {
    render({ isEditMode: true, initialData: meeting });
    await choose('참여자 e');
    await choose('그룹');
    await submit();
    expect(vi.mocked(updateMeetingAction).mock.calls[0][1].participantIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('uses fetched friends rather than stale group member IDs when a new group finishes loading', async () => {
    render({ friends: [], selectedGroupId: undefined });
    await choose('그룹');
    render({ friends: [], selectedGroupId: 'g1', isLoadingFriends: true });
    render({ friends: friends.slice(0, 4), selectedGroupId: 'g1', isLoadingFriends: false });
    const nameInput = renderer!.root.findByProps({ id: 'name' }).findByType('input');
    nameInput.instance.value = '새 모임';
    await act(async () => nameInput.props.onChange({ target: nameInput.instance, type: 'change' }));
    await submit();
    expect(createMeetingAction).toHaveBeenCalledWith(expect.objectContaining({ participantIds: ['a', 'b', 'c', 'd'] }), 'owner');
  });

  it('keeps a deliberate exclusion after a later friend-list refresh', async () => {
    render({ isEditMode: true, initialData: meeting });
    await choose('참여자 e');
    render({ isEditMode: true, initialData: meeting, friends: friends.map(friend => ({ ...friend })) });
    await submit();
    expect(vi.mocked(updateMeetingAction).mock.calls[0][1].participantIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('creates an automatic full-support meeting before any expenses exist', async () => {
    render({});
    const nameInput = renderer!.root.findByProps({ id: 'name' }).findByType('input');
    nameInput.instance.value = '자동 지원 모임';
    await act(async () => nameInput.props.onChange({ target: nameInput.instance, type: 'change' }));
    await toggle('useReserveFund');
    await toggle('reserveFundCoverAll');
    const amount = renderer!.root.find(node => node.type === 'input' && node.props.id === 'partialReserveFundAmount');
    expect(amount.props.value).toBe('0');
    expect(amount.props.disabled).toBe(true);
    await submit();
    expect(createMeetingAction).toHaveBeenCalledWith(expect.objectContaining({ useReserveFund: true, reserveFundCoverAll: true }), 'owner');
  });

  it('updates the automatic preview after expense changes and keeps exclusions', async () => {
    const automatic = { ...meeting, useReserveFund: true, reserveFundCoverAll: true, nonReserveFundParticipants: ['e'] };
    const expense = makeExpense({ totalAmount: 10000, paidById: 'a', splitAmongIds: ids });
    render({ isEditMode: true, initialData: automatic, expenses: [expense] });
    const amount = () => renderer!.root.find(node => node.type === 'input' && node.props.id === 'partialReserveFundAmount').props.value;
    expect(amount()).toBe('8,000');
    render({ isEditMode: true, initialData: automatic, expenses: [{ ...expense, totalAmount: 20000 }] });
    expect(amount()).toBe('16,000');
    await toggle('nonReserveFund-d');
    expect(amount()).toBe('12,000');
    await submit();
    expect(updateMeetingAction).toHaveBeenCalledWith('m1', expect.objectContaining({ reserveFundCoverAll: true, nonReserveFundParticipants: ['e', 'd'] }), 'owner');
  });

  it('switches back to a manual budget using the current automatic amount', async () => {
    render({ isEditMode: true, initialData: { ...meeting, useReserveFund: true, reserveFundCoverAll: true }, expenses: [makeExpense({ totalAmount: 10000, paidById: 'a', splitAmongIds: ids })] });
    await toggle('reserveFundCoverAll');
    const amount = renderer!.root.find(node => node.type === 'input' && node.props.id === 'partialReserveFundAmount');
    expect(amount.props.disabled).toBeFalsy();
    expect(amount.props.value).toBe('10,000');
    await submit();
    expect(updateMeetingAction).toHaveBeenCalledWith('m1', expect.objectContaining({ reserveFundCoverAll: false, partialReserveFundAmount: 10000 }), 'owner');
  });
});
