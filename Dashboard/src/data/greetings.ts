import greetingMatrix from "./horizonGreetings.json";

export type GreetingSlot = {
  slotIndex: number;
  start: string;
  end: string;
  period: string;
  periodLabel: string;
  options: string[];
};

export type GreetingSelection = {
  periodLabel: string;
  slotIndex: number;
  template: string;
};

const slots = greetingMatrix.slots as GreetingSlot[];
const startupSubheadings = [
  "Stay focused. Keep building.",
  "Choose one clean next step.",
  "Small wins, clean systems.",
  "Build gently. Finish clearly.",
  "Keep the work bounded.",
  "Make the next step manageable.",
  "Capture what matters. Move with care.",
  "Focused work, lighter friction.",
  "One lane, one useful finish.",
];

export function getGreetingSlotIndex(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return Math.floor(minutes / 15);
}

function randomIndex(max: number) {
  if (max <= 1) {
    return 0;
  }

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] % max;
  }

  return Math.floor(Math.random() * max);
}

export function pickGreetingSelection(date = new Date()): GreetingSelection {
  const slotIndex = getGreetingSlotIndex(date);
  const slot = slots[slotIndex];
  const options = slot?.options?.length ? slot.options : ["Welcome back, {name}."];

  return {
    periodLabel: slot?.periodLabel ?? "Dashboard",
    slotIndex,
    template: options[randomIndex(options.length)],
  };
}

export function pickStartupSubheading() {
  return startupSubheadings[randomIndex(startupSubheadings.length)];
}

function formatLeadingTimeForDisplay(template: string) {
  return template.replace(/^([01]\d|2[0-3]):([0-5]\d)\b/, (_, hourText: string, minuteText: string) => {
    const hour = Number(hourText);
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minuteText} ${period}`;
  });
}

export function renderGreeting(selection: GreetingSelection, name: string) {
  return formatLeadingTimeForDisplay(selection.template).replaceAll("{name}", name || "Explorer");
}
