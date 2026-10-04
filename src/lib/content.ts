import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;
export type Project = CollectionEntry<'projects'>;
export type Methodology = CollectionEntry<'methodology'>;
export type Disclosure = CollectionEntry<'disclosures'>;

const isPublishedInProd = <T extends { data: { draft?: boolean } }>(entry: T) =>
  import.meta.env.PROD ? entry.data.draft !== true : true;

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function readingTime(body: string | undefined): string {
  const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

export function readingMinutes(body: string | undefined): number {
  const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function ogImageFor(section: string, id: string): string {
  return `/og/${section}/${id}.png`;
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog', isPublishedInProd);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getProjects(): Promise<Project[]> {
  const projects = await getCollection('projects', isPublishedInProd);
  return projects.sort((a, b) => {
    if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
    return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
  });
}

export async function getMethodology(): Promise<Methodology[]> {
  const items = await getCollection('methodology', isPublishedInProd);
  return items.sort((a, b) => {
    if (a.data.phase !== b.data.phase) return a.data.phase.localeCompare(b.data.phase);
    return a.data.order - b.data.order;
  });
}

export async function getDisclosures(): Promise<Disclosure[]> {
  const items = await getCollection('disclosures', isPublishedInProd);
  const rank = { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 } as const;
  return items.sort((a, b) => {
    if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
    const sev = rank[a.data.severity] - rank[b.data.severity];
    if (sev !== 0) return sev;
    return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
  });
}

export function countBySeverity(entries: { data: { severity: string } }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) out[e.data.severity] = (out[e.data.severity] ?? 0) + 1;
  return out;
}

export function collectTags(entries: { data: { tags: string[] } }[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function slugifyTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
