import { describe, expect, it } from "vitest";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import { actionVisibleWhere, canAssess, canCompleteAction, canManage, canViewRegister } from "./slaw-access.policy";

const user = (...permissions: Permission[]) => ({ id: "me", permissions });

describe("Simplified law access", () => {
  it("any Simplified law permission opens the register", () => {
    expect(canViewRegister(user())).toBe(false);
    expect(canViewRegister(user(P.SLAW_VIEW))).toBe(true);
    expect(canViewRegister(user(P.SLAW_ASSESS))).toBe(true);
    expect(canViewRegister(user(P.SLAW_MANAGE))).toBe(true);
    expect(canViewRegister(user(P.LAW_VIEW))).toBe(false);
  });

  it("assess and configure need their own keys", () => {
    expect(canAssess(user(P.SLAW_VIEW))).toBe(false);
    expect(canAssess(user(P.SLAW_ASSESS))).toBe(true);
    expect(canManage(user(P.SLAW_ASSESS))).toBe(false);
    expect(canManage(user(P.SLAW_MANAGE))).toBe(true);
  });

  it("people without register access only see their own actions", () => {
    expect(actionVisibleWhere(user())).toMatchObject({ actionOwnerId: "me" });
    expect(actionVisibleWhere(user(P.SLAW_VIEW))).not.toHaveProperty("actionOwnerId");
  });

  it("the owner or an assessor completes an open action", () => {
    expect(canCompleteAction(user(), { actionStatus: "OPEN", actionOwnerId: "me" })).toBe(true);
    expect(canCompleteAction(user(P.SLAW_VIEW), { actionStatus: "OPEN", actionOwnerId: "other" })).toBe(false);
    expect(canCompleteAction(user(P.SLAW_ASSESS), { actionStatus: "OPEN", actionOwnerId: "other" })).toBe(true);
    expect(canCompleteAction(user(P.SLAW_ASSESS), { actionStatus: "DONE", actionOwnerId: "me" })).toBe(false);
  });
});
