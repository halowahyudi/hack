import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { METHODOLOGY_PHASES } from './lib/site';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    toc: z.boolean().default(true),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    icon: z.string().default('▣'),
    status: z.enum(['active', 'maintained', 'archived']).default('maintained'),
    type: z.enum(['tool', 'webapp', 'research', 'automation', 'library']).default('tool'),
    tags: z.array(z.string()).default([]),
    stack: z.array(z.string()).default([]),
    repo: z.string().optional(),
    demo: z.string().optional(),
    docs: z.string().optional(),
    link: z.string().optional(),
  }),
});

const disclosures = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/disclosures' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    program: z.string(),
    severity: z.enum(['Critical', 'High', 'Medium', 'Low', 'Informational']),
    category: z.string(),
    cwe: z.string().optional(),
    recorded: z.coerce.date(),
    redacted: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
  }),
});

const methodology = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/methodology' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    phase: z.enum(METHODOLOGY_PHASES),
    order: z.number(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    updated: z.coerce.date().optional(),
  }),
});

export const collections = { blog, projects, methodology, disclosures };