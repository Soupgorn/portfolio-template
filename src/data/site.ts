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

/** All personal information and asset paths live here. Paths are relative to public/. */
export const site = {
  name: 'Your Name',
  subtitle: 'Example Full Name',
  tagline: 'Nickname',
  introLabel: 'Hello, I’m',
  personalSpaceLabel: 'Personal Space',
  contactLabel: 'Find me on',
  contactTagline: 'Let’s connect ✦',
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
  music: {
    provider: 'spotify',
    // PERSONALIZE: paste your public Spotify playlist sharing URL here, then rebuild.
    // Leave empty to show the coming-soon card. Query parameters are supported.
    playlistUrl: '',
    playlistName: 'My Playlist',
    tagline: 'a little soundtrack to my space.',
  },
  seo: {
    title: 'Your Name — Portfolio',
    description: 'A personal portfolio with profile details, contact links, and a favorite playlist.',
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
