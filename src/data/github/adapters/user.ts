// Adapter for `user` (task 5.1, Req 1.5): users and organisations.
import { userSchema } from '../schemas/user';
import type { UserProfile } from '../types';
import { adapted, unexpectedResponse, type AdapterResult } from './adapter-result';

export function adaptUser(body: unknown): AdapterResult<UserProfile> {
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) return unexpectedResponse();
  const user = parsed.data;
  return adapted({
    login: user.login,
    displayName: user.name,
    avatarUrl: user.avatar_url,
    profileUrl: user.html_url,
    accountType: user.type === 'Organization' ? 'organisation' : 'user',
    publicRepoCount: user.public_repos,
  });
}
