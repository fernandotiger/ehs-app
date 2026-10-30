"use client";

import {
  Accessibility, Activity, Ambulance, Anchor, Archive, Award, Bell, Biohazard, BookOpen, BookOpenCheck, Bookmark, BookmarkCheck, Brain,
  Briefcase, BuildingComplex, Calculator, Calendar, CalendarCheck, CalendarClock, Camera, Car, ChartColumn, ChartLine, ChartPie,
  CircleQuestionMark, ClipboardCheck, ClipboardList, ClipboardPen, ClipboardPlus, Clock, CloudRain, Compass, Construction, Contact,
  Container, Cross, Droplet, Droplets, ExternalLink, Eye, Factory, FileCheck, FilePlusCorner, FileSearch, FileStack, FileText, FileUp,
  FireExtinguisher, Flag, FlaskConical, Flame, Folder, FolderOpen, Footprints, Forklift, Fuel, Gauge, Gavel, Globe, GraduationCap,
  Hammer, Handshake, HardHat, Heart, HeartPulse, Hourglass, House, IdCard, Inbox, Info, Key, Landmark, Laptop, Layers, LayoutDashboard,
  Leaf, Library, LifeBuoy, Lightbulb, Link, ListChecks, ListTodo, Lock, Mail, Map, MapPin, MapPinned, Megaphone, MessagesSquare,
  NotebookPen, OctagonAlert, Package, Paperclip, PersonStanding, Phone, Pill, Pin, Plane, Printer, QrCode, Radiation, Recycle, Scale,
  ScanLine, ScrollText, Settings, ShieldAlert, ShieldCheck, Ship, Siren, Skull, SlidersHorizontal, Sparkles, Sprout, SquareCheckBig,
  SquarePen, SquarePlus, Star, Stethoscope, Store, Sun, Syringe, Table, Tag, Target, Thermometer, ThumbsUp, Timer, TrafficCone, TrainFront,
  Trash, Trees, TrendingDown, TrendingUp, TriangleAlert, Trophy, Truck, User, UserCheck, UserPlus, Users, Warehouse, WavesHorizontal, Wind,
  Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { FALLBACK_PAGE_ICON, isIconName, type IconName } from "@/lib/favourites/icon-names";
import { cn } from "@/lib/utils";

/**
 * Client-only icon library for favourite tiles: a curated STATIC map (no `lucide-react/dynamic`, so
 * the bundle holds exactly these icons). Each icon has a plain label and search words for the picker.
 */

export const ICON_GROUPS = [
  { key: "safety", label: "Safety" },
  { key: "health", label: "Health" },
  { key: "environment", label: "Environment" },
  { key: "documents", label: "Documents" },
  { key: "people", label: "People" },
  { key: "places", label: "Places" },
  { key: "work", label: "Work & dates" },
  { key: "charts", label: "Charts" },
  { key: "links", label: "Links" },
  { key: "general", label: "General" },
] as const;

export type IconGroupKey = (typeof ICON_GROUPS)[number]["key"];

export interface IconMeta {
  icon: LucideIcon;
  label: string;
  /** Extra search words (the label is searched too). */
  words: string;
  group: IconGroupKey;
}

const i = (icon: LucideIcon, group: IconGroupKey, label: string, words = ""): IconMeta => ({ icon, label, words, group });

export const ICONS: Record<IconName, IconMeta> = {
  // Safety
  ShieldAlert: i(ShieldAlert, "safety", "Shield alert", "safety incident warning protect"),
  ShieldCheck: i(ShieldCheck, "safety", "Shield check", "safety safe protected risk ok"),
  HardHat: i(HardHat, "safety", "Hard hat", "helmet ppe construction worker"),
  Flame: i(Flame, "safety", "Flame", "fire hot burn"),
  FireExtinguisher: i(FireExtinguisher, "safety", "Fire extinguisher", "fire emergency"),
  Siren: i(Siren, "safety", "Siren", "alarm emergency alert"),
  TriangleAlert: i(TriangleAlert, "safety", "Warning", "alert danger hazard incident"),
  OctagonAlert: i(OctagonAlert, "safety", "Stop", "alert danger stop"),
  Zap: i(Zap, "safety", "Electricity", "electric power lightning shock"),
  Construction: i(Construction, "safety", "Roadworks", "construction barrier works"),
  Radiation: i(Radiation, "safety", "Radiation", "nuclear hazard"),
  Biohazard: i(Biohazard, "safety", "Biohazard", "biological hazard chemical"),
  Skull: i(Skull, "safety", "Toxic", "poison danger skull death"),
  TrafficCone: i(TrafficCone, "safety", "Traffic cone", "cone road works"),
  LifeBuoy: i(LifeBuoy, "safety", "Life buoy", "rescue water help boat"),
  Lock: i(Lock, "safety", "Lock", "lockout secure padlock"),
  Eye: i(Eye, "safety", "Eye", "vision see observe inspection"),
  Footprints: i(Footprints, "safety", "Footprints", "walk slip trip floor"),
  // Health
  HeartPulse: i(HeartPulse, "health", "Heart pulse", "health medical wellbeing"),
  Heart: i(Heart, "health", "Heart", "health love care favourite"),
  Stethoscope: i(Stethoscope, "health", "Stethoscope", "doctor medical health check"),
  Cross: i(Cross, "health", "First aid", "cross medical aid"),
  Syringe: i(Syringe, "health", "Syringe", "injection vaccine needle"),
  Pill: i(Pill, "health", "Pill", "medicine tablet drug"),
  Activity: i(Activity, "health", "Activity", "pulse monitor health"),
  Brain: i(Brain, "health", "Brain", "mental health stress mind"),
  Thermometer: i(Thermometer, "health", "Thermometer", "temperature heat cold"),
  Ambulance: i(Ambulance, "health", "Ambulance", "emergency hospital"),
  Accessibility: i(Accessibility, "health", "Accessibility", "disability wheelchair access"),
  // Environment
  Leaf: i(Leaf, "environment", "Leaf", "environment nature green"),
  Recycle: i(Recycle, "environment", "Recycle", "waste recycling environment"),
  Droplet: i(Droplet, "environment", "Drop", "water oil liquid spill"),
  Droplets: i(Droplets, "environment", "Drops", "water rain spill"),
  Wind: i(Wind, "environment", "Wind", "air emissions weather"),
  Sun: i(Sun, "environment", "Sun", "weather heat energy solar"),
  CloudRain: i(CloudRain, "environment", "Rain", "weather storm water"),
  Trees: i(Trees, "environment", "Trees", "forest nature environment"),
  Sprout: i(Sprout, "environment", "Sprout", "plant growth biodiversity"),
  WavesHorizontal: i(WavesHorizontal, "environment", "Waves", "sea water river flood"),
  Fuel: i(Fuel, "environment", "Fuel", "petrol diesel energy"),
  Trash: i(Trash, "environment", "Bin", "waste rubbish trash"),
  FlaskConical: i(FlaskConical, "environment", "Chemical flask", "chemical lab substance coshh"),
  // Documents
  FileText: i(FileText, "documents", "Document", "file paper policy"),
  FileStack: i(FileStack, "documents", "Documents", "files library"),
  FilePlusCorner: i(FilePlusCorner, "documents", "New document", "file add report"),
  FileCheck: i(FileCheck, "documents", "Approved document", "file check signed"),
  FileSearch: i(FileSearch, "documents", "Find document", "file search investigation"),
  FileUp: i(FileUp, "documents", "Upload document", "file upload"),
  Folder: i(Folder, "documents", "Folder", "files"),
  FolderOpen: i(FolderOpen, "documents", "Open folder", "files"),
  BookOpen: i(BookOpen, "documents", "Book", "read manual guide"),
  BookOpenCheck: i(BookOpenCheck, "documents", "Read and understood", "book acknowledge"),
  Library: i(Library, "documents", "Library", "books register legislation"),
  ClipboardList: i(ClipboardList, "documents", "Clipboard list", "checklist assessment register response form survey"),
  ClipboardCheck: i(ClipboardCheck, "documents", "Clipboard check", "checklist audit inspection induction response form"),
  ClipboardPen: i(ClipboardPen, "documents", "Clipboard pen", "form fill write"),
  ClipboardPlus: i(ClipboardPlus, "documents", "New checklist", "clipboard add assessment"),
  NotebookPen: i(NotebookPen, "documents", "Notebook", "notes write log"),
  ScrollText: i(ScrollText, "documents", "Scroll", "law regulation text"),
  SquarePen: i(SquarePen, "documents", "Edit", "write pen form"),
  Printer: i(Printer, "documents", "Printer", "print"),
  Archive: i(Archive, "documents", "Archive", "box store old"),
  Paperclip: i(Paperclip, "documents", "Attachment", "paperclip file"),
  Scale: i(Scale, "documents", "Scales of justice", "law legal compliance"),
  Gavel: i(Gavel, "documents", "Gavel", "law court legal"),
  Landmark: i(Landmark, "documents", "Government", "authority regulator public"),
  // People
  User: i(User, "people", "Person", "user employee"),
  Users: i(Users, "people", "People", "team group staff"),
  UserCheck: i(UserCheck, "people", "Person checked", "approved trained"),
  UserPlus: i(UserPlus, "people", "Add person", "new starter induction"),
  Contact: i(Contact, "people", "Contact card", "address book"),
  IdCard: i(IdCard, "people", "ID card", "badge identity visitor"),
  GraduationCap: i(GraduationCap, "people", "Training", "learning course education"),
  Handshake: i(Handshake, "people", "Handshake", "contractor agreement partner"),
  PersonStanding: i(PersonStanding, "people", "Person standing", "human body ergonomics"),
  MessagesSquare: i(MessagesSquare, "people", "Messages", "chat talk comments"),
  Mail: i(Mail, "people", "Email", "mail letter"),
  Phone: i(Phone, "people", "Phone", "call telephone"),
  Megaphone: i(Megaphone, "people", "Announcement", "megaphone toolbox talk"),
  // Places
  Factory: i(Factory, "places", "Factory", "plant site manufacturing"),
  Warehouse: i(Warehouse, "places", "Warehouse", "storage depot"),
  Ship: i(Ship, "places", "Ship", "boat port vessel"),
  Anchor: i(Anchor, "places", "Anchor", "port boat harbour marine"),
  Truck: i(Truck, "places", "Truck", "lorry vehicle transport delivery"),
  Forklift: i(Forklift, "places", "Forklift", "lift truck warehouse"),
  Container: i(Container, "places", "Container", "shipping port cargo"),
  BuildingComplex: i(BuildingComplex, "places", "Offices", "building office"),
  House: i(House, "places", "House", "home"),
  Store: i(Store, "places", "Shop", "store retail"),
  MapPin: i(MapPin, "places", "Location", "pin place"),
  MapPinned: i(MapPinned, "places", "Map pin", "location site"),
  Map: i(Map, "places", "Map", "site plan"),
  Plane: i(Plane, "places", "Plane", "travel airport flight"),
  Car: i(Car, "places", "Car", "vehicle driving road"),
  TrainFront: i(TrainFront, "places", "Train", "rail transport"),
  // Work & dates
  Calendar: i(Calendar, "work", "Calendar", "date schedule"),
  CalendarCheck: i(CalendarCheck, "work", "Calendar check", "done date review"),
  CalendarClock: i(CalendarClock, "work", "Due date", "deadline schedule"),
  Clock: i(Clock, "work", "Clock", "time hours"),
  Timer: i(Timer, "work", "Timer", "time stopwatch"),
  Hourglass: i(Hourglass, "work", "Hourglass", "waiting time overdue"),
  ListTodo: i(ListTodo, "work", "To-do list", "tasks actions"),
  ListChecks: i(ListChecks, "work", "Checklist", "tasks actions done"),
  SquareCheckBig: i(SquareCheckBig, "work", "Check box", "done action task"),
  SquarePlus: i(SquarePlus, "work", "Add", "new create plus"),
  Briefcase: i(Briefcase, "work", "Briefcase", "work business job"),
  Inbox: i(Inbox, "work", "Inbox", "my work tray"),
  Target: i(Target, "work", "Target", "goal objective"),
  Flag: i(Flag, "work", "Flag", "milestone mark priority"),
  Bell: i(Bell, "work", "Bell", "reminder notification"),
  Wrench: i(Wrench, "work", "Wrench", "maintenance tool repair"),
  Hammer: i(Hammer, "work", "Hammer", "tool build"),
  Settings: i(Settings, "work", "Settings", "cog gear"),
  SlidersHorizontal: i(SlidersHorizontal, "work", "Sliders", "settings filters options"),
  Tag: i(Tag, "work", "Tag", "label category"),
  QrCode: i(QrCode, "work", "QR code", "scan code equipment"),
  ScanLine: i(ScanLine, "work", "Scan", "qr barcode"),
  // Charts
  ChartColumn: i(ChartColumn, "charts", "Bar chart", "report statistics chart"),
  ChartLine: i(ChartLine, "charts", "Line chart", "trend report"),
  ChartPie: i(ChartPie, "charts", "Pie chart", "report share"),
  TrendingUp: i(TrendingUp, "charts", "Trending up", "increase growth"),
  TrendingDown: i(TrendingDown, "charts", "Trending down", "decrease reduction"),
  Gauge: i(Gauge, "charts", "Gauge", "overview dashboard kpi"),
  LayoutDashboard: i(LayoutDashboard, "charts", "Dashboard", "home overview"),
  Table: i(Table, "charts", "Table", "register list spreadsheet"),
  Calculator: i(Calculator, "charts", "Calculator", "sum numbers score"),
  // Links
  Globe: i(Globe, "links", "Globe", "website web internet world"),
  Link: i(Link, "links", "Link", "url web chain"),
  ExternalLink: i(ExternalLink, "links", "External link", "website open"),
  Bookmark: i(Bookmark, "links", "Bookmark", "favourite save"),
  BookmarkCheck: i(BookmarkCheck, "links", "Bookmark check", "favourite saved"),
  Star: i(Star, "links", "Star", "favourite"),
  Pin: i(Pin, "links", "Pin", "pinned"),
  Compass: i(Compass, "links", "Compass", "explore direction"),
  // General
  Sparkles: i(Sparkles, "general", "Sparkles", "new magic clean"),
  Lightbulb: i(Lightbulb, "general", "Light bulb", "idea suggestion improvement"),
  Info: i(Info, "general", "Information", "info help"),
  CircleQuestionMark: i(CircleQuestionMark, "general", "Question", "help faq"),
  Package: i(Package, "general", "Package", "box parcel delivery"),
  Camera: i(Camera, "general", "Camera", "photo picture"),
  Laptop: i(Laptop, "general", "Laptop", "computer it"),
  Key: i(Key, "general", "Key", "access permit"),
  Award: i(Award, "general", "Award", "certificate badge"),
  Trophy: i(Trophy, "general", "Trophy", "winner success"),
  ThumbsUp: i(ThumbsUp, "general", "Thumbs up", "good like approve"),
  Layers: i(Layers, "general", "Layers", "stack levels"),
};

/** The icon for a stored name; unknown or missing names fall back to the default. */
export function iconFor(name: string | null | undefined, fallback: IconName = FALLBACK_PAGE_ICON): LucideIcon {
  if (isIconName(name)) return ICONS[name].icon;
  return ICONS[fallback].icon;
}

export function FavouriteIcon({ name, fallback, className }: { name: string | null | undefined; fallback?: IconName; className?: string }) {
  const Icon = ICONS[isIconName(name) ? name : (fallback ?? FALLBACK_PAGE_ICON)].icon;
  return <Icon className={cn("size-5", className)} aria-hidden />;
}
