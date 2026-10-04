import rss from '@astrojs/rss';
import { SITE } from '../lib/site';
import { getBlogPosts } from '../lib/content';

export const GET = async () => {
  const posts = await getBlogPosts();
  const items = posts.map((post) => ({
    title: post.data.title,
    description: post.data.description ?? '',
    pubDate: post.data.pubDate,
    link: `/blog/${post.id}/`,
  }));

  return rss({
    title: `${SITE.title} — Blog`,
    description: SITE.description,
    site: SITE.url,
    items,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>en-us</language>`,
  });
};