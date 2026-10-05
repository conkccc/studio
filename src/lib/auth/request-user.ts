import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '../types';

// Only a verified server session may populate this request-local context.
const requestUser = new AsyncLocalStorage<User>();
export const currentRequestUser = () => requestUser.getStore();
export const withRequestUser = <T>(user: User, work: () => Promise<T>) => requestUser.run(user, work);
