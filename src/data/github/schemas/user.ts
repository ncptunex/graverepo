// Schema for `user` (GET /users/{owner}), used for users and organisations.
import { z } from 'zod';
import { optionalCount, optionalHttpsUrl, optionalText, requiredHttpsUrl, requiredText } from './fields';

export const userSchema = z.object({
  login: requiredText,
  name: optionalText,
  avatar_url: optionalHttpsUrl,
  html_url: requiredHttpsUrl,
  type: z.enum(['User', 'Organization']),
  public_repos: optionalCount,
});

export type GitHubUser = z.output<typeof userSchema>;
