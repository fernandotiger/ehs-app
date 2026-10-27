import { describe, expect, it } from "vitest";
import { CrossTenantWriteError, scopeArgs } from "./tenant-scope";

const ORG = "org-a";

describe("tenant scoping (scopeArgs)", () => {
  it("adds organizationId to reads, counts and aggregates", () => {
    for (const op of ["findUnique", "findFirst", "findMany", "count", "aggregate", "groupBy", "findUniqueOrThrow", "findFirstOrThrow"]) {
      expect(scopeArgs("Document", op, { where: { id: "d1" } }, ORG).where).toEqual({ id: "d1", organizationId: ORG });
    }
  });

  it("adds a where clause even when the caller passed none", () => {
    expect(scopeArgs("Document", "findMany", undefined, ORG)).toEqual({ where: { organizationId: ORG } });
    expect(scopeArgs("Document", "count", {}, ORG)).toEqual({ where: { organizationId: ORG } });
  });

  it("overrides a caller-supplied organizationId in the where (cannot read another tenant)", () => {
    expect(scopeArgs("Document", "findMany", { where: { organizationId: "org-b" } }, ORG).where).toEqual({ organizationId: ORG });
  });

  it("scopes updates and deletes, keeping the rest of the arguments", () => {
    const args = { where: { id: "d1" }, data: { title: "x" } };
    expect(scopeArgs("Document", "update", args, ORG)).toEqual({ where: { id: "d1", organizationId: ORG }, data: { title: "x" } });
    expect(scopeArgs("Document", "updateMany", args, ORG).where).toEqual({ id: "d1", organizationId: ORG });
    expect(scopeArgs("Document", "delete", { where: { id: "d1" } }, ORG).where).toEqual({ id: "d1", organizationId: ORG });
    expect(scopeArgs("Document", "deleteMany", {}, ORG).where).toEqual({ organizationId: ORG });
  });

  it("does not mutate the caller's arguments", () => {
    const args = { where: { id: "d1" } };
    scopeArgs("Document", "findFirst", args, ORG);
    expect(args).toEqual({ where: { id: "d1" } });
  });

  it("fills a missing organizationId on creates and accepts the current tenant", () => {
    expect(scopeArgs("Document", "create", { data: { title: "x" } }, ORG).data).toEqual({ title: "x", organizationId: ORG });
    expect(scopeArgs("Document", "create", { data: { title: "x", organizationId: ORG } }, ORG).data).toEqual({ title: "x", organizationId: ORG });
    expect(scopeArgs("Document", "createMany", { data: [{ a: 1 }, { a: 2, organizationId: ORG }] }, ORG).data).toEqual([
      { a: 1, organizationId: ORG },
      { a: 2, organizationId: ORG },
    ]);
  });

  it("rejects creates for another tenant", () => {
    expect(() => scopeArgs("Document", "create", { data: { organizationId: "org-b" } }, ORG)).toThrow(CrossTenantWriteError);
    expect(() => scopeArgs("Document", "createMany", { data: [{ organizationId: ORG }, { organizationId: "org-b" }] }, ORG)).toThrow(CrossTenantWriteError);
    expect(() => scopeArgs("Document", "createManyAndReturn", { data: [{ organizationId: "org-b" }] }, ORG)).toThrow(CrossTenantWriteError);
  });

  it("scopes the where and checks the create branch of an upsert", () => {
    const result = scopeArgs("OrgSetting", "upsert", { where: { organizationId_key: { organizationId: ORG, key: "system" } }, create: { key: "system" }, update: {} }, ORG);
    expect(result.where).toEqual({ organizationId_key: { organizationId: ORG, key: "system" }, organizationId: ORG });
    expect(result.create).toEqual({ key: "system", organizationId: ORG });
    expect(() => scopeArgs("OrgSetting", "upsert", { where: {}, create: { organizationId: "org-b" }, update: {} }, ORG)).toThrow(CrossTenantWriteError);
  });
});
