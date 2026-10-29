import * as lucide from "lucide-react";
import { describe, expect, it } from "vitest";
import { TILE_COLOUR_NAMES, TILE_COLOURS, tileColour } from "./colours";
import { EXTERNAL_LINK_ICON, FALLBACK_PAGE_ICON, ICON_NAMES, isIconName } from "./icon-names";

describe("icon names", () => {
  it("lists about 140 distinct icons", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(130);
    expect(ICON_NAMES.length).toBeLessThanOrEqual(160);
  });

  it("uses lucide-react icons that exist, by their canonical (non-alias) name", () => {
    const icons = lucide as unknown as Record<string, { displayName?: string } | undefined>;
    for (const name of ICON_NAMES) {
      expect(icons[name], name).toBeDefined();
      expect(icons[name]?.displayName, name).toBe(name);
    }
  });

  it("includes the defaults and validates names", () => {
    expect(ICON_NAMES).toContain(EXTERNAL_LINK_ICON);
    expect(ICON_NAMES).toContain(FALLBACK_PAGE_ICON);
    expect(isIconName("Globe")).toBe(true);
    expect(isIconName("BarChart3")).toBe(false);
    expect(isIconName("<script>")).toBe(false);
    expect(isIconName(null)).toBe(false);
  });
});

describe("tile colours", () => {
  it("has the ten colours of the brief, Default first, with a plain label each", () => {
    expect(TILE_COLOUR_NAMES).toEqual(["default", "blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "grey"]);
    for (const name of TILE_COLOUR_NAMES) expect(TILE_COLOURS[name].label).toMatch(/^[A-Z]/);
    expect(TILE_COLOURS.default.circle).toContain("brand");
  });

  it("falls back to Default for null or unknown names", () => {
    expect(tileColour(null).name).toBe("default");
    expect(tileColour("magenta").name).toBe("default");
    expect(tileColour("teal").name).toBe("teal");
  });
});
