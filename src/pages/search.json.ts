import { getCollection } from 'astro:content';
import { CATEGORIES } from '../utils/categories';

export async function GET() {
  const [guides, tools, checklists] = await Promise.all([
    getCollection('guides').catch(() => []),
    getCollection('tools').catch(() => []),
    getCollection('checklists').catch(() => []),
  ]);

  const items = [
    ...guides.map((g) => ({
      id: g.id,
      title: g.data.title,
      summary: g.data.quickSummary,
      category: g.data.category,
      categoryName: CATEGORIES[g.data.category]?.title || g.data.category,
      type: g.data.contentType === 'decision' ? 'Decision Guide' : 'Reference Guide',
      url: `/${g.data.category}/${g.id.replace(/\.[^/.]+$/, '')}/`,
      badge: g.data.contentType === 'decision' ? '⚖️ Decision' : '📖 Guide',
    })),
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
