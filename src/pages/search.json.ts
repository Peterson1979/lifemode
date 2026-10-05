import { getCollection } from 'astro:content';
import { CATEGORIES } from '../utils/categories';

export async function GET() {
  const [
    guides,
    tools,
    checklists,
    foodArticles,
    healthArticles,
    wealthArticles,
    homeArticles,
    lifeArticles,
    techArticles,
  ] = await Promise.all([
    getCollection('guides').catch(() => []),
    getCollection('tools').catch(() => []),
    getCollection('checklists').catch(() => []),
    getCollection('food-drink').catch(() => []),
    getCollection('health').catch(() => []),
    getCollection('wealth').catch(() => []),
    getCollection('home').catch(() => []),
    getCollection('life').catch(() => []),
    getCollection('tech-ai').catch(() => []),
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
    ...foodArticles
      .filter((f: any) => !f.data.draft)
      .map((f: any) => ({
        id: f.id,
        title: f.data.title,
        summary: f.data.description,
        category: 'food-drink',
        categoryName: 'Food & Drink',
        type: f.data.format === 'recipe' ? 'Culinary Recipe' : 'Food & Drink Guide',
        url: `/food-drink/${f.id.replace(/\.[^/.]+$/, '')}/`,
        badge: f.data.format === 'recipe' ? '🍳 Recipe' : '🍷 Story',
      })),
    ...healthArticles
      .filter((h: any) => !h.data.draft)
      .map((h: any) => ({
        id: h.id,
        title: h.data.title,
        summary: h.data.description,
        category: 'health',
        categoryName: 'Health',
        type: 'Health & Longevity Guide',
        url: `/health/${h.id.replace(/\.[^/.]+$/, '')}/`,
        badge: '🌿 Health',
      })),
    ...wealthArticles
      .filter((w: any) => !w.data.draft)
      .map((w: any) => ({
        id: w.id,
        title: w.data.title,
        summary: w.data.description,
        category: 'wealth',
        categoryName: 'Wealth',
        type: 'Online Income & Business Model',
        url: `/wealth/${w.id.replace(/\.[^/.]+$/, '')}/`,
        badge: '💼 Wealth',
      })),
    ...homeArticles
      .filter((hm: any) => !hm.data.draft)
      .map((hm: any) => ({
        id: hm.id,
        title: hm.data.title,
        summary: hm.data.description,
        category: 'home',
        categoryName: 'Home',
        type: 'Home & Living Guide',
        url: `/home/${hm.id.replace(/\.[^/.]+$/, '')}/`,
        badge: '🏡 Home',
      })),
    ...lifeArticles
      .filter((l: any) => !l.data.draft)
      .map((l: any) => ({
        id: l.id,
        title: l.data.title,
        summary: l.data.description,
        category: 'life',
        categoryName: 'Life & Style',
        type: 'Style & Everyday Life',
        url: `/life/${l.id.replace(/\.[^/.]+$/, '')}/`,
        badge: '✨ Life',
      })),
    ...techArticles
      .filter((t: any) => !t.data.draft)
      .map((t: any) => ({
        id: t.id,
        title: t.data.title,
        summary: t.data.description,
        category: 'tech-ai',
        categoryName: 'Tech & AI',
        type: 'AI Tool & Workflow Guide',
        url: `/tech-ai/${t.id.replace(/\.[^/.]+$/, '')}/`,
        badge: '🤖 Tech & AI',
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
