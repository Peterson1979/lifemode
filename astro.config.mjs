// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://lifemode.life',
  integrations: [mdx(), sitemap()],
  redirects: {
    // Topic root redirects
    '/discover': '/culture',
    '/now': '/',

    // Legacy Discover articles -> Culture
    '/discover/curated-monograph-curation-timeless-design-and-photography-v': '/culture/curated-monograph-curation-timeless-design-and-photography-v',
    '/discover/japanese-minka-renovation-historic-timber-modern-minimalism': '/culture/japanese-minka-renovation-historic-timber-modern-minimalism',
    '/discover/the-analog-turn-why-high-signal-professionals-are-embracing': '/culture/the-analog-turn-why-high-signal-professionals-are-embracing',
    '/discover/the-counter-culture-of-friction-why-people-are-intentionally': '/culture/the-counter-culture-of-friction-why-people-are-intentionally',

    // Legacy Now articles -> Real Editorial Pillars
    '/now/apple-tv-last-seen-series-what-you-need-to-know': '/tech-ai/apple-tv-last-seen-series-what-you-need-to-know',
    '/now/downdetector-guide-2026': '/tech-ai/downdetector-guide-2026',
    '/now/cable-tv-a-modern-guide-to-trends-signals-zeitgeist': '/culture/cable-tv-a-modern-guide-to-trends-signals-zeitgeist',
    '/now/delta-flight-2311-rapid-descent-what-to-know': '/travel/delta-flight-2311-rapid-descent-what-to-know',
    '/now/fire-weather-watch-what-to-know': '/travel/fire-weather-watch-what-to-know',
    '/now/jose-trevino-what-to-know': '/culture/jose-trevino-what-to-know',
    '/now/josh-hartnett-actor-netflix-below': '/culture/josh-hartnett-actor-netflix-below',
    '/now/new-movies-streaming-what-to-know': '/culture/new-movies-streaming-what-to-know',
    '/now/pakistan-vs-england-modern-guide-trends-signals-zeitgeist': '/culture/pakistan-vs-england-modern-guide-trends-signals-zeitgeist',
    '/now/san-jose-earthquakes-what-to-know': '/culture/san-jose-earthquakes-what-to-know',
    '/now/solheim-cup-2026-what-to-know': '/culture/solheim-cup-2026-what-to-know',
    '/now/the-2026-cultural-shift-toward-digital-intentionality': '/culture/the-2026-cultural-shift-toward-digital-intentionality',
    '/now/vaccinations-modern-guide-trends-signals-zeitgeist': '/wellbeing/vaccinations-modern-guide-trends-signals-zeitgeist',
    '/now/weather-nyc-what-to-know': '/travel/weather-nyc-what-to-know',
    '/now/who-is-meteor-shower': '/culture/who-is-meteor-shower',
  },
});
