import { getCollection } from 'astro:content';
import { CATEGORIES } from '../utils/categories';

export async function GET() {
  const [tools, checklists] = await Promise.all([
    getCollection('tools').catch(() => []),
    getCollection('checklists').catch(() => []),
  ]);

  const items = [
    ...tools.map((t) => ({
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
