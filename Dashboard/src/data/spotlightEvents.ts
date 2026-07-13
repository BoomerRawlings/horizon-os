import type { CalendarEvent } from "../types";

// Static fallback events used only by Project Spotlight matching (projectSpotlightData.ts).
export const spotlightEvents: CalendarEvent[] = [
  {
    id: "orientation-incoming-transfers",
    title: "Orientation for Incoming Transfers",
    startTime: "1:30 PM",
    endTime: "2:30 PM",
    type: "school",
    color: "amber",
    projectId: "school-study",
  },
  {
    id: "course-week-assignments-due",
    title: "This week's course assignments due",
    startTime: "11:59 PM",
    endTime: "11:59 PM",
    type: "school",
    color: "violet",
    projectId: "school-study",
  },
];
