import { defineCollection, z } from 'astro:content';

const certificates = defineCollection({
  type: 'content',
  schema: ({ image }) => z.object({
    title: z.string(),
    date: z.date(),
    issuer: z.string(),
    issuer_url: z.string().url().optional(),
    logo: z.string(),
    image: z.string(),
    issuer_title: z.string(),
    issuer_name: z.string(),
    credential_id: z.string(),
  }),
});

export const collections = { certificates };