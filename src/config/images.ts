import type { PillarSlug } from './site.ts';

/**
 * Visual guidelines for a specific editorial pillar.
 */
export interface PillarImageStyle {
  pillar: PillarSlug;
  theme: string;
  palette: string[];
  visualMotifs: string[];
  lighting: string;
  cameraLens: string;
  mood: string;
  exampleScenes: string[];
}

/**
 * Aspect ratio configurations for different display contexts.
 */
export const EDITORIAL_ASPECT_RATIOS = {
  hero: '16:9',
  card: '4:3',
  classic: '3:2',
  portrait: '3:4',
  socialStory: '9:16',
  socialSquare: '1:1',
} as const;

export type AspectRatioContext = keyof typeof EDITORIAL_ASPECT_RATIOS;

/**
 * Universal editorial photography guidelines for all LifeMode visual assets.
 */
export const GLOBAL_IMAGE_GUIDELINES = {
  styleName: 'Contemporary Editorial Lifestyle Photography',
  aestheticReference: 'Kinfolk / Cereal / Monocle / Wallpaper documentary aesthetic',
  coreDirectives: [
    'Authentic realistic photography (never 3D CGI render or illustrated vector)',
    'Strictly human-free visual composition (no people, no faces, no bodies, no hands, no arms, no body parts, no silhouettes, no human reflections, no humans on screens)',
    'Strictly text-free visual composition (no text, no letters, no words, no numbers, no captions, no labels)',
    'Natural ambient daylight and soft warm directional illumination',
    'Tactile organic textures (linen, wood, stone, matte paper, ceramics, foliage)',
    'Asymmetric magazine composition with intentional negative space',
    'Subtle natural 35mm film grain and soft depth of field (f/1.8 to f/2.8)',
    'Warm neutral color grade (parchment tones, soft charcoal, muted earth, subtle olive and camel)',
    'Pure visual communication through real-world objects, architectural settings, and tactile materials alone',
  ],
  negativePromptRules: [
    'people, person, humans, human figures, man, men, woman, women, child, children, baby, crowd, spectators, pedestrians, bystanders, audience, athletes, players, models',
    'faces, portraits, headshots, facial features, smiling, gazing, eyes, lips, skin, skin tones, body, bodies, body parts, hands, fingers, palms, wrists, arms, shoulders, legs, feet, holding objects, typing, gestures',
    'silhouettes, human shadows, human reflections, person reflection, people in photographs, people on screens, avatars, character drawings',
    'text, typography, letters, words, writing, captions, labels, headings, titles, subtitles',
    'numbers, numerical digits, price tags, barcode, QR code',
    'watermarks, signatures, copyright notices, stamps, logos, brand emblems',
    'gibberish text, pseudo-letters, fake script, distorted alphabets, unreadable typography',
    'infographics, charts, graphs, flowcharts, diagrams, schematics, blueprints with text',
    'mock user interfaces, software screenshots, computer display text, terminal prompts with fake text',
    'neon glows, holographic grids, futuristic sci-fi cybernetic effects',
    'plastic 3D CGI rendering, cartoon vector graphics, video game graphics',
    'harsh flash overexposure, blown highlights, oversaturated fluorescent colors',
  ],
};

/**
 * Pillar-specific visual styles and aesthetic guidelines.
 */
export const PILLAR_IMAGE_STYLES: Record<PillarSlug, PillarImageStyle> = {
  health: {
    pillar: 'health',
    theme: 'Longevity Science, Metabolic Vitality & Rest',
    palette: ['Vital Emerald', 'Raw Amber', 'Botanical Sage', 'Morning Dew White'],
    visualMotifs: [
      'Morning sunlight over clean wellness spaces and natural daylight fitness routines',
      'Modern biometric wearables, sleep tracking rings, and recovery devices in natural light',
      'Pure hydration, botanical nutrition, and balanced wholesome meals',
      'Mindful outdoor environments, restorative sauna rooms, and scenic nature trail overlooks',
    ],
    lighting: 'Luminous natural morning daylight with crisp, refreshing contrast',
    cameraLens: '50mm or 85mm prime lens with natural depth of field and authentic organic textures',
    mood: 'Vital, scientific, restorative, luminous, evidence-informed',
    exampleScenes: [
      'A sunlit mountain trail overlook with an elegant fitness tracking watch resting on natural stone',
      'Morning sunlight through sheer curtains illuminating a mindful breathing and recovery setup with ceramic carafe',
      'A clean kitchen counter with cold-pressed green juice, raw almonds, and fresh botanical herbs',
    ],
  },
  wealth: {
    pillar: 'wealth',
    theme: 'Digital Independence, Remote Business & Creator Economy',
    palette: ['Sky Slate', 'Rich Espresso', 'Parchment Cream', 'Modern Obsidian'],
    visualMotifs: [
      'Modern remote work desk setup with natural light, clean laptop, and paper notebook',
      'Digital product creation, creative hardware essentials, and structured business notebooks',
      'Independent workspace essentials in sunlit boutique studio environments',
      'Clear, minimalist workspace essentials with warm wood textures',
    ],
    lighting: 'Refined architectural daylight with clean structured highlights',
    cameraLens: '35mm or 50mm f/2.0 prime lens with documentary realism',
    mood: 'Strategic, independent, pragmatic, focused, contemporary',
    exampleScenes: [
      'A sunlit Scandinavian-style studio workstation with open laptop and creator workspace essentials',
      'A clean walnut desk with a fountain pen, structured workflow diagram, and morning coffee',
      'A productive desk setup with paper notebook and brass lamp beside a garden-facing window',
    ],
  },
  home: {
    pillar: 'home',
    theme: 'Culinary Craft, Kitchen Care & Household Systems',
    palette: ['Terracotta Paprika', 'Olive Slate', 'Warm Ochre', 'Clean Linen'],
    visualMotifs: [
      'Authentic seasoned cast-iron pans, copper cookware, and natural cutting boards',
      'Smart small-pantry organization jars, labelled containers, and clean storage systems',
      'Seasonal home maintenance tools, linen laundry hampers, and organized living areas',
      'Fresh rustic culinary preparation and mindful kitchen workflows',
    ],
    lighting: 'Warm natural window daylight with soft domestic shadows',
    cameraLens: '50mm f/1.8 prime lens highlighting authentic textures and materials',
    mood: 'Artisanal, functional, grounded, organized, warm',
    exampleScenes: [
      'A beautifully seasoned cast iron skillet on a clean wooden trivet with fresh garlic and thyme',
      'A small pantry with neatly organized glass storage jars and bamboo shelf risers',
      'A sunlit laundry folding area with organic cotton textiles and amber spray bottles',
    ],
  },
  life: {
    pillar: 'life',
    theme: 'Curated Personal Style, Everyday Hacks & Mindful Travel',
    palette: ['Crimson Rose', 'Terracotta Silk', 'Coast Azure', 'Warm Alabaster'],
    visualMotifs: [
      'Tactile linen tailoring, curated wardrobe capsules, and minimalist grooming tools',
      'Everyday problem-solving gear, smart household shortcuts, and spatial fixes',
      'Boutique travel destinations, quiet coastal promenades, and slow journey scenes',
      'Daily morning routines, structured desks, and intentional lifestyle moments',
    ],
    lighting: 'Soft diffused natural window light with gentle warm shadows',
    cameraLens: '50mm or 85mm prime lens with beautiful filmic quality',
    mood: 'Effortless, contemporary, cultured, inspiring, authentic',
    exampleScenes: [
      'A minimalist capsule wardrobe rail with neutral linen shirts, wool trousers, and leather boots',
      'A canvas weekender bag resting at a scenic Mediterranean coastal viewpoint overlooking the sea',
      'A neatly organized morning grooming tray with amber bottles and natural horn comb',
    ],
  },
  tools: {
    pillar: 'tools',
    theme: 'Interactive Solvers, Decision Matrix & Reference Utilities',
    palette: ['Modern Blue', 'Deep Slate', 'Crisp White', 'Graphite'],
    visualMotifs: [
      'Clean interactive decision interfaces, diagnostic matrices, and calculation tools',
      'Comparative materials testing, fabric care swatches, and measurement tools',
      'Structured planning sheets, clipboards, and systematic checklists',
    ],
    lighting: 'Clean high-clarity daylight with balanced neutral tones',
    cameraLens: '45mm or 50mm lens with crisp edge-to-edge geometric precision',
    mood: 'Analytical, helpful, precise, clear, modern',
    exampleScenes: [
      'A clean decision matrix on a tablet displayed on an organized drafting table with rulers',
      'A structured maintenance checklist and measurement tape on a clean wooden workspace',
    ],
  },
  style: {
    pillar: 'style',
    theme: 'Contemporary Fashion, Personal Style & Beauty Aesthetics',
    palette: ['Terracotta Rose', 'Warm Alabaster', 'Silk Charcoal', 'Soft Amber', 'Muted Olive'],
    visualMotifs: [
      'Tactile fabric textures, tailored garments, and contemporary capsule wardrobe details',
      'Artisanal skincare bottles, amber glass dropper flacons, and minimalist beauty trays',
      'Natural makeup palettes, cosmetic brushes, and textured skincare formulations',
      'Clean modern vanity spaces with natural daylight and subtle architectural mirrors',
      'Minimalist accessories, textile swatches, and elegant fragrance bottles',
    ],
    lighting: 'Soft diffused natural window daylight, luminous fabric textures, and gentle warm shadows',
    cameraLens: '50mm or 85mm f/1.8 prime lens, beautiful documentary depth of field and tactile detail',
    mood: 'Effortless, contemporary, luminous, tactile, editorial',
    exampleScenes: [
      'A minimalist stone bathroom vanity with amber skincare bottles, ceramic tray, and morning side light',
      'Close-up of tactile linen tailoring, a leather strap wristwatch, and curated everyday accessories',
      'Glass fragrance bottle and botanical skincare balms arranged on a sunlit textured plaster surface',
      'Artful flat-lay of clean makeup essentials and soft bristle brushes on neutral linen fabric',
    ],
  },
  travel: {
    pillar: 'travel',
    theme: 'Slow Journeys & Cultural Landscapes',
    palette: ['Coast Azure', 'Weathered Sand', 'Olive Green', 'Sun-bleached Stone'],
    visualMotifs: [
      'Atmospheric coastal cliffs and winding mountain passes',
      'Boutique Mediterranean architectural facades',
      'Quiet passenger window views during slow rail travel',
      'Authentic local artisan workshops and historic cobblestone alleys',
    ],
    lighting: 'Late afternoon coastal golden hour, soft atmospheric haze',
    cameraLens: '35mm f/2.0 lens, expansive documentary landscape framing',
    mood: 'Wanderlust, contemplative, timeless, authentic',
    exampleScenes: [
      'An ancient coastal stone promenade in Portugal looking toward the Atlantic ocean at golden hour',
      'Morning mist rising over olive groves surrounding a minimalist stone villa',
      'A vintage wooden train interior looking out toward snow-dusted alpine vistas',
    ],
  },
  'tech-ai': {
    pillar: 'tech-ai',
    theme: 'Human Intelligence & Thoughtful Tools',
    palette: ['Mineral Violet', 'Charcoal Slate', 'Matte Silver', 'Soft Warm White'],
    visualMotifs: [
      'Clean minimalist designer workspaces with natural wood desk',
      'Subtle, tactile device setups without screen glare',
      'Architectural hardware design, matte finishes, bespoke mechanical keyboards',
      'Deep focus environments with warm desk lamp illumination',
    ],
    lighting: 'Diffused daylight from modern office window paired with warm brass task lighting',
    cameraLens: '50mm f/1.4 lens, selective focus on tactile workspace details',
    mood: 'Intelligent, focused, tactile, human-centric',
    exampleScenes: [
      'A sleek minimalist workstation with technical sketches and potted greenery in morning light',
      'Overhead flat-lay of an artisanal leather notebook, fountain pen, and thin laptop on warm walnut wood',
      'Close-up of a matte mechanical keyboard and desk mat on warm walnut wood in a sunlit architectural studio',
    ],
  },
  money: {
    pillar: 'money',
    theme: 'Strategic Clarity & Sustainable Freedom',
    palette: ['Sage Slate', 'Rich Espresso', 'Parchment Cream', 'Burnished Brass'],
    visualMotifs: [
      'Modern architectural finance libraries and quiet study corners',
      'Fine stationery, bespoke leather folio, clean analytical notes',
      'Panoramic glass window overlooking early morning cityscape skyline',
      'Understated, timeless elegance and strategic contemplation',
    ],
    lighting: 'Refined architectural daylight, clear and structured shadows',
    cameraLens: '45mm tilt-shift / 50mm f/2.8 lens, clean geometric perspective',
    mood: 'Sophisticated, discerning, steady, grounded',
    exampleScenes: [
      'An uncluttered executive workspace with an architectural view of a metropolitan skyline at dawn',
      'A bound investment thesis and fountain pen resting on a dark wood table in a sunlit modern library',
      'A quiet reading nook with a leather armchair, brass lamp, and financial journal',
    ],
  },
  wellbeing: {
    pillar: 'wellbeing',
    theme: 'Mindfulness, Longevity & Rest',
    palette: ['Raw Amber', 'Botanical Sage', 'Oatmeal', 'Morning Dew White'],
    visualMotifs: [
      'Still morning light over unmade linen bedding',
      'Herbal tea steaming in a handmade ceramic bowl',
      'Mindful garden pavilions and tranquil architecture',
      'Lush botanical greenery and pure natural elements (water, stone, light)',
    ],
    lighting: 'Gentle sunrise glow, soft ethereal diffusion',
    cameraLens: '85mm f/1.8 lens, creamy bokeh, intimate stillness',
    mood: 'Peaceful, restorative, vital, serene',
    exampleScenes: [
      'Soft morning sunlight casting long shadows across crisp linen bedsheets and an open book',
      'A ceramic mug of matcha tea on a weathered cedar bench surrounded by bamboo foliage',
      'A meditation cushion and smooth river stones beside a tranquil natural reflecting pool',
    ],
  },
  entertainment: {
    pillar: 'entertainment',
    theme: 'Celebrity Stories, Cinema, Music & Contemporary Entertainment',
    palette: ['Rich Fuchsia', 'Cinema Gold', 'Velvet Plum', 'Warm Alabaster', 'Charcoal Night'],
    visualMotifs: [
      'Cinematic contextual photography and atmospheric behind-the-scenes production environments',
      'Atmospheric film studio lighting, cameras, vintage audio equipment, and instruments',
      'Curated screen arts, architectural cinema auditoriums, and music performance spaces',
      'Thoughtful profile settings: sunlit artists lofts, recording lounges, and vintage armchairs',
    ],
    lighting: 'Atmospheric cinematic illumination, warm dramatic contrast, natural architectural daylight',
    cameraLens: '50mm or 85mm f/1.4 prime lens, beautiful shallow depth of field and filmic grain',
    mood: 'Engaging, cinematic, cultured, captivating, vibrant',
    exampleScenes: [
      'A sunlit loft studio with a vintage leather armchair, script folio, and atmospheric 35mm camera',
      'Atmospheric 35mm film set with soft ambient lights, script notes, and camera viewfinder',
      'An intimate vinyl listening room with warm wood panelling, turntable, and ambient evening glow',
    ],
  },
  'food-drink': {
    pillar: 'food-drink',
    theme: 'Culinary Craft, Seasonal Food & Mindful Dining',
    palette: ['Terracotta Red', 'Olive Green', 'Warm Ochre', 'Linen Cream'],
    visualMotifs: [
      'Authentic rustic kitchen tabletops with fresh seasonal produce',
      'Artisanal fermentation crocks, sourdough loaves, copper cookware',
      'Intimate dining moments with warm candlelight and linen napkins',
      'Close-up culinary craft and authentic plated dishes',
    ],
    lighting: 'Natural side window daylight with soft warm shadows, rustic ambient glow',
    cameraLens: '50mm f/1.8 prime lens, rich depth of field and authentic food texture',
    mood: 'Appetizing, artisanal, warm, grounded',
    exampleScenes: [
      'A freshly sliced crusty sourdough loaf on a weathered wooden cutting board with sea salt crystals',
      'A ceramic bowl of steaming rustic soup with fresh herbs and olive oil drizzle on a linen tablecloth',
      'Fresh seasonal ingredients, olive oil bottle, and ceramic bowls arranged on a sunlit kitchen island',
    ],
  },
  'life-hacks': {
    pillar: 'life-hacks' as any,
    theme: 'Smart Visual Shortcuts & Clever Everyday Life Solutions',
    palette: ['Electric Cyan', 'Crisp White', 'Deep Slate', 'Bright Amber', 'Fresh Mint'],
    visualMotifs: [
      'Dynamic visual arrangements of everyday household problem-solving objects',
      'Clever kitchen tools, organization shortcuts, and smart household fixes',
      'Clear, practical spatial setups with clean aesthetic focus',
    ],
    lighting: 'Bright, clean studio daylight with high clarity and crisp contrast',
    cameraLens: '35mm or 50mm f/2.0 prime lens with sharp focus on the items',
    mood: 'Clever, vibrant, dynamic, visual, helpful',
    exampleScenes: [
      'A smart kitchen pantry organization setup with tiered bamboo organizers in a bright modern kitchen',
      'A smart household cable management setup using simple everyday clips',
    ],
  },
};

export interface SafeEditorialFallback {
  url: string;
  alt: string;
  source: string;
  sourceUrl: string;
  license: string;
}

export const DEFAULT_SAFE_EDITORIAL_FALLBACKS: Record<PillarSlug, SafeEditorialFallback> = {
  health: {
    url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80',
    alt: 'Peaceful sunlit morning room with natural botanical elements for longevity and vital rest',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  wealth: {
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    alt: 'Modern architectural finance study with natural daylight for digital work and side hustles',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  home: {
    url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80',
    alt: 'Artisanal kitchen and organized living space with natural light',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  life: {
    url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
    alt: 'Curated contemporary wardrobe and personal style aesthetics',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  tools: {
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
    alt: 'Hands-on practical reference utilities, calculators, and decision tools',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  style: {
    url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
    alt: 'Curated contemporary wardrobe and tactile fabrics',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  travel: {
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    alt: 'Scenic coastal landscape with natural sunlight',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  'food-drink': {
    url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80',
    alt: 'Artisanal kitchen with fresh sourdough and culinary ingredients',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  'life-hacks': {
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
    alt: 'Hands-on practical solutions and clever tools',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  'tech-ai': {
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    alt: 'Minimalist designer workstation and precision hardware',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  money: {
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    alt: 'Modern architectural finance study with natural daylight',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  wellbeing: {
    url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80',
    alt: 'Peaceful sunlit morning room with natural botanical elements',
    source: 'Unsplash (Free)',
    sourceUrl: 'https://unsplash.com',
    license: 'LifeMode Safe Editorial Fallback',
  },
  entertainment: {
    url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80',
    alt: 'Atmospheric cinema auditorium with warm lighting and theatrical screen',
    source: 'Photo by Felix Mooneeram on Unsplash (Free)',
    sourceUrl: 'https://unsplash.com/photos/red-theater-chairs-inside-theater-evlkOfkQ5rE',
    license: 'LifeMode Safe Editorial Fallback',
  },
};

export function getFallbackImageForPillar(pillar: string): SafeEditorialFallback {
  const p = (pillar || 'style').toLowerCase() as PillarSlug;
  return DEFAULT_SAFE_EDITORIAL_FALLBACKS[p] || DEFAULT_SAFE_EDITORIAL_FALLBACKS.style;
}

export function resolveEditorialImageFallback(pillar: string, _title?: string): SafeEditorialFallback {
  return getFallbackImageForPillar(pillar);
}
