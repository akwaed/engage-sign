import type { AccessUser } from './auth/rbac.ts';
import { canEditTemplates, canPublishTemplates } from './auth/rbac.ts';

export function templateActionAllowed(
  user: AccessUser,
  action: 'edit' | 'publish',
) {
  return action === 'publish'
    ? canPublishTemplates(user)
    : canEditTemplates(user);
}

export function assertDraftMutable(lifecycle: string) {
  if (lifecycle !== 'draft')
    throw new Error('Published template versions are immutable.');
}
