import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { generateOpenGraphImage } from 'astro-og-canvas';

interface OgPage {
  slug: string;
  title: string;
  description?: string;
  eyebrow?: string;
}

export const prerender = true;

const staticPages: OgPage[] = [
  { slug: 'index', title: 'Wahyudi', description: 'Software Engineer · SDET · Application Security · Security Researcher', eyebrow: 'wahyudi.dev' },
  { slug: 'about', title: 'About', description: 'Software engineer by trade, attacker by curiosity.', eyebrow: '~/about' },
  { slug: 'blog', title: 'Blog', description: 'Security writeups, pentesting notes, SDET automation lessons and engineering essays.', eyebrow: '~/blog' },
  { slug: 'projects', title: 'Projects', description: 'Security tooling, automation and production web apps.', eyebrow: '~/projects' },
  { slug: 'methodology', title: 'Pentesting Methodology', description: 'A living playbook built from real engagements and bug bounty programs.', eyebrow: '~/methodology' },
  { slug: 'disclosures', title: 'Coordinated Disclosures', description: 'Findings from real research, published responsibly.', eyebrow: '~/disclosures' },
];

export const getStaticPaths = (async () => {
  const [blog, projects, methodology, disclosures] = await Promise.all([
    getCollection('blog'),
    getCollection('projects'),
    getCollection('methodology'),
    getCollection('disclosures'),
  ]);

  const pages: OgPage[] = [
    ...staticPages,
    ...blog.filter((p) => !p.data.draft).map((p) => ({
      slug: `blog/${p.id}`,
      title: p.data.title,
      description: p.data.description,
      eyebrow: '~/blog',
    })),
    ...projects.filter((p) => !p.data.draft).map((p) => ({
      slug: `projects/${p.id}`,
      title: p.data.title,
      description: p.data.description,
      eyebrow: '~/projects',
    })),
    ...methodology.filter((p) => !p.data.draft).map((p) => ({
      slug: `methodology/${p.id}`,
      title: p.data.title,
      description: p.data.description,
      eyebrow: `~/methodology · ${p.data.phase}`,
    })),
    ...disclosures.filter((p) => !p.data.draft).map((p) => ({
      slug: `disclosures/${p.id}`,
      title: p.data.title,
      description: p.data.description,
      eyebrow: `~/disclosures · ${p.data.category}`,
    })),
  ];

  return pages.map((page) => ({
    params: { slug: page.slug },
    props: { page },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { page } = props as { page: OgPage };

  const png = await generateOpenGraphImage({
    title: page.title,
    description: page.description,
    bgGradient: [
      [5, 7, 13],
      [10, 14, 23],
    ],
    border: { color: [255, 64, 87], width: 12, side: 'inline-start' },
    padding: 80,
    font: {
      title: {
        size: 64,
        weight: 'Bold',
        families: ['Inter', 'JetBrains Mono'],
        color: [230, 234, 240],
        lineHeight: 1.15,
      },
      description: {
        size: 30,
        weight: 'Normal',
        families: ['Inter', 'JetBrains Mono'],
        color: [152, 163, 179],
        lineHeight: 1.4,
      },
    },
    fonts: [
      './src/assets/fonts/Inter-Bold.ttf',
      './src/assets/fonts/Inter-Regular.ttf',
      './src/assets/fonts/JetBrainsMono-Bold.ttf',
      './src/assets/fonts/JetBrainsMono-Regular.ttf',
    ],
  });

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  });
};
