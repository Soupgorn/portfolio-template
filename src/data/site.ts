export type ContactPlatform = 'instagram' | 'github' | 'discord' | 'line' | 'linkedin' | 'email';

export interface Contact {
  platform: ContactPlatform;
  label: string;
  /** A full https:// URL, or mailto: address for Email. Null or empty = disabled. */
  href: string | null;
}

export interface InfoCardData {
  id: string;
  icon: string;
  heading: string;
  primary?: string;
  secondary?: string;
  badges?: string[];
}

/** Start here: customize your content, links, and local public/ asset paths. */
export const site = {
  // Display name, full name, and nickname.
  entryStorageKey: 'portfolio:entered',
  name: 'Your Name',
  subtitle: 'Example Full Name',
  tagline: 'Nickname',
  introLabel: 'Hello, I’m',
  personalSpaceLabel: '',
  contactLabel: 'Find me on',
  contactTagline: '',
  contactPendingNote: 'Contact links are coming soon.',
  photo: '/images/avatar.svg',
  /** Optional full-resolution photo in public/. Empty or missing = reuse photo. */
  photoFull: '',
  photoAlt: 'Generic illustrated profile avatar',
  quote: {
    label: '~/example/notes',
    text: 'Your quote goes here.',
    footer: 'a work in progress',
  },
  information: [
    { id: 'education', icon: 'graduation', heading: 'Education', primary: 'Your Major', secondary: 'Your University' },
    { id: 'location', icon: 'pin', heading: 'Location', primary: 'Your City', secondary: 'Your Country' },
    { id: 'interests', icon: 'code', heading: 'Interests', badges: ['Interest One', 'Interest Two'] },
  ] satisfies InfoCardData[],
  projects: {
    label: 'Example work',
    heading: 'Example projects.',
    description: 'Fictional samples showing how to share your own work.',
  },
  music: {
    // Opt in only after authorizing YOUR account. Secrets belong in .env.local.
    // false: static site, UNCONFIGURED placeholder, and no Spotify requests.
    enabled: false,
  },
  seo: {
    title: 'Your Name — Portfolio',
    description: 'A configurable portfolio with projects, technology badges, and optional Spotify activity.',
    /** Set your deployed origin, e.g. https://your-domain.tld, to enable a canonical URL. */
    url: '',
  },
  contacts: [
    { platform: 'instagram', label: 'Instagram', href: null },
    { platform: 'github', label: 'GitHub', href: null },
    { platform: 'linkedin', label: 'LinkedIn', href: null },
    { platform: 'email', label: 'Email', href: null },
  ] satisfies Contact[],
};
