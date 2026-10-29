/**
 * Favourite tile colours. The stored value is the name (`Favourite.color`); null means "default",
 * which follows the company's brand colour (`--brand*` CSS variables set from tenant branding).
 * Class strings are written out in full so Tailwind picks them up. Status colours (success,
 * warning, danger) keep their meaning elsewhere – these are decoration only.
 */
export const TILE_COLOUR_NAMES = ["default", "blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "grey"] as const;

export type TileColourName = (typeof TILE_COLOUR_NAMES)[number];

export interface TileColour {
  name: TileColourName;
  /** Plain word for the swatch's aria-label and tooltip. */
  label: string;
  /** Icon circle: background + icon colour. */
  circle: string;
  /** Thin accent bar on the tile. */
  accent: string;
  /** Faint background wash of the tile. */
  tint: string;
  /** Round swatch in the colour picker. */
  swatch: string;
}

export const TILE_COLOURS: Record<TileColourName, TileColour> = {
  default: { name: "default", label: "Default (company colour)", circle: "bg-brand-soft text-brand", accent: "bg-brand", tint: "from-brand-soft/60", swatch: "bg-brand" },
  blue: { name: "blue", label: "Blue", circle: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300", accent: "bg-blue-500", tint: "from-blue-50 dark:from-blue-500/10", swatch: "bg-blue-500" },
  teal: { name: "teal", label: "Teal", circle: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300", accent: "bg-teal-500", tint: "from-teal-50 dark:from-teal-500/10", swatch: "bg-teal-500" },
  green: { name: "green", label: "Green", circle: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300", accent: "bg-green-600", tint: "from-green-50 dark:from-green-500/10", swatch: "bg-green-600" },
  amber: { name: "amber", label: "Amber", circle: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", accent: "bg-amber-500", tint: "from-amber-50 dark:from-amber-500/10", swatch: "bg-amber-500" },
  orange: { name: "orange", label: "Orange", circle: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300", accent: "bg-orange-500", tint: "from-orange-50 dark:from-orange-500/10", swatch: "bg-orange-500" },
  red: { name: "red", label: "Red", circle: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300", accent: "bg-red-500", tint: "from-red-50 dark:from-red-500/10", swatch: "bg-red-500" },
  pink: { name: "pink", label: "Pink", circle: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300", accent: "bg-pink-500", tint: "from-pink-50 dark:from-pink-500/10", swatch: "bg-pink-500" },
  purple: { name: "purple", label: "Purple", circle: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300", accent: "bg-purple-500", tint: "from-purple-50 dark:from-purple-500/10", swatch: "bg-purple-500" },
  grey: { name: "grey", label: "Grey", circle: "bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-200", accent: "bg-slate-500", tint: "from-slate-100 dark:from-slate-500/10", swatch: "bg-slate-500" },
};

export function isTileColourName(value: unknown): value is TileColourName {
  return typeof value === "string" && (TILE_COLOUR_NAMES as readonly string[]).includes(value);
}

/** The tile colour for a stored value; unknown or null → default (brand). */
export function tileColour(value: string | null | undefined): TileColour {
  return isTileColourName(value) ? TILE_COLOURS[value] : TILE_COLOURS.default;
}
