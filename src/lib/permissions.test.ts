import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES } from "./default-roles";
import { ALL_PERMISSIONS, normalisePermissions, PERMISSIONS, SYSTEM_ROLE_KEYS } from "./permissions";

const P = PERMISSIONS;

describe("normalisePermissions", () => {
  it("adds required permissions (Publish → Design → View)", () => {
    expect(normalisePermissions([P.FORMS_PUBLISH])).toEqual([P.FORMS_VIEW, P.FORMS_DESIGN, P.FORMS_PUBLISH]);
    expect(normalisePermissions([P.CONFIG_JOBS_TEST])).toEqual([P.CONFIG_JOBS_VIEW, P.CONFIG_JOBS_TEST]);
  });

  it("drops unknown keys and returns catalogue order without duplicates", () => {
    expect(normalisePermissions(["nope", P.RISK_VIEW, P.DOCUMENTS_MANAGE, P.RISK_VIEW])).toEqual([P.RISK_VIEW, P.DOCUMENTS_MANAGE]);
  });

  it("removing a key also removes keys that depend on it", () => {
    expect(normalisePermissions([P.FORMS_VIEW, P.FORMS_DESIGN, P.FORMS_PUBLISH, P.FORMS_ARCHIVE], P.FORMS_VIEW)).toEqual([]);
    expect(normalisePermissions([P.FORMS_VIEW, P.FORMS_DESIGN, P.FORMS_PUBLISH], P.FORMS_DESIGN)).toEqual([P.FORMS_VIEW]);
  });

  it("keeps independent keys when removing", () => {
    expect(normalisePermissions([P.FORMS_VIEW, P.RISK_VIEW], P.FORMS_VIEW)).toEqual([P.RISK_VIEW]);
  });
});

describe("default roles", () => {
  it("gives the Administrator every permission", () => {
    const admin = DEFAULT_ROLES.find((r) => r.key === SYSTEM_ROLE_KEYS.ADMINISTRATOR)!;
    expect([...admin.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("seeds all well-known role keys with normalised permission sets", () => {
    expect(DEFAULT_ROLES.map((r) => r.key).sort()).toEqual(Object.values(SYSTEM_ROLE_KEYS).sort());
    for (const role of DEFAULT_ROLES) expect(role.permissions).toEqual(normalisePermissions(role.permissions));
  });

  it("does not give ordinary employees configuration rights", () => {
    const employee = DEFAULT_ROLES.find((r) => r.key === SYSTEM_ROLE_KEYS.EMPLOYEE)!;
    expect(employee.permissions.some((p) => p.startsWith("config."))).toBe(false);
  });
});
