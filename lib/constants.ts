export const CATEGORIES = [
  { value: "web-dev", label: "Web development" },
  { value: "mobile-dev", label: "Mobile apps" },
  { value: "design", label: "Design & branding" },
  { value: "writing", label: "Writing & translation" },
  { value: "marketing", label: "Marketing & social media" },
  { value: "video", label: "Video & animation" },
  { value: "data", label: "Data & analytics" },
  { value: "admin-support", label: "Admin & virtual assistance" },
] as const;
export type Category = (typeof CATEGORIES)[number]["value"];
export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [Category, ...Category[]];
export const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const EXPERIENCE = [
  { value: "entry", label: "Entry level" },
  { value: "intermediate", label: "Intermediate" },
  { value: "expert", label: "Expert" },
] as const;
export const experienceLabel = (v: string) => EXPERIENCE.find((e) => e.value === v)?.label ?? v;

export const LOCATION_TYPES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;
export const locationLabel = (v: string) => LOCATION_TYPES.find((l) => l.value === v)?.label ?? v;

export const STATES = [
  "Abia", "Abuja (FCT)", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo",
  "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
  "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe",
  "Zamfara",
] as const;

export const MAX_JOB_SKILLS = 8;
export const MAX_FREELANCER_SKILLS = 15;
export const MAX_PORTFOLIO_ITEMS = 6;
export const PAGE_SIZE = 12;
