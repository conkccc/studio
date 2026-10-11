import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FriendGroupListClient from '../FriendGroupListClient';
import { useAuth } from '@/contexts/AuthContext';
import { createFriendAction, updateFriendAction } from '@/lib/client-actions';
import { makeFriend, makeFriendGroup, makeUser } from '@/lib/actions/__tests__/fixtures';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/client-actions', () => ({ createFriendAction: vi.fn(), updateFriendAction: vi.fn(), deleteFriendAction: vi.fn(), createFriendGroupAction: vi.fn(), deleteFriendGroupAction: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueryData: vi.fn() }) }));
vi.mock('@/hooks/use-app-data', () => ({ useAppData: (resource: string) => ({ data: resource === 'groups' ? { groups: [{ ...makeFriendGroup(), isOwned: true }] } : { friends: [makeFriend()] }, isLoading: false }) }));
// Keep the actual group, list, fields and form handlers; only popup portals need DOM substitutes.
vi.mock('@/components/ui/dialog', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) => open ? <div>{children}</div> : null,
    DialogContent: Box, DialogHeader: Box, DialogTitle: Box, DialogDescription: Box, DialogFooter: Box, DialogClose: Box };
});
vi.mock('@/components/ui/tooltip', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { TooltipProvider: Box, Tooltip: Box, TooltipTrigger: Box, TooltipContent: () => null };
});
vi.mock('@/components/ui/alert-dialog', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { AlertDialog: Box, AlertDialogTrigger: Box, AlertDialogContent: () => null,
    AlertDialogAction: Box, AlertDialogCancel: Box, AlertDialogDescription: Box, AlertDialogFooter: Box, AlertDialogHeader: Box, AlertDialogTitle: Box };
});
let renderer: ReactTestRenderer;
const account = { bankName: '국민은행', accountNumber: '123-456', accountHolder: '친구' };
const root = () => renderer.root;
const button = (label: string) => root().find(node => node.type === 'button' && node.props['aria-label'] === label);
function render() {
  act(() => { renderer = create(<FriendGroupListClient />, { createNodeMock: node => node.type === 'input' ? { name: node.props.name, type: 'text', value: '', focus() {} } : null }); });
}
async function fillAccount() {
  for (const [field, value] of Object.entries(account)) {
    await act(async () => root().find(node => node.type === 'input' && node.props.id?.endsWith(`-${field}`)).props.onChange({ target: { value } }));
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ appUser: makeUser(), currentUser: { uid: 'u1' }, loading: false } as ReturnType<typeof useAuth>);
  vi.mocked(updateFriendAction).mockResolvedValue({ success: true, friend: makeFriend({ paymentInfo: account }) });
  vi.mocked(createFriendAction).mockResolvedValue({ success: true, friend: makeFriend({ paymentInfo: account }) });
});
afterEach(() => act(() => renderer?.unmount()));
describe('account registration through the friends page', () => {
  it('opens the real group list editor and saves the recipient account', async () => {
    render();
    act(() => root().find(node => node.type === 'button' && node.props['aria-expanded'] === false).props.onClick());
    act(() => button('친구 정보 및 계좌 수정').props.onClick());
    await fillAccount();
    await act(async () => button('친구 정보 저장').props.onClick());
    expect(updateFriendAction).toHaveBeenCalledWith('f1', expect.objectContaining({ paymentInfo: account }));
    expect(root().findAllByType('fieldset')).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain('계좌 등록됨');
  });
  it('includes account fields in the actual add-to-group dialog and submits them', async () => {
    render();
    act(() => button('그룹에 친구 추가').props.onClick({ stopPropagation() {} }));
    await act(async () => root().find(node => node.type === 'input' && node.props.name === 'name').props.onChange({ target: { name: 'name', value: '친구' }, type: 'change' }));
    await fillAccount();
    await act(async () => root().findByType('form').props.onSubmit({ preventDefault() {}, persist() {} }));
    expect(createFriendAction).toHaveBeenCalledWith(expect.objectContaining({ name: '친구', groupId: 'g1', paymentInfo: account, currentUserId: 'u1' }));
  });
  it('keeps account editing disabled for a viewer', () => {
    vi.mocked(useAuth).mockReturnValue({ appUser: makeUser({ role: 'viewer' }), currentUser: { uid: 'u1' }, loading: false } as ReturnType<typeof useAuth>);
    render();
    act(() => root().find(node => node.type === 'button' && node.props['aria-expanded'] === false).props.onClick());
    expect(button('친구 정보 및 계좌 수정').props.disabled).toBe(true);
  });
});
