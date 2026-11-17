export const ROLES = [
  'admin',
  'staff',
  'template_manager',
  'standard_user',
] as const;

export type Role = (typeof ROLES)[number];

export type AccessUser = {
  id: string;
  role: Role;
  canPublish: boolean;
};

export function normalizeRole(value: string): Role | null {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

export function isStandardRole(role: Role) {
  return role === 'staff' || role === 'standard_user';
}

export function canManageUsers(user: AccessUser) {
  return user.role === 'admin';
}

export function canEditTemplates(user: AccessUser) {
  return user.role === 'admin' || user.role === 'template_manager';
}

export function canPublishTemplates(user: AccessUser) {
  return (
    user.role === 'admin' ||
    (user.role === 'template_manager' && user.canPublish)
  );
}

export function canSendDocuments(user: AccessUser) {
  return (
    user.role === 'admin' ||
    user.role === 'template_manager' ||
    isStandardRole(user.role)
  );
}

export function canReadAllDocuments(user: AccessUser) {
  return user.role === 'admin';
}

export function canReadEnvelope(user: AccessUser, createdBy: string) {
  return canReadAllDocuments(user) || user.id === createdBy;
}

export function canAdministerMail(user: AccessUser) {
  return user.role === 'admin';
}

export function roleLabel(role: Role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'template_manager') return 'Template manager';
  return 'Standard user';
}

export function assignableRole(value: string): Role | null {
  if (
    value === 'admin' ||
    value === 'template_manager' ||
    value === 'standard_user'
  )
    return value;
  return null;
}
