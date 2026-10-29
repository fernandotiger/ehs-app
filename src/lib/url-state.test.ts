import { describe, expect, it } from "vitest";
import { z } from "zod";
import { applyUrlPatch, buildUrlSearch, countActiveFilters, parseUrlState, resolveUrlTab, syncSearchText, URL_ALL } from "./url-state";
import { actionListQuerySchema as standaloneActionListQuerySchema } from "./validation/actions";
import { actionListQuerySchema as incidentActionListQuerySchema, incidentListQuerySchema } from "./validation/incidents";
import { assessmentListQuerySchema, taskListQuerySchema } from "./validation/risk";
import { legislationListQuerySchema, actionListQuerySchema as slawActionListQuerySchema } from "./validation/simplified-law";

const schema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(200).optional(),
  status: z.enum(["ACTIVE", "DONE", "CANCELLED", URL_ALL]).default("ACTIVE"),
  sort: z.enum(["dueDate", "reference"]).default("dueDate"),
  siteId: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null)),
  overdue: z.enum(["true", "false"]).optional(),
});

describe("parseUrlState", () => {
  it("returns the defaults for an empty query", () => {
    expect(parseUrlState(schema, "")).toEqual({ page: 1, q: undefined, status: "ACTIVE", sort: "dueDate", siteId: null, overdue: undefined });
  });

  it("reads valid values, including numbers and the all sentinel", () => {
    const state = parseUrlState(schema, "?page=3&q=forklift&status=all&sort=reference&siteId=s1&overdue=true");
    expect(state).toEqual({ page: 3, q: "forklift", status: "all", sort: "reference", siteId: "s1", overdue: "true" });
  });

  it("falls back to the default key by key when a value is invalid or old", () => {
    const state = parseUrlState(schema, "page=0&status=BOGUS&sort=title&overdue=maybe&q=ok");
    expect(state).toEqual({ page: 1, q: "ok", status: "ACTIVE", sort: "dueDate", siteId: null, overdue: undefined });
    expect(parseUrlState(schema, "page=abc").page).toBe(1);
    expect(parseUrlState(schema, "status=").status).toBe("ACTIVE");
  });

  it("accepts URLSearchParams and works with the module list schemas (pageSize omitted)", () => {
    const incidents = incidentListQuerySchema.omit({ pageSize: true });
    const state = parseUrlState(incidents, new URLSearchParams("view=investigations&investigationStatus=OVERDUE&archived=nope"));
    expect(state.view).toBe("investigations");
    expect(state.investigationStatus).toBe("OVERDUE");
    expect(state.archived).toBe("active");
    expect(state.sort).toBe("occurredAt");
    expect("pageSize" in state).toBe(false);
  });
});

describe("buildUrlSearch", () => {
  it("leaves defaults out of the URL", () => {
    expect(buildUrlSearch(schema, "", { status: "ACTIVE", sort: "dueDate", page: 1, siteId: null })).toBe("");
    expect(buildUrlSearch(schema, "status=DONE&sort=reference", { status: "ACTIVE", sort: "dueDate" })).toBe("");
    expect(buildUrlSearch(schema, "", { sort: "reference" })).toBe("sort=reference");
  });

  it("writes the all sentinel only for a cleared filter whose default is not empty and whose schema accepts it", () => {
    expect(buildUrlSearch(schema, "", { status: undefined })).toBe("status=all");
    expect(parseUrlState(schema, buildUrlSearch(schema, "", { status: undefined })).status).toBe(URL_ALL);
    // sort has a default but no `all` value → cleared means default → left out
    expect(buildUrlSearch(schema, "sort=reference", { sort: undefined })).toBe("");
    // empty default → cleared means removed
    expect(buildUrlSearch(schema, "overdue=true", { overdue: undefined })).toBe("");
    expect(buildUrlSearch(schema, "siteId=s1", { siteId: null })).toBe("");
  });

  it("drops values the schema rejects instead of writing them", () => {
    expect(buildUrlSearch(schema, "status=DONE", { status: "BOGUS" as never })).toBe("");
  });

  it("resets the page when a filter changes, but not when only the page changes", () => {
    expect(buildUrlSearch(schema, "page=4&status=DONE", { status: "CANCELLED" })).toBe("status=CANCELLED");
    expect(buildUrlSearch(schema, "status=DONE", { page: 2 })).toBe("status=DONE&page=2");
    expect(buildUrlSearch(schema, "status=DONE&page=2", { page: 1 })).toBe("status=DONE");
    // an unchanged filter keeps the page
    expect(buildUrlSearch(schema, "page=4&status=DONE", { status: "DONE" })).toBe("page=4&status=DONE");
    // custom reset keys
    expect(buildUrlSearch(schema, "page=4&status=DONE", { status: "CANCELLED" }, { resetKeys: [] })).toBe("page=4&status=CANCELLED");
  });

  it("preserves params the schema does not know", () => {
    expect(buildUrlSearch(schema, "profile=p1&fav=abc&status=DONE", { q: "fire" })).toBe("profile=p1&fav=abc&status=DONE&q=fire");
  });

  it("does not clobber when two patches are applied in the same tick", () => {
    // Each write starts from the URL as it is at write time (window.location.search in the hook).
    let url = "view=assigned";
    url = buildUrlSearch(schema, url, { status: "DONE" });
    url = buildUrlSearch(schema, url, { overdue: "true" });
    expect(parseUrlState(schema, url)).toMatchObject({ status: "DONE", overdue: "true" });
    expect(url).toBe("view=assigned&status=DONE&overdue=true");
  });

  it("round-trips the standalone actions deep links", () => {
    const actions = standaloneActionListQuerySchema.omit({ pageSize: true });
    const state = parseUrlState(actions, "view=assigned&overdue=true");
    expect(state.view).toBe("assigned");
    expect(state.overdue).toBe("true");
    // "Any status" uses the schema's own ALL value; clearing to the default leaves it out
    expect(buildUrlSearch(actions, "status=ALL", { status: "ACTIVE" })).toBe("");
    expect(buildUrlSearch(actions, "", { status: "ALL" })).toBe("status=ALL");
  });
});

describe("existing deep links still parse", () => {
  it("incident actions, risk registers and Simplified law", () => {
    const incidentActions = incidentActionListQuerySchema.omit({ pageSize: true });
    expect(parseUrlState(incidentActions, "state=AWAITING_EFFECTIVENESS").state).toBe("AWAITING_EFFECTIVENESS");
    expect(parseUrlState(incidentActions, "state=ACTIVE").state).toBe("ACTIVE");
    const assessments = assessmentListQuerySchema.omit({ pageSize: true, relatedTo: true });
    expect(parseUrlState(assessments, "band=ATTENTION")).toMatchObject({ band: "ATTENTION", status: "ACTIVE" });
    expect(parseUrlState(assessments, "review=due").review).toBe("due");
    expect(parseUrlState(taskListQuerySchema.omit({ pageSize: true }), "overdue=true").overdue).toBe("true");
    const legislation = legislationListQuerySchema.pick({ page: true, q: true, check: true }).extend({ category: legislationListQuerySchema.shape.categoryId });
    expect(parseUrlState(legislation, "category=c1&check=NOT_COMPLIANT")).toMatchObject({ category: "c1", check: "NOT_COMPLIANT", page: 1 });
    expect(parseUrlState(slawActionListQuerySchema.omit({ pageSize: true }), "view=all&open=r1").view).toBe("all");
  });
});

describe("applyUrlPatch", () => {
  it("sets, removes and keeps order; resets only on real changes", () => {
    expect(applyUrlPatch("a=1&page=3", { b: "2" })).toBe("a=1&b=2");
    expect(applyUrlPatch("a=1&page=3", { a: "1" })).toBe("a=1&page=3");
    expect(applyUrlPatch("a=1&open=x", { open: null }, [])).toBe("a=1");
    expect(applyUrlPatch("?q=old&page=2", { q: "  new " })).toBe("q=new");
  });
});

describe("resolveUrlTab", () => {
  const tabs = ["objectives", "targets", "programmes"] as const;
  it("uses the URL value when allowed", () => {
    expect(resolveUrlTab("targets", "objectives", tabs)).toBe("targets");
  });
  it("falls back to the fallback for a missing or unknown tab", () => {
    expect(resolveUrlTab(null, "objectives", tabs)).toBe("objectives");
    expect(resolveUrlTab("gone", "objectives", tabs)).toBe("objectives");
  });
  it("falls back to the first allowed tab when the saved tab and the fallback are no longer visible", () => {
    expect(resolveUrlTab("targets", "objectives", ["programmes"])).toBe("programmes");
  });
  it("accepts any value when no allowed list is given", () => {
    expect(resolveUrlTab("anything", "objectives")).toBe("anything");
    expect(resolveUrlTab("", "objectives")).toBe("objectives");
  });
});

describe("syncSearchText", () => {
  it("leaves the box alone when its own write comes back, even mid-typing", () => {
    const typing = { text: "forklift", seen: "", written: "fork" };
    expect(syncSearchText(typing, "fork")).toEqual({ text: "forklift", seen: "fork", written: null });
  });
  it("takes outside changes: a link clears the box, Back brings the earlier search back", () => {
    const afterWrite = { text: "forklift", seen: "forklift", written: null };
    const cleared = syncSearchText(afterWrite, "");
    expect(cleared.text).toBe("");
    expect(syncSearchText(cleared, "forklift").text).toBe("forklift");
  });
  it("keeps a trailing space the user is typing when the URL already matches", () => {
    expect(syncSearchText({ text: "slip ", seen: "", written: null }, "slip").text).toBe("slip ");
  });
  it("returns the same object when the URL did not change", () => {
    const s = { text: "a", seen: "a", written: null };
    expect(syncSearchText(s, "a")).toBe(s);
  });
});

describe("countActiveFilters", () => {
  it("ignores view, page, sort and dir", () => {
    const state = parseUrlState(schema, "page=3&sort=reference&q=x&overdue=true");
    expect(countActiveFilters(state, schema)).toBe(2);
    expect(countActiveFilters(parseUrlState(schema, "page=2"), schema)).toBe(0);
  });
});
