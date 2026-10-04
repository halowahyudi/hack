export const SITE = {
  url: 'https://wahyudi.dev',
  domain: 'wahyudi.dev',
  title: 'Wahyudi',
  tagline: 'Software Engineer · SDET · Application Security · Security Researcher',
  description:
    'Personal site of Wahyudi — Software Engineer, SDET, Application Security engineer, and Security Researcher. Pentesting methodology, security writeups, and projects.',
  author: 'Wahyudi',
  handle: 'halowahyudi',
  email: 'hi@wahyudi.dev',
  locale: 'en',
  socials: {
    github: 'https://github.com/halowahyudi',
    instagram: 'https://instagram.com/halowahyudi',
    hackerone: 'https://hackerone.com/wint3rcold',
  },
} as const;

export const NAV: { label: string; href: string }[] = [
  { label: 'Home', href: '/' },
  { label: 'Methodology', href: '/methodology' },
  { label: 'Disclosures', href: '/disclosures' },
  { label: 'Projects', href: '/projects' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
];

export const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low', 'Informational'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

export const SEVERITY_META: Record<Severity, { label: string; className: string }> = {
  Critical: { label: 'Critical', className: 'border-signal-500/60 bg-signal-500/10 text-signal-500' },
  High: { label: 'High', className: 'border-signal-500/40 bg-signal-500/10 text-signal-500' },
  Medium: { label: 'Medium', className: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  Low: { label: 'Low', className: 'border-info-500/40 bg-info-500/10 text-info-500' },
  Informational: { label: 'Info', className: 'border-ink-600 bg-ink-850 text-ink-400' },
};

export const ROLES = [
  'Software Engineer',
  'SDET',
  'Application Security',
  'Security Researcher',
] as const;

export const METHODOLOGY_PHASES = [
  'Web',
  'API',
  'Phishing',
  'Generic Hacking',
] as const;

export const PHASE_FLOW = [
  { phase: 'Web', short: 'Web application attack surface — enumeration, injection, file handling and client-side flaws.' },
  { phase: 'API', short: 'REST, GraphQL and auth flows — broken object/function access, mass assignment and token abuse.' },
  { phase: 'Phishing', short: 'Social-engineering delivery — pretexting, payload hosting and credential-harvesting flows.' },
  { phase: 'Generic Hacking', short: 'Cross-cutting tradecraft that applies to every target and engagement.' },
] as const;
