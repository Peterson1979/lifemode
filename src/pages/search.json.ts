import { getCollection } from 'astro:content';
import { CATEGORIES, getCategory } from '../utils/categories';

export async function GET() {
  const legacyToolSlugs = new Set(['protein-intake-calculator', 'zone-2-heart-rate-calculator']);
  const [tools, checklists, guides] = await Promise.all([
    getCollection('tools').catch(() => []),
    getCollection('checklists').catch(() => []),
    getCollection('guides').catch(() => []),
  ]);

  const visibleTools = tools.filter((t) => !legacyToolSlugs.has(t.id.replace(/\.[^/.]+$/, '')));

  const items = [
    ...guides.map((g) => {
      const catKey = g.data.category || '';
      const cat = getCategory(catKey);
      return {
        id: g.id,
        title: g.data.title,
        summary: g.data.description || '',
        category: catKey,
        categoryName: cat?.title || catKey,
        type: 'Planning Guide',
        url: `/guides/${g.id.replace(/\.[^/.]+$/, '')}/`,
        badge: '📖 Guide',
      };
    }),
    ...visibleTools.map((t) => ({
      id: t.id,
      title: t.data.title,
      summary: t.data.summary,
      category: t.data.category,
      categoryName: CATEGORIES[t.data.category]?.title || t.data.category,
      type: 'Interactive Tool',
      url: `/tools/${t.id.replace(/\.[^/.]+$/, '')}/`,
      badge: '🛠️ Tool',
    })),
    ...checklists.map((c) => ({
      id: c.id,
      title: c.data.title,
      summary: c.data.summary,
      category: c.data.category,
      categoryName: CATEGORIES[c.data.category]?.title || c.data.category,
      type: 'Checklist & Printable',
      url: `/checklists/${c.id.replace(/\.[^/.]+$/, '')}/`,
      badge: '📋 Checklist',
    })),
  ];

  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
