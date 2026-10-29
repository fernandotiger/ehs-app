import { describe, expect, it } from "vitest";
import { favouriteView } from "./view";

describe("favouriteView", () => {
  it("shows a page with its module, menu icon, tab and filter chips", () => {
    const view = favouriteView({ id: "f1", kind: "PAGE", url: "/incidents/register?q=forklift&status=OPEN&view=investigations", hasSnapshot: false });
    expect(view).toMatchObject({ external: false, defaultIcon: "TriangleAlert", subtitle: "Incidents · Incidents register", chips: ["Investigations tab", "2 filters"], href: "/incidents/register?q=forklift&status=OPEN&view=investigations" });
  });

  it("opens a create page with typed details through ?fav=<id>", () => {
    const view = favouriteView({ id: "f2", kind: "PAGE", url: "/incidents/new", hasSnapshot: true });
    expect(view.href).toBe("/incidents/new?fav=f2");
    expect(view.chips).toEqual(["Your typed details"]);
    expect(favouriteView({ id: "f3", kind: "PAGE", url: "/actions?view=created", hasSnapshot: true }).href).toBe("/actions?view=created&fav=f3");
  });

  it("shows a website with the Globe icon and its host", () => {
    expect(favouriteView({ id: "f4", kind: "EXTERNAL", url: "https://www.hsa.ie/eng/", hasSnapshot: false })).toMatchObject({ external: true, defaultIcon: "Globe", subtitle: "Website · hsa.ie", chips: [], href: "https://www.hsa.ie/eng/" });
  });

  it("falls back for pages that no longer exist", () => {
    expect(favouriteView({ id: "f5", kind: "PAGE", url: "/old/page", hasSnapshot: false })).toMatchObject({ entry: null, defaultIcon: "Star", subtitle: "Page" });
  });
});
