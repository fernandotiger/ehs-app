import { afterEach, describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/favourites/route-registry";
import { emptyCapture, EMPTY_FORM_LINE, summariseCapture, TYPED_KEPT_LINE } from "./capture-summary";
import { readFavouriteCapture, registerFavouriteCapture } from "./use-favourite-capture";

const route = (pattern: string) => ROUTES.find((r) => r.pattern === pattern)!;
const cleanups: (() => void)[] = [];
const register = (...args: Parameters<typeof registerFavouriteCapture>) => cleanups.push(registerFavouriteCapture(...args));

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("capture store", () => {
  it("is empty until a form registers, and the last registration wins", () => {
    expect(readFavouriteCapture()).toBeNull();
    register("action.create", () => ({ title: "A" }));
    register("incident.report", () => ({ title: "B" }));
    expect(readFavouriteCapture()).toEqual({ key: "incident.report", disabled: false, values: { title: "B" } });
    cleanups.pop()!();
    expect(readFavouriteCapture()).toEqual({ key: "action.create", disabled: false, values: { title: "A" } });
  });

  it("reports a disabled source without reading it", () => {
    register("incident.report", () => {
      throw new Error("must not be read");
    }, "anonymous");
    expect(readFavouriteCapture()).toEqual({ key: "incident.report", disabled: "anonymous" });
  });

  it("treats a failing read as unavailable", () => {
    register("action.create", () => {
      throw new Error("boom");
    });
    expect(readFavouriteCapture()).toEqual({ key: "action.create", disabled: "unavailable" });
  });
});

describe("summariseCapture", () => {
  it("describes a search page from its address", () => {
    expect(summariseCapture(route("/incidents/register"), "/incidents/register?q=a&view=investigations")).toEqual({ snapshot: null, kept: "This page · Investigations tab · search “a”", note: null });
  });

  it("saves a create page empty when no form registered or the key differs", () => {
    expect(summariseCapture(route("/incidents/new"), "/incidents/new")).toEqual({ snapshot: null, kept: EMPTY_FORM_LINE, note: null });
    register("action.create", () => ({ title: "x" }));
    expect(summariseCapture(route("/incidents/new"), "/incidents/new").snapshot).toBeNull();
  });

  it("keeps the sanitised typed values of the matching form", () => {
    register("incident.report", () => ({ title: "Spill", clientId: "c1", photo: new Blob(["x"]) }));
    expect(summariseCapture(route("/incidents/new"), "/incidents/new")).toEqual({ snapshot: { title: "Spill" }, kept: TYPED_KEPT_LINE, note: null });
  });

  it("saves the page empty with a note for anonymous reports and over-long values", () => {
    register("incident.report", () => ({ title: "x" }), "anonymous");
    expect(summariseCapture(route("/incidents/new"), "/incidents/new")).toMatchObject({ snapshot: null, kept: EMPTY_FORM_LINE, note: expect.stringMatching(/anonymously/) });
    cleanups.pop()!();
    register("incident.report", () => ({ title: "a".repeat(20_000) }));
    expect(summariseCapture(route("/incidents/new"), "/incidents/new")).toMatchObject({ snapshot: null, note: expect.stringMatching(/too long/) });
  });

  it("gives the empty version of a page", () => {
    expect(emptyCapture(route("/documents/manage/new"), "/documents/manage/new")).toEqual({ snapshot: null, kept: EMPTY_FORM_LINE, note: null });
  });
});
