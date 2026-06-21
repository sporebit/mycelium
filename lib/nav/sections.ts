export type SubPage = { label: string; href: string; primary: boolean };

export type SectionConfig = {
  key: string;
  label: string;
  colour: string;
  baseRoute: string;
  subPages: SubPage[];
};

export const SECTIONS: SectionConfig[] = [
  {
    key: "organisation",
    label: "ORGANISATION",
    colour: "#f5b56d",
    baseRoute: "/organisation",
    subPages: [
      { label: "Tasks", href: "/organisation/tasks", primary: true },
      { label: "Captures", href: "/organisation/captures", primary: true },
      { label: "People", href: "/organisation/people", primary: true },
      { label: "Projects", href: "/organisation/projects", primary: false },
      { label: "Decisions", href: "/organisation/decisions", primary: false },
      { label: "Purchases", href: "/organisation", primary: false },
      { label: "Journal", href: "/journal", primary: false },
      { label: "Reminders", href: "/reminders", primary: false },
      { label: "Entity review", href: "/organisation/captures/review", primary: false },
    ],
  },
  {
    key: "fitness",
    label: "FITNESS",
    colour: "#84f5b8",
    baseRoute: "/fitness",
    subPages: [
      { label: "Today", href: "/fitness", primary: true },
      { label: "Workouts", href: "/fitness/workouts", primary: true },
      { label: "Exercises", href: "/fitness/exercises", primary: true },
      { label: "Programmes", href: "/fitness/programmes", primary: true },
      { label: "History", href: "/fitness/history", primary: true },
      { label: "Body", href: "/fitness/body", primary: false },
      { label: "Coach", href: "/fitness/coach", primary: false },
      { label: "Baselines", href: "/fitness/baselines", primary: false },
      { label: "Pain logs", href: "/fitness/pain", primary: false },
    ],
  },
  {
    key: "health",
    label: "HEALTH",
    colour: "#5de8e0",
    baseRoute: "/health",
    subPages: [
      { label: "Nutrition", href: "/health/nutrition", primary: true },
      { label: "Supplements", href: "/health/supplements", primary: true },
      { label: "Body metrics", href: "/health/body", primary: false },
      { label: "Gut health", href: "/draft/gut-health", primary: false },
      { label: "Blood tests", href: "/health/blood-tests", primary: false },
      { label: "Recipes", href: "/draft/recipes", primary: false },
    ],
  },
  {
    key: "the-boys",
    label: "THE BOYS",
    colour: "#5de8e0",
    baseRoute: "/the-boys",
    subPages: [
      { label: "Da Boi", href: "/the-boys/da_boi", primary: true },
      { label: "Ask", href: "/the-boys/ask", primary: true },
      { label: "Rules", href: "/the-boys/rules", primary: false },
      { label: "Integrations", href: "/the-boys/integrations", primary: false },
    ],
  },
  {
    key: "finance",
    label: "FINANCE",
    colour: "#6db8f5",
    baseRoute: "/finance",
    subPages: [
      { label: "Spending", href: "/finance", primary: true },
      { label: "Net worth", href: "/finance/net-worth", primary: true },
      { label: "Analysis", href: "/finance/analysis", primary: true },
      { label: "Fuel", href: "/finance/fuel", primary: false },
      { label: "Accounts", href: "/draft/accounts", primary: false },
    ],
  },
  {
    key: "studio",
    label: "STUDIO",
    colour: "#f56db5",
    baseRoute: "/studio",
    subPages: [
      { label: "Music", href: "/studio", primary: true },
      { label: "Footage", href: "/studio/footage", primary: true },
      { label: "Design", href: "/studio/design", primary: true },
      { label: "PC build", href: "/pc-build", primary: false },
    ],
  },
  {
    key: "ventures",
    label: "VENTURES",
    colour: "#84f5b8",
    baseRoute: "/ventures",
    subPages: [
      { label: "Overview", href: "/ventures", primary: true },
      { label: "Tree", href: "/ventures/tree", primary: true },
      { label: "Inspiration", href: "/ventures/inspiration", primary: true },
      { label: "Ads", href: "/ventures/ads", primary: false },
    ],
  },
  {
    key: "drops",
    label: "DROPS",
    colour: "#84f5b8",
    baseRoute: "/drops",
    subPages: [
      { label: "Calendar", href: "/drops/calendar", primary: true },
      { label: "Wishlist", href: "/drops/wishlist", primary: true },
      { label: "Raffles", href: "/drops/raffles", primary: true },
      { label: "Cook Guides", href: "/drops/cook-guides", primary: false },
      { label: "Monitor", href: "/drops/monitor", primary: false },
    ],
  },
  {
    key: "other",
    label: "OTHER",
    colour: "#e8e6dd",
    baseRoute: "/other",
    subPages: [
      { label: "Settings", href: "/other/settings", primary: true },
      { label: "Export", href: "/other/export", primary: true },
      { label: "API Usage", href: "/other/api-usage", primary: true },
    ],
  },
];

export const SECTION_BASE_ROUTES = SECTIONS.map((s) => s.baseRoute);
