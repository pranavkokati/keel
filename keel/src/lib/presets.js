/**
 * One-click starter prompts shown in the empty chat state — lowers the
 * activation energy of "describe an app" for someone staring at a blank
 * textarea, and doubles as a quick way to sanity-check a fresh BYOK key.
 */
export const PROMPT_PRESETS = [
  { label: 'SaaS landing page', prompt: 'A landing page for a project-management SaaS: hero with headline and CTA, a three-column feature grid, pricing tiers, and a footer.' },
  { label: 'Restaurant site', prompt: 'A one-page site for a neighborhood restaurant: hero with the restaurant name and hours, a menu section grouped by category, a reservations form, and a map/location section.' },
  { label: 'Portfolio', prompt: 'A personal portfolio site: hero with name and a one-line bio, a project grid with short descriptions, an about section, and a contact form.' },
  { label: 'Event page', prompt: 'A single-event landing page: hero with event name/date/location, an agenda/schedule section, a speakers grid, and a registration form.' },
  { label: 'Todo app with accounts', prompt: 'A todo app where users can sign in and their tasks persist — each user only sees their own list, tasks can be marked done or deleted.' },
  { label: 'Newsletter signup', prompt: 'A minimal newsletter landing page: a short pitch, a single email signup form, and a few testimonial quotes.' },
];
