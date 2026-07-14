import {
  BookOpen,
  Cloud,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GraduationCap,
  Inbox,
  Lightbulb,
  Mail,
  NotebookTabs,
  Presentation,
} from "lucide-react";
import calendarIcon from "../assets/google-workspace/calendar.png";
import docsIcon from "../assets/google-workspace/docs.png";
import driveIcon from "../assets/google-workspace/drive.png";
import formsIcon from "../assets/google-workspace/forms.png";
import gmailIcon from "../assets/google-workspace/gmail.png";
import sheetsIcon from "../assets/google-workspace/sheets.png";
import slidesIcon from "../assets/google-workspace/slides.png";
import { integrationIconSrcById } from "./integrationIcons";
import type { DockItem } from "../types";

export const dockItems: DockItem[] = [
  {
    id: "obsidian",
    label: "Obsidian",
    actionId: "obsidian.open",
    brand: "obsidian",
    iconSrc: integrationIconSrcById.obsidian,
    launchMode: "direct",
    status: "ready",
    statusLabel: "Ready",
  },
  {
    id: "codex",
    label: "Codex",
    actionId: "codex.open",
    iconSrc: integrationIconSrcById.codex,
    brand: "codex",
    launchMode: "direct",
    status: "ready",
    statusLabel: "Ready",
  },
  {
    id: "microsoft",
    label: "Microsoft",
    brand: "microsoft",
    iconSrc: integrationIconSrcById.microsoft,
    launchMode: "menu",
    status: "ready",
    statusLabel: "Local",
    menu: [
      { id: "word", label: "Word", actionId: "microsoft.word", badge: "Local", helper: "Open Microsoft Word", icon: FileText },
      { id: "excel", label: "Excel", actionId: "microsoft.excel", badge: "Local", helper: "Open Microsoft Excel", icon: FileSpreadsheet },
      {
        id: "powerpoint",
        label: "PowerPoint",
        actionId: "microsoft.powerpoint",
        badge: "Local",
        helper: "Open Microsoft PowerPoint",
        icon: Presentation,
      },
      { id: "outlook", label: "Outlook", actionId: "microsoft.outlook", badge: "Local", helper: "Open Microsoft Outlook", icon: Mail },
      { id: "onenote", label: "OneNote", actionId: "microsoft.onenote", badge: "Local", helper: "Open Microsoft OneNote", icon: NotebookTabs },
      { id: "onedrive", label: "OneDrive", actionId: "microsoft.onedrive", badge: "Folder", helper: "Open local OneDrive", icon: Cloud },
    ],
  },
  {
    id: "google-drive",
    label: "Google Drive",
    iconSrc: driveIcon,
    launchMode: "menu",
    status: "ready",
    statusLabel: "Web",
    menu: [
      { id: "drive", label: "Drive", actionId: "google.drive", badge: "Web", helper: "Open Google Drive", iconSrc: driveIcon },
      { id: "docs", label: "Docs", actionId: "google.docs", badge: "Web", helper: "Open Google Docs", iconSrc: docsIcon },
      { id: "sheets", label: "Sheets", actionId: "google.sheets", badge: "Web", helper: "Open Google Sheets", iconSrc: sheetsIcon },
      { id: "slides", label: "Slides", actionId: "google.slides", badge: "Web", helper: "Open Google Slides", iconSrc: slidesIcon },
      { id: "forms", label: "Forms", actionId: "google.forms", badge: "Web", helper: "Open Google Forms", iconSrc: formsIcon },
      { id: "calendar", label: "Calendar", actionId: "google.calendar", badge: "Web", helper: "Open Google Calendar", iconSrc: calendarIcon },
      { id: "gmail", label: "Gmail", actionId: "google.gmail", badge: "Web", helper: "Open Gmail", iconSrc: gmailIcon },
    ],
  },
  {
    id: "research",
    label: "Research",
    brand: "research",
    iconSrc: integrationIconSrcById.research,
    launchMode: "menu",
    status: "ready",
    statusLabel: "Mixed",
    menu: [
      { id: "worldcat", label: "WorldCat", actionId: "research.worldcat", badge: "Web", helper: "Search library collections worldwide", icon: BookOpen },
      { id: "google-scholar", label: "Google Scholar", actionId: "research.google_scholar", badge: "Web", helper: "Search scholarly articles", icon: GraduationCap },
      { id: "research-notes", label: "Research Notes", actionId: "research.notes", badge: "Folder", helper: "Open your research notes folder", icon: FileText },
      {
        id: "saved-papers",
        label: "Saved Papers",
        actionId: "research.saved_papers",
        badge: "Internal",
        helper: "Browse Research Papers filed in the vault",
        icon: BookOpen,
      },
      {
        id: "research-ideas",
        label: "Research Ideas",
        actionId: "research.ideas",
        badge: "Internal",
        helper: "Topics & questions to explore later",
        icon: Lightbulb,
      },
      {
        id: "saved-pdfs",
        label: "Saved PDFs",
        actionId: "research.saved_pdfs",
        badge: "Planned",
        helper: "Not built yet — reserved for the research database",
        icon: FolderOpen,
        planned: true,
      },
      {
        id: "research-packets",
        label: "Research Packets",
        actionId: "research.packets",
        badge: "Planned",
        helper: "Not built yet — reserved for the research database",
        icon: Inbox,
        planned: true,
      },
    ],
  },
];
