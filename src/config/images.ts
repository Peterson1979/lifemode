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
    'Natural ambient daylight and soft warm directional illumination',
    'Tactile organic textures (linen, wood, stone, matte paper, ceramics, foliage)',
    'Asymmetric magazine composition with intentional negative space',
    'Subtle natural 35mm film grain and soft depth of field (f/1.8 to f/2.8)',
    'Warm neutral color grade (parchment tones, soft charcoal, muted earth, subtle olive and camel)',
  ],
  negativePromptRules: [
    'No text overlays, typography, words, or letters',
    'No watermarks, signatures, or logos',
    'No neon glows, holographic grids, or futuristic sci-fi cybernetic effects',
    'No cheesy generic corporate stock photo poses or artificial smiles',
    'No plastic 3D CGI rendering or video game graphics',
    'No harsh flash overexposure or oversaturated fluorescent colors',
  ],
};

/**
 * Pillar-specific visual styles and aesthetic guidelines.
 */
export const PILLAR_IMAGE_STYLES: Record<PillarSlug, PillarImageStyle> = {
  life: {
    pillar: 'life',
    theme: 'Intentional Living & Daily Rituals',
    palette: ['Warm Linen', 'Terracotta Rose', 'Soft Birch', 'Clay Taupe'],
    visualMotifs: [
      'Sunlit morning domestic spaces',
      'Ceramic cups, brewing coffee, open notebooks',
      'Tactile organic textiles, natural wood tabletops',
      'Candid human presence in serene architectural interiors',
    ],
    lighting: 'Golden morning light filtering through linen curtains, warm soft shadows',
    cameraLens: '50mm f/1.8 prime lens, intimate eye-level perspective',
    mood: 'Tranquil, intentional, tactile, warm',
    exampleScenes: [
      'A quiet morning kitchen counter with hand-poured coffee, an open journal, and soft window light',
      'A minimalist Scandinavian living room with natural oak furniture and potted olive plant',
      'Hands arranging ceramics on a textured lime-washed plaster table',
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
      'A solitary traveler walking along an ancient coastal stone promenade in Portugal',
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
      'Subtle, tactile human-device interaction without screen glare',
      'Architectural hardware design, matte finishes, bespoke mechanical keyboards',
      'Deep focus environments with warm desk lamp illumination',
    ],
    lighting: 'Diffused daylight from modern office window paired with warm brass task lighting',
    cameraLens: '50mm f/1.4 lens, selective focus on tactile workspace details',
    mood: 'Intelligent, focused, tactile, human-centric',
    exampleScenes: [
      'A designer contemplating sketches beside a sleek minimalist workstation and potted greenery',
      'Overhead flat-lay of an artisanal leather notebook, fountain pen, and thin laptop on warm walnut wood',
      'Close-up of hands typing on a matte mechanical keyboard in a sunlit architectural studio',
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
      'Hands reviewing a bound investment thesis in a sunlit modern library',
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
      'Mindful movement or breathwork in a tranquil garden pavilion',
      'Lush botanical greenery and pure natural elements (water, stone, light)',
    ],
    lighting: 'Gentle sunrise glow, soft ethereal diffusion',
    cameraLens: '85mm f/1.8 lens, creamy bokeh, intimate stillness',
    mood: 'Peaceful, restorative, vital, serene',
    exampleScenes: [
      'Soft morning sunlight casting long shadows across crisp linen bedsheets and an open book',
      'A ceramic mug of matcha tea on a weathered cedar bench surrounded by bamboo foliage',
      'A person sitting peacefully in meditation beside a tranquil natural reflecting pool',
    ],
  },
  discover: {
    pillar: 'discover',
    theme: 'Curated Culture, Books & Design',
    palette: ['Warm Umber', 'Ochre Gold', 'Museum White', 'Aged Paper'],
    visualMotifs: [
      'Curated art gallery exhibitions with striking sculpture installations',
      'Architectural public library bookshelves with soaring natural skylights',
      'Mid-century modern design chairs and bespoke decorative objects',
      'Stacks of art monographs, museum catalog prints, and vintage journals',
    ],
    lighting: 'Museum gallery spotlighting balanced with natural clerestory daylight',
    cameraLens: '35mm f/2.8 lens, balanced architectural perspective and depth',
    mood: 'Curious, cultured, aesthetic, inspiring',
    exampleScenes: [
      'A solitary gallery visitor observing a contemporary minimalist sculpture in a sun-drenched museum',
      'A wooden workbench filled with architecture models, linen-bound books, and drafting instruments',
      'An iconic Scandinavian design chair positioned beside a floor-to-ceiling library wall',
    ],
  },
  now: {
    pillar: 'now',
    theme: 'Cultural Signals & Modern Zeitgeist',
    palette: ['Editorial Madder', 'Deep Charcoal', 'Concrete Grey', 'Warm Amber'],
    visualMotifs: [
      'Candid street documentary photography in bustling creative districts',
      'Contemporary fashion and design pop-up concept spaces',
      'Dynamic seasonal transition moments in urban environments',
      'Authentic cultural gathering and reportage perspective',
    ],
    lighting: 'Dynamic natural daylight, crisp authentic street exposure',
    cameraLens: '28mm / 35mm f/2.0 street documentary lens',
    mood: 'Timely, vibrant, observant, energetic',
    exampleScenes: [
      'People gathered outside a contemporary espresso bar in Milan on a crisp autumn morning',
      'A candid street view of a creative studio window in Tokyo reflecting golden evening sunlight',
      'A modern outdoor cultural pavilion filled with visitors engaged in lively conversation',
    ],
  },
};
