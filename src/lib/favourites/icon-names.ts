/**
 * Icons a favourite tile may use (lucide-react canonical names). Shared by the server (validation)
 * and the client; the components, labels, search words and groups live in the client-only
 * `icon-map.tsx`, which must have an entry for every name here (enforced by its `Record<IconName, …>` type).
 *
 * Use lucide's canonical names (e.g. "ChartColumn", not the old alias "BarChart3") so a stored name
 * keeps working when lucide drops its aliases.
 */
export const ICON_NAMES = [
  // Safety
  "ShieldAlert", "ShieldCheck", "HardHat", "Flame", "FireExtinguisher", "Siren", "TriangleAlert", "OctagonAlert", "Zap",
  "Construction", "Radiation", "Biohazard", "Skull", "TrafficCone", "LifeBuoy", "Lock", "Eye", "Footprints",
  // Health
  "HeartPulse", "Heart", "Stethoscope", "Cross", "Syringe", "Pill", "Activity", "Brain", "Thermometer", "Ambulance", "Accessibility",
  // Environment
  "Leaf", "Recycle", "Droplet", "Droplets", "Wind", "Sun", "CloudRain", "Trees", "Sprout", "WavesHorizontal", "Fuel", "Trash", "FlaskConical",
  // Documents
  "FileText", "FileStack", "FilePlusCorner", "FileCheck", "FileSearch", "FileUp", "Folder", "FolderOpen", "BookOpen", "BookOpenCheck",
  "Library", "ClipboardList", "ClipboardCheck", "ClipboardPen", "ClipboardPlus", "NotebookPen", "ScrollText", "SquarePen", "Printer",
  "Archive", "Paperclip", "Scale", "Gavel", "Landmark",
  // People
  "User", "Users", "UserCheck", "UserPlus", "Contact", "IdCard", "GraduationCap", "Handshake", "PersonStanding", "MessagesSquare",
  "Mail", "Phone", "Megaphone",
  // Places
  "Factory", "Warehouse", "Ship", "Anchor", "Truck", "Forklift", "Container", "BuildingComplex", "House", "Store", "MapPin",
  "MapPinned", "Map", "Plane", "Car", "TrainFront",
  // Work & dates
  "Calendar", "CalendarCheck", "CalendarClock", "Clock", "Timer", "Hourglass", "ListTodo", "ListChecks", "SquareCheckBig",
  "SquarePlus", "Briefcase", "Inbox", "Target", "Flag", "Bell", "Wrench", "Hammer", "Settings", "SlidersHorizontal", "Tag",
  "QrCode", "ScanLine",
  // Charts
  "ChartColumn", "ChartLine", "ChartPie", "TrendingUp", "TrendingDown", "Gauge", "LayoutDashboard", "Table", "Calculator",
  // Links
  "Globe", "Link", "ExternalLink", "Bookmark", "BookmarkCheck", "Star", "Pin", "Compass",
  // General
  "Sparkles", "Lightbulb", "Info", "CircleQuestionMark", "Package", "Camera", "Laptop", "Key", "Award", "Trophy", "ThumbsUp", "Layers",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Default icon of a website link. */
export const EXTERNAL_LINK_ICON: IconName = "Globe";
/** Fallback when a page has no registry entry any more. */
export const FALLBACK_PAGE_ICON: IconName = "Star";

export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && (ICON_NAMES as readonly string[]).includes(value);
}
