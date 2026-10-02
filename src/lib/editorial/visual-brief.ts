import type { PillarSlug } from './types.ts';
import type { ValidatableArticle } from './validation/types.ts';
import type { GeneratedArticle } from './generation/types.ts';
import type { PublishPackage } from './publishing/types.ts';

export type VisualType = 'real_world_identifiable' | 'editorial_graphic' | 'metaphorical_scene' | 'none';

/**
 * Internal structured representation of visual requirements for an article.
 */
export interface StructuredVisualBrief {
  primaryVisualSubject: string;
  primaryEntity: string;
  eventOrPersonOrPlace: string;
  visualType: VisualType;
  requiredVisualElements: string[];
  prohibitedVisualElements: string[];
  imageSearchQuery: string;
  aiGenerationPrompt: string;
  negativePrompt: string;
  isRealWorldIdentifiableRequired: boolean;
  isEditorialGraphicPreferred: boolean;
  aspectRatio: string;
  altText: string;
  explanation: string;
}

export interface VisualBriefOptions {
  pillar?: PillarSlug;
  tags?: string[];
}

/**
 * Normalizes input pillar to a valid PillarSlug.
 */
function normalizePillar(pillar?: string): PillarSlug {
  if (!pillar) return 'style';
  const p = pillar.toLowerCase().trim();
  if (p === 'discover' || p === 'now' || p === 'culture') return 'entertainment';
  const valid: PillarSlug[] = ['style', 'travel', 'food-drink', 'tech-ai', 'money', 'wellbeing', 'entertainment'];
  return valid.includes(p as PillarSlug) ? (p as PillarSlug) : 'style';
}

/**
 * Extracts a clean primary subject name from title.
 */
function extractSubject(title: string): string {
  return title
    .replace(/:\s*(what to know|what you need to know|a modern guide|inside the.*|career.*)$/i, '')
    .replace(/^(who is|how|why|inside|understanding|the craft of|the art of|the science of|the enduring appeal of|the creative partnership behind)\s+/i, '')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

/**
 * Builds a context-rich, domain-precise StructuredVisualBrief for any article.
 * Guarantees that specific entities, sports, locations, and events receive dedicated visual briefs.
 */
export function buildVisualBrief(
  article: ValidatableArticle | GeneratedArticle | PublishPackage | { title: string; description?: string; content?: string; pillar?: string; tags?: string[] },
  options: VisualBriefOptions = {}
): StructuredVisualBrief {
  const title = (article.title || '').trim();
  const description = (article.description || '').trim();
  const content = (('content' in article && typeof article.content === 'string') ? article.content : '').trim();
  const pillar = normalizePillar(options.pillar || ('pillar' in article ? (article.pillar as string) : undefined));
  const tags = options.tags || ('tags' in article && Array.isArray(article.tags) ? article.tags : []);

  const fullText = `${title} ${description} ${content.slice(0, 1000)} ${tags.join(' ')}`.toLowerCase();
  const cleanSubject = extractSubject(title);

  const requiredElements: string[] = [];
  const prohibitedElements: string[] = [
    'low-res pixelation',
    'watermarks',
    'blurry faces',
    'stock photography clichés',
    'garish neon overlays',
    'unrelated commercial billboards',
  ];

  let visualType: VisualType = 'metaphorical_scene';
  let isRealWorldIdentifiableRequired = false;
  let isEditorialGraphicPreferred = false;
  let primaryEntity = cleanSubject || title;
  let eventOrPersonOrPlace = cleanSubject;
  let searchQuery = `${cleanSubject} editorial`;
  let promptSubject = cleanSubject;
  let explanation = `Visual brief constructed for "${title}" in pillar ${pillar}.`;

  // ----------------------------------------------------
  // DOMAIN-SPECIFIC ENTITY / SPORT / LOCATION CLASSIFICATION
  // ----------------------------------------------------

  // 1. Baseball / Houston Astros / Cleveland Guardians / José Trevino
  if (/\b(astros|houston astros|guardians|cleveland guardians|trevino|josé trevino|baseball|mlb|playoff chase|magic number)\b/i.test(fullText)) {
    visualType = 'real_world_identifiable';
    isRealWorldIdentifiableRequired = true;

    if (/\bastros\b/i.test(fullText)) {
      primaryEntity = 'Houston Astros Baseball';
      eventOrPersonOrPlace = 'Houston Astros ballpark & team culture';
      searchQuery = 'Houston Astros baseball stadium Minute Maid Park';
      promptSubject = 'Editorial wide angle of professional baseball stadium diamond at twilight, Houston Astros navy and orange banner details, authentic Major League ballpark lighting, pristine infield clay';
      requiredElements.push('baseball diamond context', 'professional baseball stadium atmosphere', 'ballpark architecture');
    } else if (/\bguardians\b/i.test(fullText)) {
      primaryEntity = 'Cleveland Guardians Baseball';
      eventOrPersonOrPlace = 'Cleveland Guardians playoff race';
      searchQuery = 'Cleveland Guardians baseball Progressive Field diamond';
      promptSubject = 'Editorial perspective of Major League baseball stadium during playoff chase, Cleveland ballpark field architecture, autumn evening lighting, pristine turf';
      requiredElements.push('baseball field context', 'Major League ballpark architecture', 'autumn baseball atmosphere');
    } else if (/\btrevino\b/i.test(fullText)) {
      primaryEntity = 'José Trevino / Professional Catcher';
      eventOrPersonOrPlace = 'Major League Baseball catcher craft';
      searchQuery = 'baseball catcher mitt mask home plate';
      promptSubject = 'Authentic leather baseball catcher mitt and helmet resting on pristine home plate dirt, quiet stadium morning sunlight, tactile sports craft';
      requiredElements.push('baseball catcher gear', 'home plate dirt', 'authentic baseball equipment');
    } else {
      primaryEntity = 'Major League Baseball';
      eventOrPersonOrPlace = 'Professional baseball diamond';
      searchQuery = 'baseball stadium diamond field';
      promptSubject = 'Professional baseball field diamond at dusk, stadium architectural grandstand in soft focus, crisp infield baseline';
      requiredElements.push('baseball diamond', 'stadium field');
    }

    prohibitedElements.push(
      'musicians',
      'guitarists',
      'rock concerts',
      'soccer pitches',
      'cricket bats',
      'basketball courts',
      'ocean scenes',
      'cruise ships',
      'unrelated office workers'
    );
  }

  // 2. Cricket / Cricinfo
  else if (/\b(cricinfo|cricket|espncricinfo|test match|bowler|batsman|wicket|stumps|crease)\b/i.test(fullText)) {
    visualType = 'real_world_identifiable';
    primaryEntity = 'Cricinfo & International Cricket';
    eventOrPersonOrPlace = 'Cricket pitch & digital scorecard culture';
    searchQuery = 'cricket stadium pitch stumps leather cricket ball';
    promptSubject = 'Editorial perspective of pristine green cricket pitch, wooden stumps and bails in soft afternoon golden hour light, red leather cricket ball resting on turf';
    requiredElements.push('cricket pitch or equipment', 'stumps or leather cricket ball', 'cricket stadium atmosphere');
    prohibitedElements.push(
      'baseball diamond',
      'baseball bats',
      'american football',
      'soccer goalposts',
      'unrelated rock bands',
      'office desks'
    );
  }

  // 3. Soccer / Football / Friendlies / Ecuador vs South Korea / San Jose Earthquakes
  else if (/\b(friendlies|friendly match|ecuador.*korea|corea del sur|san jose earthquakes|soccer|fifa|international football)\b/i.test(fullText)) {
    visualType = 'real_world_identifiable';

    if (/\b(friendlies|friendly)\b/i.test(fullText)) {
      primaryEntity = 'International Soccer Friendlies';
      eventOrPersonOrPlace = 'International soccer exhibition match';
      searchQuery = 'soccer stadium pitch football match ball twilight';
      promptSubject = 'Atmospheric view of professional football stadium pitch under floodlights, official match ball on pristine manicured grass, quiet stadium architecture';
      requiredElements.push('soccer pitch or match ball', 'stadium under floodlights', 'football atmosphere');
    } else if (/\b(ecuador|corea|korea)\b/i.test(fullText)) {
      primaryEntity = 'Ecuador vs South Korea Matchup';
      eventOrPersonOrPlace = 'International football tactical contest';
      searchQuery = 'international soccer match pitch flags stadium';
      promptSubject = 'Editorial perspective of international football pitch sideline at dusk, tactical lines on grass, national team scarf draped on stadium railing in soft focus';
      requiredElements.push('football pitch context', 'international soccer atmosphere');
    } else if (/\bearthquakes\b/i.test(fullText)) {
      primaryEntity = 'San Jose Earthquakes';
      eventOrPersonOrPlace = 'MLS soccer stadium & Bay Area football';
      searchQuery = 'San Jose Earthquakes MLS soccer stadium pitch';
      promptSubject = 'MLS soccer pitch at golden hour, blue stadium seats in soft background, crisp white penalty box lines on grass';
      requiredElements.push('MLS soccer pitch', 'professional football turf');
    }

    prohibitedElements.push(
      'baseball mitts',
      'cricket bats',
      'american football helmets',
      'golf clubs',
      'unrelated concert crowds',
      'cruise ships'
    );
  }

  // 4. Oceans Calling Music Festival / Coastal Beach Festival
  else if (/\b(oceans calling|music festival.*beach|nor'easter.*festival)\b/i.test(fullText)) {
    visualType = 'real_world_identifiable';
    primaryEntity = 'Oceans Calling Festival';
    eventOrPersonOrPlace = 'Ocean City coastal music festival stage & Atlantic shoreline';
    searchQuery = 'Oceans Calling festival Ocean City beach stage Atlantic ocean';
    promptSubject = 'Editorial architectural photograph of outdoor festival stage erected along sandy Atlantic coastline, dramatic coastal sky, ocean surf in background, festival rigging without crowds';
    requiredElements.push('coastal festival stage', 'sandy beach or shoreline', 'dramatic Atlantic sky context');
    prohibitedElements.push(
      'office interior',
      'indoor conference room',
      'generic stock portrait',
      'dry desert scene',
      'subway station'
    );
  }

  // 5. Aviation / Delta Flight 2311 Incident
  else if (/\b(delta flight|aviation|rapid descent|flight diverted|boeing|airbus|cockpit|aircraft altitude)\b/i.test(fullText)) {
    visualType = 'editorial_graphic';
    isEditorialGraphicPreferred = true;
    primaryEntity = 'Commercial Aviation Safety';
    eventOrPersonOrPlace = 'Commercial aircraft in flight & flight path mechanics';
    searchQuery = 'commercial airplane high altitude flight clouds minimalist';
    promptSubject = 'Editorial aviation visual: commercial passenger aircraft silhouette cruising through calm cloud layers at high altitude, subtle flight altitude data lines, refined minimal lighting';
    requiredElements.push('commercial aviation context', 'aircraft or flight trajectory', 'aviation sky atmosphere');
    prohibitedElements.push(
      'ocean vacation scenes',
      'cruise ships',
      'guitarists',
      'musicians',
      'unrelated tourists on beaches',
      'office meetings'
    );
  }

  // 6. Travel: Specific Destination Intelligence
  else if (pillar === 'travel' || /\b(travel|destination|azores|laguna beach|japan|nyc|weather|retreats)\b/i.test(fullText)) {
    if (/\bazores\b/i.test(fullText)) {
      primaryEntity = 'The Azores Archipelago';
      eventOrPersonOrPlace = 'Volcanic hot springs and solitary Atlantic coastline';
      searchQuery = 'Azores volcanic hot spring caldera Atlantic coastline Portugal';
      promptSubject = 'Atmospheric volcanic hot springs and lush green caldera in the Azores, solitary Atlantic coastline cliffs, morning sea mist';
      requiredElements.push('Azores volcanic landscape or coastal caldera', 'lush Atlantic topography');
      prohibitedElements.push('tropical palm trees', 'desert sand dunes', 'crowded city highrises');
    } else if (/\blaguna beach\b/i.test(fullText)) {
      primaryEntity = 'Laguna Beach, California';
      eventOrPersonOrPlace = 'Modern architectural coastal cove';
      searchQuery = 'Laguna Beach Pacific coast cliffs modernist architecture cove';
      promptSubject = 'Laguna Beach coastal bluffs at golden hour, Pacific ocean swells meeting architectural sandstone coves, calm minimalist coastal atmosphere';
      requiredElements.push('Laguna Beach coastal bluffs', 'Pacific ocean sandstone cove');
      prohibitedElements.push('tropical Caribbean resort', 'snowy mountains', 'European cobblestone streets');
    } else if (/\bjapan\b/i.test(fullText)) {
      primaryEntity = 'Japan Travel & Urban Culture';
      eventOrPersonOrPlace = 'Japanese architectural streetscape & serene cedar temple';
      searchQuery = 'Japan quiet urban street traditional cedar architecture morning';
      promptSubject = 'Quiet traditional Japanese wooden architecture along serene cobblestone alley, morning mist, subtle modern design harmony';
      requiredElements.push('authentic Japanese architecture or quiet streetscape');
      prohibitedElements.push('generic Western city streets', 'tropical beaches', 'neon cyber clichés');
    } else if (/\b(weather.*nyc|nyc.*weather|new york.*weather)\b/i.test(fullText)) {
      primaryEntity = 'New York City Shifting Weather';
      eventOrPersonOrPlace = 'Manhattan urban skyline during weather transition';
      searchQuery = 'New York City Manhattan skyline moody storm clouds rain reflection';
      promptSubject = 'Editorial architectural view of Manhattan skyline under dramatic atmospheric storm clouds, clean rain reflections on urban street pavement, muted cinematic palette';
      requiredElements.push('New York City urban architecture', 'atmospheric weather sky');
      prohibitedElements.push('tropical islands', 'mountain pastures', 'sunny desert');
    } else if (/\bfire weather\b/i.test(fullText)) {
      primaryEntity = 'Fire Weather & Meteorological Alert';
      eventOrPersonOrPlace = 'Arid landscape under high wind meteorological conditions';
      searchQuery = 'arid golden hills high wind dry weather alert landscape';
      promptSubject = 'Editorial landscape of dry golden grassland hills under high-wind atmospheric sky, meteorological weather station in distance, stark natural light';
      requiredElements.push('dry meteorological landscape context');
      prohibitedElements.push('lush rainforest', 'underwater coral', 'indoor office');
    } else if (/\bminimalist.*coastal\b/i.test(fullText)) {
      primaryEntity = 'Minimalist Mediterranean Retreats';
      eventOrPersonOrPlace = 'Modernist secluded coastal villa';
      searchQuery = 'Mediterranean minimalist architecture coastal stone villa sea view';
      promptSubject = 'Secluded Mediterranean stone villa with minimalist geometric lines overlooking calm deep blue sea, natural limestone terraces, soft warm daylight';
      requiredElements.push('minimalist Mediterranean architecture', 'limestone terrace sea view');
      prohibitedElements.push('crowded tourist beaches', 'skyscrapers', 'generic stock selfies');
    } else if (/\bdark\b/i.test(fullText) && /\b(netflix|series)\b/i.test(fullText)) {
      primaryEntity = 'Dark Series Architectural Exploration';
      eventOrPersonOrPlace = 'Atmospheric German forest architecture & brutalist structures';
      searchQuery = 'brutalist concrete architecture moody pine forest mist Germany';
      promptSubject = 'Moody dense pine forest with architectural concrete modernist pavilion in deep fog, cinematic cold tones, quiet solitary path';
      requiredElements.push('misty pine forest', 'brutalist or architectural structure');
      prohibitedElements.push('tropical sunny beach', 'crowded shopping malls', 'bright neon city');
    } else {
      primaryEntity = cleanSubject;
      eventOrPersonOrPlace = cleanSubject;
      searchQuery = `${cleanSubject} authentic regional landscape`;
      promptSubject = `Atmospheric editorial travel landscape representing ${cleanSubject}, authentic natural light, spacious composition`;
      requiredElements.push('authentic destination landscape');
    }
  }

  // 7. Entertainment: Film, TV, Music, Astronomy
  else if (pillar === 'entertainment') {
    if (/\b(meteor|stargazing|perseid|astronomy)\b/i.test(fullText)) {
      primaryEntity = 'Meteor Shower & Dark Sky Astronomy';
      eventOrPersonOrPlace = 'Night sky celestial observation';
      searchQuery = 'meteor shower starry night sky mountain dark sky reserve';
      promptSubject = 'Breathtaking streak of a meteor across a crystalline dark sky filled with stars, mountain silhouette at horizon, pure deep cosmic atmosphere';
      requiredElements.push('starry night sky', 'meteor streak or astronomical observatory');
      prohibitedElements.push('office desk', 'daylight city', 'guitars');
    } else if (/\b(murphy|gerwig|baumbach|hartnett|actor|director|cinema|movie|film)\b/i.test(fullText)) {
      visualType = 'metaphorical_scene';
      primaryEntity = cleanSubject;
      eventOrPersonOrPlace = 'Cinematic craft & screen culture';
      searchQuery = '35mm cinema camera director viewfinder soundstage soft light';
      promptSubject = 'Vintage 35mm cinema camera and handwritten script on wooden table in warm atmospheric film soundstage, quiet cinematic depth';
      requiredElements.push('cinematic camera or film craft setting');
      prohibitedElements.push('office desk with pen', 'tabloid paparazzi flash', 'sports arena');
    } else if (/\b(chapman|acoustic|vinyl|soundtrack|audio)\b/i.test(fullText)) {
      primaryEntity = cleanSubject;
      eventOrPersonOrPlace = 'Acoustic music craftsmanship';
      searchQuery = 'acoustic guitar vintage recording studio warm light';
      promptSubject = 'Handcrafted acoustic guitar resting in sunlit historic recording atelier, natural wood textures, soft golden ambient light';
      requiredElements.push('acoustic musical instrument or studio atmosphere');
      prohibitedElements.push('office cubicle', 'sports field', 'fast food');
    }
  }

  // 8. Tech / AI:
  else if (pillar === 'tech-ai') {
    if (/\b(downdetector|outage)\b/i.test(fullText)) {
      visualType = 'editorial_graphic';
      isEditorialGraphicPreferred = true;
      primaryEntity = 'Internet Infrastructure & Outage Monitoring';
      searchQuery = 'server network status terminal minimalist telemetry';
      promptSubject = 'Clean editorial technical telemetry visual, network node status diagram on matte display, minimalist server rack in soft ambient studio daylight';
      requiredElements.push('minimalist network telemetry or server hardware');
      prohibitedElements.push('hacker in hoodie', 'green binary matrix code', 'broken cables');
    } else if (/\b(sovereign|local ai|hardware setup)\b/i.test(fullText)) {
      primaryEntity = 'Sovereign Local AI Hardware';
      searchQuery = 'minimalist developer workstation matte keyboard dual monitors natural light';
      promptSubject = 'Refined developer workspace with high-performance compact workstation, matte mechanical keyboard, warm oak desk, soft daylight';
      requiredElements.push('clean developer workstation', 'matte mechanical keyboard');
      prohibitedElements.push('generic business suits', 'glowing 3D cyborgs');
    } else if (/\b(vr glasses|headset|spatial)\b/i.test(fullText)) {
      primaryEntity = 'Spatial Computing & VR Glasses';
      searchQuery = 'modern spatial computing headset minimalist design studio';
      promptSubject = 'Sleek contemporary optical spatial headset resting on minimalist concrete pedestal, soft studio lighting, architectural product design';
      requiredElements.push('spatial computing headset design');
      prohibitedElements.push('unrelated people running', 'cyberpunk neon chaos');
    }
  }

  const negativePrompt = prohibitedElements.join(', ');
  const altText = `${title} — editorial visual representation of ${primaryEntity}`;

  return {
    primaryVisualSubject: promptSubject,
    primaryEntity,
    eventOrPersonOrPlace,
    visualType,
    requiredVisualElements: requiredElements,
    prohibitedVisualElements: prohibitedElements,
    imageSearchQuery: searchQuery,
    aiGenerationPrompt: promptSubject,
    negativePrompt,
    isRealWorldIdentifiableRequired,
    isEditorialGraphicPreferred,
    aspectRatio: '16:9',
    altText,
    explanation,
  };
}
