import type { PriorityTask } from "../types";

// Static task list used only by Project Spotlight matching (projectSpotlightData.ts).
export const spotlightTasks: PriorityTask[] = [
  {
    id: "course-week-assignments",
    title: "Complete this week's course assignments",
    priority: "High",
    completed: false,
    projectId: "school-study",
  },
  {
    id: "transfer-orientation",
    title: "Attend transfer orientation",
    priority: "High",
    completed: false,
    projectId: "school-study",
  },
  {
    id: "second-course-assignments",
    title: "Complete your second course's assignments",
    priority: "High",
    completed: false,
    projectId: "school-study",
  },
  {
    id: "check-school-email",
    title: "Check your school email and portal",
    priority: "Medium",
    completed: false,
    projectId: "school-study",
  },
  {
    id: "enrollment-plan",
    title: "Prepare first-pass enrollment plan",
    priority: "Medium",
    completed: false,
    projectId: "school-study",
  },
];
