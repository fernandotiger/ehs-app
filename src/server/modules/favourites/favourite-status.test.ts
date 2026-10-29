import { describe, expect, it } from "vitest";
import { PERMISSIONS as P } from "@/lib/permissions";
import { checkPageForFavourite, itemStatus } from "./favourite-status";

const manager = { permissions: [P.DOCUMENTS_MANAGE, P.INCIDENT_CREATE], enabledModules: ["documents", "incidents", "risk"] as const };
const employee = { permissions: [], enabledModules: ["documents", "incidents"] as const };

describe("checkPageForFavourite", () => {
  it("cleans and accepts an offered page the user can open", () => {
    expect(checkPageForFavourite("/incidents/register?view=investigations&fav=f1&q=a", manager)).toMatchObject({ ok: true, url: "/incidents/register?q=a&view=investigations" });
    expect(checkPageForFavourite("/incidents/new", manager)).toMatchObject({ ok: true, url: "/incidents/new", entry: { seed: "incident.report" } });
  });

  it("refuses pages that are not offered", () => {
    for (const url of ["/incidents/abc", "/configuration/lists", "/law/requirements", "/dashboard", "/favourites", "/nope", "https://evil.example/incidents/register"]) {
      expect(checkPageForFavourite(url, manager).ok, url).toBe(false);
    }
  });

  it("refuses pages the user can't open", () => {
    expect(checkPageForFavourite("/incidents/new", employee)).toEqual({ ok: false, message: "You can't open this page, so it can't be a favourite." });
    expect(checkPageForFavourite("/risk/assessments", employee).ok).toBe(false);
  });

  it("refuses a page that needs an earlier step, with its explanation", () => {
    const result = checkPageForFavourite("/documents/manage/new?uploadId=u1&title=Risk", manager);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Save as document/);
  });

  it("refuses an address that is too long once cleaned", () => {
    expect(checkPageForFavourite(`/incidents/register?q=${"a".repeat(2100)}`, manager).ok).toBe(false);
  });
});

describe("itemStatus", () => {
  it("is always ok for websites", () => {
    expect(itemStatus("EXTERNAL", "https://www.hsa.ie/", employee)).toEqual({ status: "ok", reason: null });
  });

  it("reports blocked pages with a plain reason", () => {
    expect(itemStatus("PAGE", "/incidents/register", employee)).toEqual({ status: "ok", reason: null });
    expect(itemStatus("PAGE", "/risk/tasks", employee)).toMatchObject({ status: "no-access", reason: expect.stringMatching(/administrator/) });
    expect(itemStatus("PAGE", "/law/tasks", manager)).toMatchObject({ status: "gone" });
    expect(itemStatus("PAGE", "/documents/manage/new?uploadId=u1", manager)).toMatchObject({ status: "needs-previous-step", reason: expect.stringMatching(/24 hours/) });
  });
});
