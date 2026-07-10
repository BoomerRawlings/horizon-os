import type { PriorityTask } from "../types";

// Static task list used only by Project Spotlight matching (projectSpotlightData.ts).
export const spotlightTasks: PriorityTask[] = [
  {
    id: "course-week-assignments",
    title: "Complete this week's course assignments",
    priority: "High",
    completed: false,
    projectId: "study-plan",
  },
  {
    id: "review-learning-plan",
    title: "Review the learning plan",
    priority: "High",
    completed: false,
    projectId: "study-plan",
  },
  {
    id: "second-course-assignments",
    title: "Complete your second course's assignments",
    priority: "High",
    completed: false,
    projectId: "study-plan",
  },
  {
    id: "check-school-email",
    title: "Check course messages and materials",
    priority: "Medium",
    completed: false,
    projectId: "study-plan",
  },
  {
    id: "next-study-plan",
    title: "Prepare the next study plan",
    priority: "Medium",
    completed: false,
    projectId: "study-plan",
  },
];
