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
  style: {
    pillar: 'style',
    theme: 'Contemporary Fashion, Personal Style & Beauty Aesthetics',
    palette: ['Terracotta Rose', 'Warm Alabaster', 'Silk Charcoal', 'Soft Amber', 'Muted Olive'],
    visualMotifs: [
      'Tactile fabric textures, tailored garments, and contemporary capsule wardrobe details',
      'Artisanal skincare bottles, amber glass dropper flacons, and minimalist beauty trays',
      'Natural makeup palettes, cosmetic brushes, and textured skincare formulations',
      'Clean modern vanity spaces with natural daylight and subtle architectural mirrors',
      'Natural hair textures, minimalist accessories, and elegant fragrance bottles',
    ],
    lighting: 'Soft diffused natural window daylight, luminous skin tones, and gentle warm shadows',
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
  entertainment: {
    pillar: 'entertainment',
    theme: 'Celebrity Stories, Cinema, Music & Contemporary Entertainment',
    palette: ['Rich Fuchsia', 'Cinema Gold', 'Velvet Plum', 'Warm Alabaster', 'Charcoal Night'],
    visualMotifs: [
      'Cinematic portraiture and authentic behind-the-scenes entertainment moments',
      'Atmospheric film studio lighting, cameras, vintage audio equipment, and instruments',
      'Curated screen arts, premiere red carpets, and music performance spaces',
      'Thoughtful profile settings: sunlit artists lofts, recording lounges, and intimate interviews',
    ],
    lighting: 'Atmospheric cinematic illumination, warm dramatic contrast, natural portrait daylight',
    cameraLens: '50mm or 85mm f/1.4 prime lens, beautiful shallow depth of field and filmic grain',
    mood: 'Engaging, cinematic, cultured, captivating, vibrant',
    exampleScenes: [
      'An artist or actor in a sunlit loft studio in thoughtful conversation beside a vintage armchair',
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
      'Hands assembling fresh seasonal ingredients on a sunlit kitchen island',
    ],
  },
};
