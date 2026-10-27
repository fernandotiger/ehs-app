import { PERMISSIONS, type Permission } from "./permissions";

/** Home → Insights is shown to people who administer the directory, structure or access. */
export const INSIGHTS_PERMISSIONS: Permission[] = [PERMISSIONS.ADMIN_USERS, PERMISSIONS.ADMIN_ROLES, PERMISSIONS.ADMIN_ORGANISATION, PERMISSIONS.ADMIN_AUDIT];
