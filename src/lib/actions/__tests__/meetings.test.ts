import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMeetingAction, updateMeetingAction, deleteMeetingAction, getMeetingDetailsAction, getMeetingsForUserAction, getDashboardAction } from '../meetings';
import { addMeeting, updateMeeting, deleteMeeting, getMeetings, getUserById, getMeetingFriends, getExpensesByMeetingId, getFriendsByIds } from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { ensureMeetingAccess, ensureGroupAccess, accessibleGroupIds } from '../../services/access';
import { makeUser, makeAdmin, makeMeeting, makeFriend, makeFriendGroup } from './fixtures';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../data-store', () => ({ addMeeting: vi.fn(), updateMeeting: vi.fn(), deleteMeeting: vi.fn(), getMeetings: vi.fn(), getUserById: vi.fn(), getMeetingFriends: vi.fn(), getExpensesByMeetingId: vi.fn(), getFriendsByIds: vi.fn() }));
vi.mock('../permissions', () => ({ ensureUserPermission: vi.fn() }));
vi.mock('../../services/access', () => ({ ensureMeetingAccess: vi.fn(), ensureGroupAccess: vi.fn(), accessibleGroupIds: vi.fn() }));

const user = makeUser({ id: 'owner', name: '모임장' });
const meeting = makeMeeting({ creatorId: user.id, groupId: 'g1', participantIds: ['f1', 'f2'] });
const friends = [makeFriend({ id: 'f1', groupId: 'g1' }), makeFriend({ id: 'f2', groupId: 'g1' })];
const emptyPage = { meetings: [], totalCount: 0, availableYears: [2026], nextCursor: null, hasMore: false };
const payload = { name: '모임', dateTime: new Date('2026-10-01T00:00:00Z'), locationName: '', participantIds: ['f1','f2'], groupId: 'g1', nonReserveFundParticipants: [], useReserveFund: false };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user });
  vi.mocked(ensureMeetingAccess).mockResolvedValue({ success: true, user, meeting });
  vi.mocked(ensureGroupAccess).mockResolvedValue({ success: true, user, group: makeFriendGroup({ id:'g1', ownerUserId:user.id }) });
  vi.mocked(accessibleGroupIds).mockResolvedValue(['g1']);
  vi.mocked(getFriendsByIds).mockResolvedValue(friends);
  vi.mocked(getMeetingFriends).mockResolvedValue(friends);
  vi.mocked(getUserById).mockResolvedValue(user);
  vi.mocked(getExpensesByMeetingId).mockResolvedValue([]);
  vi.mocked(addMeeting).mockResolvedValue(meeting);
  vi.mocked(updateMeeting).mockResolvedValue(meeting);
  vi.mocked(getMeetings).mockResolvedValue(emptyPage);
});

describe('meeting access and input boundary', () => {
  it('persists automatic full support without requiring a manual amount on creation', async () => {
    expect((await createMeetingAction({ ...payload, useReserveFund: true, reserveFundCoverAll: true }, user.id)).success).toBe(true);
    expect(addMeeting).toHaveBeenCalledWith(expect.objectContaining({ useReserveFund: true, reserveFundCoverAll: true }));
  });
  it('preserves automatic mode on unrelated edits and allows explicitly switching to a manual amount', async () => {
    vi.mocked(ensureMeetingAccess).mockResolvedValue({ success: true, user, meeting: { ...meeting, useReserveFund: true, reserveFundCoverAll: true } });
    expect((await updateMeetingAction(meeting.id, { name: '변경한 모임' }, user.id)).success).toBe(true);
    expect(updateMeeting).toHaveBeenLastCalledWith(meeting.id, expect.objectContaining({ reserveFundCoverAll: true }), 0);
    expect((await updateMeetingAction(meeting.id, { reserveFundCoverAll: false, partialReserveFundAmount: 1000 }, user.id)).success).toBe(true);
    expect(updateMeeting).toHaveBeenLastCalledWith(meeting.id, expect.objectContaining({ reserveFundCoverAll: false, partialReserveFundAmount: 1000 }), 0);
  });
  it('clears automatic mode if reserve-fund use is disabled', async () => {
    expect((await createMeetingAction({ ...payload, reserveFundCoverAll: true }, user.id)).success).toBe(true);
    expect(addMeeting).toHaveBeenCalledWith(expect.objectContaining({ useReserveFund: false, reserveFundCoverAll: false }));
  });
  it('denies private details before reading participant or expense data', async () => {
    vi.mocked(ensureMeetingAccess).mockResolvedValue({ success:false, error:'권한 없음' });
    expect((await getMeetingDetailsAction('private')).success).toBe(false);
    expect(getMeetingFriends).not.toHaveBeenCalled();
    expect(getExpensesByMeetingId).not.toHaveBeenCalled();
  });
  it('returns only the meeting references and creator name', async () => {
    const result = await getMeetingDetailsAction(meeting.id);
    expect(result.success).toBe(true);
    if (!('meeting' in result)) throw new Error('details absent');
    expect(result.meeting?.creatorName).toBe(user.name);
    expect(result.friends).toEqual(friends);
    expect(result).not.toHaveProperty('users');
  });
  it('uses the verified creator rather than a supplied creator/settlement fields', async () => {
    await createMeetingAction({ ...payload, creatorId:'impostor', isSettled:true } as typeof payload, user.id);
    expect(addMeeting).toHaveBeenCalledWith(expect.objectContaining({creatorId:user.id, participantSnapshot:expect.any(Array)}));
    expect(vi.mocked(addMeeting).mock.calls[0][0]).not.toHaveProperty('isSettled');
  });
  it.each([NaN, -1, 1.5])('rejects invalid reserve amount %s on the server', async amount => {
    expect((await createMeetingAction({ ...payload, useReserveFund:true, partialReserveFundAmount:amount },user.id)).success).toBe(false);
    expect(addMeeting).not.toHaveBeenCalled();
  });
  it('rejects outside-group participants', async () => {
    vi.mocked(getFriendsByIds).mockResolvedValue([friends[0], {...friends[1],groupId:'other'}]);
    expect((await createMeetingAction(payload,user.id)).success).toBe(false);
    expect(addMeeting).not.toHaveBeenCalled();
  });
  it('rejects archived participants in a new meeting', async () => {
    vi.mocked(getFriendsByIds).mockResolvedValue([{...friends[0],isArchived:true},friends[1]]);
    expect((await createMeetingAction(payload,user.id)).success).toBe(false);
  });
  it('prevents deleting a finalized meeting until explicit reopen', async () => {
    vi.mocked(ensureMeetingAccess).mockResolvedValue({success:true,user,meeting:{...meeting,isSettled:true}});
    expect((await deleteMeetingAction(meeting.id,user.id)).success).toBe(false);
    expect(deleteMeeting).not.toHaveBeenCalled();
  });
  it('rejects direct changes to finalized contents', async () => {
    vi.mocked(ensureMeetingAccess).mockResolvedValue({success:true,user,meeting:{...meeting,isSettled:true}});
    expect((await updateMeetingAction(meeting.id,{name:'changed'},user.id)).success).toBe(false);
    expect(updateMeeting).not.toHaveBeenCalled();
  });
  it('saves exactly four selected participants when editing a five-person meeting with no expenses', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    vi.mocked(ensureMeetingAccess).mockResolvedValue({ success: true, user, meeting: { ...meeting, participantIds: five } });
    vi.mocked(getFriendsByIds).mockResolvedValue(five.slice(0, 4).map(id => makeFriend({ id, groupId: 'g1' })));
    const result = await updateMeetingAction(meeting.id, { participantIds: five.slice(0, 4) }, user.id);
    expect(result.success).toBe(true);
    expect(updateMeeting).toHaveBeenCalledWith(meeting.id, expect.objectContaining({ participantIds: ['a', 'b', 'c', 'd'] }), 0);
  });

  it('allows removing an unreferenced stale ID even when other participants have expenses', async () => {
    vi.mocked(ensureMeetingAccess).mockResolvedValue({ success: true, user, meeting: { ...meeting, participantIds: ['f1', 'f2', 'missing'] } });
    vi.mocked(getExpensesByMeetingId).mockResolvedValue([{ id: 'expense', meetingId: meeting.id, description: '식사', totalAmount: 1000, paidById: 'f1', splitType: 'equally', splitAmongIds: ['f1', 'f2'], createdAt: new Date() }]);
    expect((await updateMeetingAction(meeting.id, { participantIds: ['f1', 'f2'] }, user.id)).success).toBe(true);
    expect(updateMeeting).toHaveBeenCalledWith(meeting.id, expect.objectContaining({ participantIds: ['f1', 'f2'] }), 0);
  });

  it('rejects removing a participant whose historical expense share is still referenced', async () => {
    vi.mocked(getExpensesByMeetingId).mockResolvedValue([{ id: 'expense', meetingId: meeting.id, description: '식사', totalAmount: 1000, paidById: 'f1', splitType: 'equally', splitAmongIds: ['f1', 'f2'], createdAt: new Date() }]);
    expect((await updateMeetingAction(meeting.id, { participantIds: ['f1'] }, user.id)).success).toBe(false);
    expect(updateMeeting).not.toHaveBeenCalled();
  });
});

describe('meeting list query', () => {
  it('does not read records after session denial', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({success:false,error:'로그인 필요'});
    expect((await getMeetingsForUserAction({requestingUserId:'admin'})).success).toBe(false);
    expect(getMeetings).not.toHaveBeenCalled();
  });
  it('applies every filter and cursor together with verified access scope', async () => {
    await getMeetingsForUserAction({year:2026,groupId:'g1',type:'regular',status:'pending',search:'저녁',cursor:'cursor',limitParam:9});
    expect(getMeetings).toHaveBeenCalledWith(expect.objectContaining({userId:user.id,userFriendGroupIds:['g1'],year:2026,groupId:'g1',type:'regular',status:'pending',search:'저녁',cursor:'cursor'}));
  });
  it('supports a legitimate administrator scope', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({success:true,user:makeAdmin()});
    await getMeetingsForUserAction({limitParam:9});
    expect(getMeetings).toHaveBeenCalledWith(expect.objectContaining({userId:undefined,userFriendGroupIds:undefined}));
  });
  it('a viewer receives only assigned groups, excluding previously created meetings', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({success:true,user:makeUser({role:'viewer',friendGroupIds:['g1']})});
    await getMeetingsForUserAction({limitParam:9});
    expect(getMeetings).toHaveBeenCalledWith(expect.objectContaining({includeCreated:false,userFriendGroupIds:['g1']}));
    await getDashboardAction();
    expect(vi.mocked(getMeetings).mock.calls.every(([params])=>params?.includeCreated===false)).toBe(true);
  });
  it('preserves continuation when no matches are in the scan window', async () => {
    vi.mocked(getMeetings).mockResolvedValue({...emptyPage,hasMore:true,nextCursor:'next'});
    expect(await getMeetingsForUserAction({search:'rare'})).toMatchObject({success:true,meetings:[],hasMore:true,nextCursor:'next'});
  });
  it('rejects invalid search input before querying records', async () => {
    expect((await getMeetingsForUserAction({year:NaN,search:'x'.repeat(101)})).success).toBe(false);
    expect(getMeetings).not.toHaveBeenCalled();
  });
  it('bounds each dashboard section independently', async () => {
    const result=await getDashboardAction();
    expect(result.success).toBe(true);
    expect(getMeetings).toHaveBeenCalledTimes(3);
    expect(vi.mocked(getMeetings).mock.calls.every(([params])=>params?.limitParam===3)).toBe(true);
    expect(getMeetings).toHaveBeenCalledWith(expect.objectContaining({ascending:true,after:expect.any(Date)}));
  });
});
