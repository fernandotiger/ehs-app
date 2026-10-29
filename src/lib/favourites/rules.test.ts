import { describe, expect, it } from "vitest";
import { MODULE_KEYS } from "@/lib/modules";
import { PERMISSIONS as P } from "@/lib/permissions";
import { ROUTES } from "./route-registry";
import {
  bookmarkability,
  cleanPagePath,
  defaultFavouriteTitle,
  describeKept,
  describePageUrl,
  favouriteChips,
  favouriteStatus,
  GONE_REASON,
  matchRoute,
  NO_ACCESS_REASON,
  routeAccess,
  sameFavourite,
  statusReason,
} from "./rules";

const route = (pattern: string) => {
  const entry = ROUTES.find((r) => r.pattern === pattern);
  if (!entry) throw new Error(pattern);
  return entry;
};

const everyone = { permissions: [P.INCIDENT_CREATE, P.DOCUMENTS_MANAGE, P.ACTION_CREATE, P.RISK_CREATE], enabledModules: [...MODULE_KEYS] };
const employee = { permissions: [], enabledModules: ["documents", "incidents"] as const };

describe("cleanPagePath", () => {
  it("keeps relative in-app addresses with sorted keys and no empty values or hash", () => {
    expect(cleanPagePath("/incidents/register?view=investigations&q=forklift&status=&page=2#x")).toBe("/incidents/register?page=2&q=forklift&view=investigations");
    expect(cleanPagePath("/incidents/register/")).toBe("/incidents/register");
    expect(cleanPagePath("/actions")).toBe("/actions");
  });

  it("strips the global one-time / sensitive keys and the route's own one-time keys", () => {
    expect(cleanPagePath("/actions?fav=f1&token=t&password=p&next=/x&open=a&new=1&view=created")).toBe("/actions?view=created");
    expect(cleanPagePath("/documents/manage/new?uploadId=u1&title=Risk%20PDF&description=d")).toBe("/documents/manage/new");
    expect(cleanPagePath("/simplified-law/actions?open=a1&view=all")).toBe("/simplified-law/actions?view=all");
  });

  it("keeps repeated keys and encodes spaces consistently", () => {
    expect(cleanPagePath("/incidents/register?q=fork lift&b=2&b=1")).toBe("/incidents/register?b=2&b=1&q=fork+lift");
  });

  it("refuses absolute, protocol-relative, backslash and too long addresses", () => {
    expect(cleanPagePath("https://evil.example/incidents")).toBeNull();
    expect(cleanPagePath("//evil.example/incidents")).toBeNull();
    expect(cleanPagePath("/\\evil.example")).toBeNull();
    expect(cleanPagePath("javascript:alert(1)")).toBeNull();
    expect(cleanPagePath("incidents/register")).toBeNull();
    expect(cleanPagePath(`/incidents/register?q=${"a".repeat(2000)}`)).toBeNull();
    expect(cleanPagePath(`/incidents/register?q=${"a".repeat(1950)}`)).not.toBeNull();
  });
});

describe("bookmarkability", () => {
  it("offers search and create pages only", () => {
    expect(bookmarkability(route("/incidents/register"), "/incidents/register?view=investigations")).toBe("ok");
    expect(bookmarkability(route("/incidents/new"), "/incidents/new")).toBe("ok");
    expect(bookmarkability(route("/incidents/[id]"), "/incidents/abc")).toBe("not-offered");
    expect(bookmarkability(route("/configuration/lists"), "/configuration/lists")).toBe("not-offered");
    expect(bookmarkability(route("/law/requirements"), "/law/requirements")).toBe("not-offered");
    expect(bookmarkability(null, "/nope")).toBe("not-offered");
  });

  it("needs a previous step when the page was filled in by an earlier step", () => {
    const upload = route("/documents/manage/new");
    expect(bookmarkability(upload, "/documents/manage/new?uploadId=u1&title=x")).toBe("needs-previous-step");
    expect(bookmarkability(upload, "/documents/manage/new?uploadId=")).toBe("ok");
    expect(bookmarkability(upload, "/documents/manage/new")).toBe("ok");
  });

  it("only strips one-time params without a previous step", () => {
    expect(bookmarkability(route("/simplified-law/actions"), "/simplified-law/actions?open=a1")).toBe("ok");
  });
});

describe("routeAccess", () => {
  it("needs the module and any of the page guard's permissions", () => {
    expect(routeAccess(route("/incidents/register"), employee)).toBe(true);
    expect(routeAccess(route("/incidents/new"), employee)).toBe(false);
    expect(routeAccess(route("/incidents/new"), { ...employee, permissions: [P.INCIDENT_CREATE] })).toBe(true);
    expect(routeAccess(route("/incidents/reports"), { ...employee, permissions: [P.INCIDENT_ACTION_VIEW] })).toBe(true);
    expect(routeAccess(route("/risk/assessments"), employee)).toBe(false);
    expect(routeAccess(route("/favourites"), { permissions: [], enabledModules: [] })).toBe(true);
  });
});

describe("favouriteStatus", () => {
  it("is ok for an offered page the user can open", () => {
    expect(favouriteStatus(route("/incidents/register"), employee, "/incidents/register?view=investigations")).toBe("ok");
  });

  it("is no-access when the module was switched off or the permission removed", () => {
    expect(favouriteStatus(route("/risk/tasks"), employee, "/risk/tasks")).toBe("no-access");
    expect(favouriteStatus(route("/incidents/new"), employee, "/incidents/new")).toBe("no-access");
  });

  it("is needs-previous-step when the kept address now needs an earlier step", () => {
    expect(favouriteStatus(route("/documents/manage/new"), everyone, "/documents/manage/new?uploadId=u1")).toBe("needs-previous-step");
  });

  it("is gone when the page no longer exists or is no longer offered", () => {
    expect(favouriteStatus(null, everyone, "/old/page")).toBe("gone");
    expect(favouriteStatus(route("/law/requirements"), everyone, "/law/requirements?view=all")).toBe("gone");
    expect(favouriteStatus(route("/incidents/register"), everyone, "https://evil.example")).toBe("gone");
  });

  it("checks gone before no-access, and no-access before the earlier step", () => {
    expect(favouriteStatus(route("/configuration/lists"), { permissions: [], enabledModules: [] }, "/configuration/lists")).toBe("gone");
    expect(favouriteStatus(route("/documents/manage/new"), employee, "/documents/manage/new?uploadId=u1")).toBe("no-access");
  });

  it("explains each blocked status in plain words", () => {
    expect(statusReason("ok", null)).toBeNull();
    expect(statusReason("no-access", null)).toBe(NO_ACCESS_REASON);
    expect(statusReason("gone", null)).toBe(GONE_REASON);
    expect(statusReason("needs-previous-step", route("/documents/manage/new"))).toMatch(/24 hours/);
  });
});

describe("sameFavourite", () => {
  it("compares cleaned page addresses", () => {
    expect(sameFavourite("/incidents/register?view=investigations&q=a", "/incidents/register?q=a&view=investigations&fav=f1")).toBe(true);
    expect(sameFavourite("/incidents/register?q=a", "/incidents/register?q=b")).toBe(false);
    expect(sameFavourite("/documents/manage/new", "/documents/manage/new?uploadId=u1")).toBe(true);
    expect(sameFavourite("//evil", "//evil")).toBe(false);
  });

  it("compares normalised website addresses", () => {
    expect(sameFavourite("www.hsa.ie", "https://www.hsa.ie/")).toBe(true);
    expect(sameFavourite("https://hsa.ie", "https://www.hsa.ie")).toBe(false);
    expect(sameFavourite("/actions", "https://example.com/actions")).toBe(false);
  });
});

describe("describing a kept page", () => {
  const register = route("/incidents/register");

  it("reads the tab, the search text and the other filters", () => {
    const url = "/incidents/register?view=investigations&q=forklift&status=OPEN&siteId=s1&severity=HIGH&page=3&sort=date&dir=asc";
    expect(describePageUrl(register, url)).toEqual({ tabLabel: "Investigations", search: "forklift", filterCount: 3 });
    expect(describeKept(register, url)).toBe("This page · Investigations tab · search “forklift” + 3 filters");
    expect(favouriteChips(register, url)).toEqual(["Investigations tab", "4 filters"]);
    expect(defaultFavouriteTitle(register, url)).toBe("Incidents register – Investigations");
  });

  it("adds nothing for the default tab, unknown tab values or an empty page", () => {
    expect(describeKept(register, "/incidents/register?view=incidents")).toBe("This page");
    expect(describePageUrl(register, "/incidents/register?view=bogus").tabLabel).toBeNull();
    expect(favouriteChips(register, "/incidents/register")).toEqual([]);
    expect(defaultFavouriteTitle(register, "/incidents/register")).toBe("Incidents register");
    expect(describeKept(register, "/incidents/register?q=spill")).toBe("This page · search “spill”");
    expect(describeKept(register, "/incidents/register?status=OPEN")).toBe("This page · 1 filter");
    expect(favouriteChips(register, "/incidents/register?q=spill")).toEqual(["1 filter"]);
  });

  it("works for pages without tabs", () => {
    expect(describeKept(route("/risk/assessments"), "/risk/assessments?band=ATTENTION&review=due")).toBe("This page · 2 filters");
    expect(matchRoute("/risk/reports")?.tab?.labels["task-summary"]).toBe("Task summary");
  });
});
