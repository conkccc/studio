'use client';
import * as actions from './actions';
import { invalidateAppData } from './app-query-client';
import { getAppQueryClient, appQueryKey, currentDataScope, currentDataUserId } from './app-query-client';
import { fetchAppData, type AppResource } from './app-data';
export * from './actions';

function read<R extends AppResource>(resource: R, params: { id?: string } = {}) {
  const scope = currentDataScope();
  const expectedUserId = currentDataUserId();
  return getAppQueryClient().fetchQuery({
    queryKey: appQueryKey(scope, resource, params),
    queryFn: ({ signal }) => fetchAppData(resource, params, signal, expectedUserId),
  });
}
export const getFriendGroupsForUserAction: typeof actions.getFriendGroupsForUserAction = async () => {
  try { return await read('groups'); }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : '그룹을 불러오지 못했습니다.', groups: [] }; }
};
export const getFriendsByGroupAction: typeof actions.getFriendsByGroupAction = async id => {
  try { return await read('friends', { id }); }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : '친구를 불러오지 못했습니다.', friends: [] }; }
};

async function mutate<R extends { success: boolean }>(work: () => Promise<R>, resources: string[]): Promise<R> {
  const result = await work();
  if (result.success) invalidateAppData(resources);
  return result;
}

export const createMeetingAction = (...args: Parameters<typeof actions.createMeetingAction>) => mutate(() => actions.createMeetingAction(...args), ["meetings","dashboard","meeting-edit"]);
export const updateMeetingAction = (...args: Parameters<typeof actions.updateMeetingAction>) => mutate(() => actions.updateMeetingAction(...args), ["meetings","dashboard","meeting-edit"]);
export const deleteMeetingAction = (...args: Parameters<typeof actions.deleteMeetingAction>) => mutate(() => actions.deleteMeetingAction(...args), ["meetings","dashboard","meeting-edit"]);
export const createExpenseAction = (...args: Parameters<typeof actions.createExpenseAction>) => mutate(() => actions.createExpenseAction(...args), ["meetings","dashboard","meeting-edit"]);
export const updateExpenseAction = (...args: Parameters<typeof actions.updateExpenseAction>) => mutate(() => actions.updateExpenseAction(...args), ["meetings","dashboard","meeting-edit"]);
export const deleteExpenseAction = (...args: Parameters<typeof actions.deleteExpenseAction>) => mutate(() => actions.deleteExpenseAction(...args), ["meetings","dashboard","meeting-edit"]);
export const finalizeMeetingSettlementAction = (...args: Parameters<typeof actions.finalizeMeetingSettlementAction>) => mutate(() => actions.finalizeMeetingSettlementAction(...args), ["meetings","dashboard","meeting-edit"]);
export const reopenMeetingSettlementAction = (...args: Parameters<typeof actions.reopenMeetingSettlementAction>) => mutate(() => actions.reopenMeetingSettlementAction(...args), ["meetings","dashboard","meeting-edit"]);
export const toggleMeetingShareAction = (...args: Parameters<typeof actions.toggleMeetingShareAction>) => mutate(() => actions.toggleMeetingShareAction(...args), ["meetings","meeting-edit"]);
export const createFriendGroupAction = (...args: Parameters<typeof actions.createFriendGroupAction>) => mutate(() => actions.createFriendGroupAction(...args), ["groups","friends","meetings","meeting-edit","dashboard","preps","prep-detail","users"]);
export const updateFriendGroupAction = (...args: Parameters<typeof actions.updateFriendGroupAction>) => mutate(() => actions.updateFriendGroupAction(...args), ["groups","friends","meetings","meeting-edit","dashboard","preps","prep-detail","users"]);
export const deleteFriendGroupAction = (...args: Parameters<typeof actions.deleteFriendGroupAction>) => mutate(() => actions.deleteFriendGroupAction(...args), ["groups","friends","meetings","meeting-edit","dashboard","preps","prep-detail","users"]);
export const createFriendAction = (...args: Parameters<typeof actions.createFriendAction>) => mutate(() => actions.createFriendAction(...args), ["friends","groups","meetings","meeting-edit","preps","prep-detail"]);
export const updateFriendAction = (...args: Parameters<typeof actions.updateFriendAction>) => mutate(() => actions.updateFriendAction(...args), ["friends","groups","meetings","meeting-edit","preps","prep-detail"]);
export const deleteFriendAction = (...args: Parameters<typeof actions.deleteFriendAction>) => mutate(() => actions.deleteFriendAction(...args), ["friends","groups","meetings","meeting-edit","preps","prep-detail"]);
export const createMeetingPrepAction = (...args: Parameters<typeof actions.createMeetingPrepAction>) => mutate(() => actions.createMeetingPrepAction(...args), ["preps","prep-detail"]);
export const updateMeetingPrepAction = (...args: Parameters<typeof actions.updateMeetingPrepAction>) => mutate(() => actions.updateMeetingPrepAction(...args), ["preps","prep-detail"]);
export const deleteMeetingPrepAction = (...args: Parameters<typeof actions.deleteMeetingPrepAction>) => mutate(() => actions.deleteMeetingPrepAction(...args), ["preps","prep-detail"]);
export const toggleMeetingPrepShareAction = (...args: Parameters<typeof actions.toggleMeetingPrepShareAction>) => mutate(() => actions.toggleMeetingPrepShareAction(...args), ["preps","prep-detail"]);
export const assignFriendGroupsToUserAction = (...args: Parameters<typeof actions.assignFriendGroupsToUserAction>) => mutate(() => actions.assignFriendGroupsToUserAction(...args), ["users","groups","friends","meetings","meeting-edit","dashboard","preps","prep-detail"]);
export const updateUserRoleAction = (...args: Parameters<typeof actions.updateUserRoleAction>) => mutate(() => actions.updateUserRoleAction(...args), ["users","groups","friends","meetings","meeting-edit","dashboard","preps","prep-detail"]);

export const submitParticipantAvailabilityAction = (...args: Parameters<typeof actions.submitParticipantAvailabilityAction>) => mutate(() => actions.submitParticipantAvailabilityAction(...args), ["prep-detail"]);
