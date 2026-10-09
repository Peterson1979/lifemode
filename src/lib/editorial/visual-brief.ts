import type { PillarSlug } from './types.ts';
import type { ValidatableArticle } from './validation/types.ts';
import type { GeneratedArticle } from './generation/types.ts';
import type { PublishPackage } from './publishing/types.ts';

/**
 * The 9 canonical visual types supported by LifeMode Editorial Visual System.
 */
export type SupportedVisualType =
  | 'editorial_photo'        // A. Real editorial photograph (food, style, interiors, travel, products)
  | 'editorial_infographic'  // B. Editorial infographic (mechanisms, systems, biological/physical concepts)
  | 'process_diagram'       // C. Process diagram (workflows, procedures, sequences, cleaning/cooking)
  | 'comparison_graphic'    // D. Comparison graphic (A vs B, material comparisons, alternatives)
  | 'decision_tree'         // E. Decision tree (product selection, method choice, troubleshooting)
  | 'timeline'              // F. Timeline (historical development, lifecycle, chronological processes)
  | 'formula_visual'        // G. Formula / calculation visual (capacity, sizing, ratios, calculations)
  | 'statistic_graphic'     // H. Chart / statistic graphic (real and sourced data only)
  | 'no_image';             // I. No-image (abstract concepts, pure code, or where visual adds no value)

/**
 * Union with legacy aliases to maintain full backwards compatibility.
 */
export type VisualType =
  | SupportedVisualType
  | 'real_world_identifiable'
  | 'editorial_graphic'
  | 'metaphorical_scene'
  | 'none';

/**
 * Reusable structured representation of an article's visual requirements.
 */
export interface StructuredVisualBrief {
  // 1. Core Editorial Visual Specification
  subject: string;
  editorialAngle: string;
  keyObjects: string[];
  keyConcepts: string[];
  requiredVisualRelationship: string;
  visualType: SupportedVisualType | VisualType;
  composition: string;
  orientation: 'landscape' | 'portrait' | 'square';
  aspectRatio: string;
  importantExclusions: string[];
  photographAppropriate: boolean;
  infographicPreferable: boolean;
  noImagePreferable: boolean;
  explanation: string;

  // 2. Search & Generation Attributes
  imageSearchQuery: string;
  aiGenerationPrompt: string;
  negativePrompt: string;
  altText: string;

  // 3. Backwards-Compatible Legacy Fields
  primaryVisualSubject: string;
  primaryEntity: string;
  eventOrPersonOrPlace: string;
  requiredVisualElements: string[];
  prohibitedVisualElements: string[];
  isRealWorldIdentifiableRequired: boolean;
  isEditorialGraphicPreferred: boolean;
}

export interface VisualBriefOptions {
  pillar?: PillarSlug | string;
  tags?: string[];
  format?: string;
}

/**
 * Normalizes input pillar to a valid PillarSlug.
 */
function normalizePillar(pillar?: string): PillarSlug {
  if (!pillar) return 'style';
  const p = pillar.toLowerCase().trim();
  if (p === 'discover' || p === 'now' || p === 'culture') return 'entertainment';
  if (p === 'food' || p === 'drink') return 'food-drink';
  if (p === 'tech' || p === 'ai') return 'tech-ai';
  const valid: PillarSlug[] = [
    'health',
    'wealth',
    'home',
    'life',
    'tech-ai',
    'tools',
    'style',
    'travel',
    'food-drink',
    'money',
    'wellbeing',
    'entertainment',
  ];
  return valid.includes(p as PillarSlug) ? (p as PillarSlug) : 'style';
}

/**
 * Extracts a clean primary subject name from title.
 */
function extractSubject(title: string): string {
  return title
    .replace(/:\s*(what to know|what you need to know|a modern guide|inside the.*|career.*)$/i, '')
    .replace(/^(who is|how to|how|why|inside|understanding|the craft of|the art of|the science of|the enduring appeal of|the creative partnership behind|the anatomy of)\s+/i, '')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

/**
 * Builds a structured, editorial-quality Visual Brief for any article.
 * Accurately classifies whether a real photo, structured infographic, process diagram,
 * decision tree, formula, timeline, or no-image is appropriate.
 */
export function buildVisualBrief(
  article:
    | ValidatableArticle
    | GeneratedArticle
    | PublishPackage
    | { title: string; description?: string; content?: string; pillar?: string; tags?: string[]; format?: string; infographic?: any },
  options: VisualBriefOptions = {}
): StructuredVisualBrief {
  const title = (article.title || '').trim();
  const description = (article.description || '').trim();
  const content = (('content' in article && typeof article.content === 'string') ? article.content : '').trim();
  const pillar = normalizePillar(options.pillar || ('pillar' in article ? (article.pillar as string) : undefined));
  const tags = options.tags || ('tags' in article && Array.isArray(article.tags) ? article.tags : []);
  const format = options.format || ('format' in article ? (article.format as string) : 'standard');

  const fullText = `${title} ${description} ${content.slice(0, 1000)} ${tags.join(' ')}`.toLowerCase();
  const cleanSubject = extractSubject(title);

  const keyObjects: string[] = [];
  const keyConcepts: string[] = [];
  const requiredElements: string[] = [];
  const prohibitedElements: string[] = [
    'text',
    'typography',
    'letters',
    'words',
    'writing',
    'captions',
    'labels',
    'headings',
    'titles',
    'numbers',
    'watermarks',
    'logos',
    'diagram labels',
    'flowchart text',
    'infographic text',
    'mock UI text',
    'low-res pixelation',
    'blurry faces',
    'stock photography clichés',
    'garish neon overlays',
    'unrelated commercial billboards',
    'unrelated people posing unnaturally',
  ];

  let visualType: SupportedVisualType | VisualType = 'editorial_photo';
  let photographAppropriate = true;
  let infographicPreferable = false;
  let noImagePreferable = false;
  let isRealWorldIdentifiableRequired = false;
  let isEditorialGraphicPreferred = false;

  let primaryEntity = cleanSubject || title;
  let eventOrPersonOrPlace = cleanSubject;
  let searchQuery = `${cleanSubject} editorial`;
  let promptSubject = `Contemporary editorial lifestyle photography representing ${cleanSubject}, tactile textures, natural daylight, strictly text-free`;
  let composition = 'Asymmetric natural perspective with soft depth of field, tactile material texture, and natural daylight';
  let requiredVisualRelationship = `Editorial showcase of authentic ${cleanSubject}`;
  let orientation: 'landscape' | 'portrait' | 'square' = 'landscape';
  let aspectRatio = '16:9';
  let editorialAngle = description || `Practical and aesthetic exploration of ${cleanSubject}`;
  let explanation = `Visual brief constructed for "${title}" in pillar ${pillar}.`;

  // ----------------------------------------------------
  // 1. INFOGRAPHIC & STRUCTURED VISUAL TYPE SELECTION
  // ----------------------------------------------------

  // Check if article has explicit infographic data or guide/tool intent
  const hasInfographicData = 'infographic' in article && Boolean(article.infographic);
  const infographicType = hasInfographicData && typeof article.infographic === 'object' ? article.infographic.type : null;

  if (infographicType === 'formula' || /\b(capacity|sizing|formula|calculate|dimensions|cubic feet|ratio|measure)\b/i.test(fullText)) {
    visualType = 'formula_visual';
    infographicPreferable = true;
    photographAppropriate = false;
    isEditorialGraphicPreferred = true;
    editorialAngle = 'Sizing, volumetric calculation, and capacity planning model';
    requiredVisualRelationship = 'Mathematical and spatial relationship between dimensions and capacity needs';
    keyConcepts.push('volumetric calculation', 'capacity threshold', 'sizing model');
    searchQuery = 'clean architectural workspace notebook ruler daylight';
    promptSubject = `Clean minimalist architectural workspace with measuring ruler, graphite pencil, and textured paper notebook, natural daylight, strictly text-free`;
    composition = 'Structured minimalist perspective with clean negative space and tactile drafting tools';
    explanation = `Article focuses on quantitative calculation; photographic workspace visual preferred, text diagrams rendered in HTML.`;
  } else if (infographicType === 'decision-tree' || /\b(decision|choosing|which.*should you|guide to choosing|vs\b.*matrix|material selector)\b/i.test(fullText)) {
    visualType = 'decision_tree';
    infographicPreferable = true;
    photographAppropriate = false;
    isEditorialGraphicPreferred = true;
    editorialAngle = 'Systematic branch-by-branch decision tree for optimal material or method choice';
    requiredVisualRelationship = 'Condition-to-recommendation decision branches';
    keyConcepts.push('decision tree', 'branching criteria', 'comparative evaluation');
    searchQuery = 'tactile material samples studio table natural daylight';
    promptSubject = `Tactile side-by-side material samples resting on a sunlit studio table, clean textures and natural stone, strictly text-free`;
    composition = 'Clean comparative arrangement of physical materials in soft natural window light';
    explanation = `Article addresses choice decisions; structured decision tree rendered in HTML, photo showcases physical materials.`;
  } else if (infographicType === 'comparison' || /\b(vs\b|versus|comparison|pros and cons|difference between|compared to)\b/i.test(fullText)) {
    visualType = 'comparison_graphic';
    infographicPreferable = true;
    photographAppropriate = true;
    isEditorialGraphicPreferred = false;
    editorialAngle = 'Side-by-side comparative analysis of trade-offs and performance characteristics';
    requiredVisualRelationship = 'Comparative matrix contrasting attributes A vs B';
    keyConcepts.push('side-by-side comparison', 'trade-offs', 'specifications matrix');
    searchQuery = 'curated material textures artisan studio daylight';
    promptSubject = `Side-by-side curated material textures and artisan design objects, soft natural daylight, strictly text-free`;
    composition = 'Side-by-side balanced dual composition with authentic tactile textures';
    explanation = `Comparative topic best served by tactile dual-material photography; data tables rendered in HTML.`;
  } else if (infographicType === 'timeline' || /\b(history of|evolution of|lifecycle|chronological|stages of fermentation|phases)\b/i.test(fullText)) {
    visualType = 'timeline';
    infographicPreferable = true;
    photographAppropriate = true;
    isEditorialGraphicPreferred = false;
    editorialAngle = 'Chronological progression through key development stages or historical eras';
    requiredVisualRelationship = 'Temporal sequence connecting milestones along a unified timeline track';
    keyConcepts.push('chronological milestone', 'progression stages', 'lifecycle');
    searchQuery = 'vintage and modern craft tools wooden table natural light';
    promptSubject = `Atmospheric vintage and modern craft tools arranged in chronological harmony on a wooden table, soft window light, strictly text-free`;
    composition = 'Progressive linear arrangement of physical artifacts with generous negative space';
    explanation = `Chronological progression best communicated through structured HTML timeline and authentic artifact photography.`;
  } else if (infographicType === 'mechanism' || infographicType === 'safety-pathway' || /\b(mechanism|polymerization|temperature danger zone|pathway|biological cycle|circadian)\b/i.test(fullText)) {
    visualType = 'editorial_infographic';
    infographicPreferable = true;
    photographAppropriate = true;
    isEditorialGraphicPreferred = false;
    editorialAngle = 'Scientific and mechanistic breakdown of underlying physical or chemical processes';
    requiredVisualRelationship = 'Step-by-step causal chain leading to optimal outcome or safety threshold';
    keyConcepts.push('scientific mechanism', 'causal chain', 'safety threshold');
    searchQuery = 'morning sunlight bedroom window water glass linen';
    promptSubject = `Luminous morning sunlight streaming through an open window onto a bedside carafe of water and crisp linen sheets, serene dawn atmosphere, strictly text-free`;
    composition = 'Atmospheric natural lighting capturing circadian morning ambience with natural depth of field';
    explanation = `Scientific/mechanistic process visual uses atmospheric environmental photography; diagrams rendered in HTML.`;
  } else if (infographicType === 'process-flow' || /\b(step-by-step|checklist|cleaning protocol|how to wash|how to clean|maintenance protocol|weatherization)\b/i.test(fullText)) {
    visualType = 'process_diagram';
    infographicPreferable = true;
    photographAppropriate = true;
    isEditorialGraphicPreferred = false;
    editorialAngle = 'Practical step-by-step execution protocol for optimal efficiency and error prevention';
    requiredVisualRelationship = 'Sequential procedural steps with visual progress indicators';
    keyConcepts.push('procedural sequence', 'workflow execution', 'maintenance protocol');
    searchQuery = 'artisan tools workbench natural daylight maintenance';
    promptSubject = `Tactile collection of home maintenance tools, draft-proofing foam tape, and brass pipe fittings on a rustic workbench, natural daylight, strictly text-free`;
    composition = 'Artisanal flat-lay of physical tools and materials on weathered timber surface';
    explanation = `Procedural topic benefits from tactile real-world tool photography; step lists rendered in HTML.`;
  }

  // ----------------------------------------------------
  // 2. ABSTRACT TOPICS / NO-IMAGE VALIDATION
  // ----------------------------------------------------
  else if (/\b(abstract economic policy|sec compliance regulation|pure theoretical model|api route schema)\b/i.test(fullText)) {
    visualType = 'no_image';
    noImagePreferable = true;
    photographAppropriate = false;
    searchQuery = '';
    promptSubject = 'none';
    explanation = `Abstract conceptual topic where forced imagery would be misleading or irrelevant; NO IMAGE preferred.`;
  }

  // ----------------------------------------------------
  // 3. REAL EDITORIAL PHOTOGRAPHY & DOMAIN INTELLIGENCE
  // ----------------------------------------------------

  // Baseball / Houston Astros / Cleveland Guardians / José Trevino
  else if (/\b(astros|houston astros|guardians|cleveland guardians|trevino|josé trevino|baseball|mlb|playoff chase|magic number)\b/i.test(fullText)) {
    visualType = 'real_world_identifiable';
    isRealWorldIdentifiableRequired = true;
    photographAppropriate = true;

    if (/\bastros\b/i.test(fullText)) {
      primaryEntity = 'Houston Astros Baseball';
      eventOrPersonOrPlace = 'Houston Astros ballpark & team culture';
      searchQuery = 'Houston Astros baseball stadium Minute Maid Park';
      promptSubject = 'Editorial wide angle of professional baseball stadium diamond at twilight, Houston Astros navy and orange banner details, authentic Major League ballpark lighting, pristine infield clay';
      requiredElements.push('baseball diamond context', 'professional baseball stadium atmosphere', 'ballpark architecture');
      keyObjects.push('baseball diamond', 'stadium grandstand', 'infield clay', 'ballpark pennant');
    } else if (/\bguardians\b/i.test(fullText)) {
      primaryEntity = 'Cleveland Guardians Baseball';
      eventOrPersonOrPlace = 'Cleveland Guardians playoff race';
      searchQuery = 'Cleveland Guardians baseball Progressive Field diamond';
      promptSubject = 'Editorial perspective of Major League baseball stadium during playoff chase, Cleveland ballpark field architecture, autumn evening lighting, pristine turf';
      requiredElements.push('baseball field context', 'Major League ballpark architecture', 'autumn baseball atmosphere');
      keyObjects.push('baseball diamond', 'Progressive Field architecture', 'autumn turf');
    } else if (/\btrevino\b/i.test(fullText)) {
      primaryEntity = 'José Trevino / Professional Catcher';
      eventOrPersonOrPlace = 'Major League Baseball catcher craft';
      searchQuery = 'baseball catcher mitt mask home plate';
      promptSubject = 'Authentic leather baseball catcher mitt and helmet resting on pristine home plate dirt, quiet stadium morning sunlight, tactile sports craft';
      requiredElements.push('baseball catcher gear', 'home plate dirt', 'authentic baseball equipment');
      keyObjects.push('leather catcher mitt', 'catcher mask', 'home plate');
    } else {
      primaryEntity = 'Major League Baseball';
      eventOrPersonOrPlace = 'Professional baseball diamond';
      searchQuery = 'baseball stadium diamond field';
      promptSubject = 'Professional baseball field diamond at dusk, stadium architectural grandstand in soft focus, crisp infield baseline';
      requiredElements.push('baseball diamond', 'stadium field');
      keyObjects.push('baseball diamond', 'infield baseline');
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

  // Cricket / Cricinfo
  else if (/\b(cricinfo|cricket|espncricinfo|test match|bowler|batsman|wicket|stumps|crease)\b/i.test(fullText)) {
    visualType = 'real_world_identifiable';
    primaryEntity = 'Cricinfo & International Cricket';
    eventOrPersonOrPlace = 'Cricket pitch & digital scorecard culture';
    searchQuery = 'cricket stadium pitch stumps leather cricket ball';
    promptSubject = 'Editorial perspective of pristine green cricket pitch, wooden stumps and bails in soft afternoon golden hour light, red leather cricket ball resting on turf';
    requiredElements.push('cricket pitch or equipment', 'stumps or leather cricket ball', 'cricket stadium atmosphere');
    keyObjects.push('wooden stumps', 'bails', 'red leather cricket ball', 'manicured cricket pitch');
    prohibitedElements.push('baseball diamond', 'baseball bats', 'american football', 'soccer goalposts', 'unrelated rock bands', 'office desks');
  }

  // Soccer / Football / Friendlies / Ecuador vs South Korea / San Jose Earthquakes
  else if (/\b(friendlies|friendly match|ecuador.*korea|corea del sur|san jose earthquakes|soccer|fifa|international football)\b/i.test(fullText)) {
    visualType = 'real_world_identifiable';
    photographAppropriate = true;

    if (/\b(friendlies|friendly)\b/i.test(fullText)) {
      primaryEntity = 'International Soccer Friendlies';
      eventOrPersonOrPlace = 'International soccer exhibition match';
      searchQuery = 'soccer stadium pitch football match ball twilight';
      promptSubject = 'Atmospheric view of professional football stadium pitch under floodlights, official match ball on pristine manicured grass, quiet stadium architecture';
      requiredElements.push('soccer pitch or match ball', 'stadium under floodlights', 'football atmosphere');
      keyObjects.push('official soccer match ball', 'manicured grass pitch', 'floodlight towers');
    } else if (/\b(ecuador|corea|korea)\b/i.test(fullText)) {
      primaryEntity = 'Ecuador vs South Korea Matchup';
      eventOrPersonOrPlace = 'International football tactical contest';
      searchQuery = 'international soccer match pitch flags stadium';
      promptSubject = 'Editorial perspective of international football pitch sideline at dusk, tactical lines on grass, national team scarf draped on stadium railing in soft focus';
      requiredElements.push('football pitch context', 'international soccer atmosphere');
      keyObjects.push('tactical sideline', 'national team scarf', 'stadium grandstand');
    } else if (/\bearthquakes\b/i.test(fullText)) {
      primaryEntity = 'San Jose Earthquakes';
      eventOrPersonOrPlace = 'MLS soccer stadium & Bay Area football';
      searchQuery = 'San Jose Earthquakes MLS soccer stadium pitch';
      promptSubject = 'MLS soccer pitch at golden hour, blue stadium seats in soft background, crisp white penalty box lines on grass';
      requiredElements.push('MLS soccer pitch', 'professional football turf');
      keyObjects.push('MLS soccer pitch', 'penalty box lines');
    }

    prohibitedElements.push('baseball mitts', 'cricket bats', 'american football helmets', 'golf clubs', 'unrelated concert crowds', 'cruise ships');
  }

  // Oceans Calling Music Festival
  else if (/\b(oceans calling|music festival.*beach|nor'easter.*festival)\b/i.test(fullText)) {
    visualType = 'real_world_identifiable';
    photographAppropriate = true;
    primaryEntity = 'Oceans Calling Festival';
    eventOrPersonOrPlace = 'Ocean City coastal music festival stage & Atlantic shoreline';
    searchQuery = 'Oceans Calling festival Ocean City beach stage Atlantic ocean';
    promptSubject = 'Editorial architectural photograph of outdoor festival stage erected along sandy Atlantic coastline, dramatic coastal sky, ocean surf in background, festival rigging without crowds';
    requiredElements.push('coastal festival stage', 'sandy beach or shoreline', 'dramatic Atlantic sky context');
    keyObjects.push('outdoor festival stage', 'sandy beach', 'ocean surf', 'stage rigging');
    prohibitedElements.push('office interior', 'indoor conference room', 'generic stock portrait', 'dry desert scene', 'subway station');
  }

  // Aviation Safety / Flight Incidents
  else if (/\b(delta flight|aviation|rapid descent|flight diverted|boeing|airbus|cockpit|aircraft altitude)\b/i.test(fullText)) {
    visualType = 'editorial_graphic';
    isEditorialGraphicPreferred = true;
    photographAppropriate = false;
    primaryEntity = 'Commercial Aviation Safety';
    eventOrPersonOrPlace = 'Commercial aircraft in flight & flight path mechanics';
    searchQuery = 'commercial airplane high altitude flight clouds minimalist';
    promptSubject = 'Editorial aviation visual: commercial passenger aircraft silhouette cruising through calm cloud layers at high altitude, subtle flight altitude data lines, refined minimal lighting';
    requiredElements.push('commercial aviation context', 'aircraft or flight trajectory', 'aviation sky atmosphere');
    keyObjects.push('aircraft silhouette', 'high-altitude clouds', 'subtle trajectory data lines');
    prohibitedElements.push('ocean vacation scenes', 'cruise ships', 'guitarists', 'musicians', 'unrelated tourists on beaches', 'office meetings');
  }

  // Travel / Destination Intelligence
  else if (pillar === 'travel' || /\b(travel|destination|azores|laguna beach|japan|nyc|weather|retreats)\b/i.test(fullText)) {
    visualType = 'editorial_photo';
    photographAppropriate = true;

    if (/\bazores\b/i.test(fullText)) {
      primaryEntity = 'The Azores Archipelago';
      searchQuery = 'Azores volcanic hot spring caldera Atlantic coastline Portugal';
      promptSubject = 'Atmospheric volcanic hot springs and lush green caldera in the Azores, solitary Atlantic coastline cliffs, morning sea mist';
      requiredElements.push('Azores volcanic landscape or coastal caldera', 'lush Atlantic topography');
      keyObjects.push('volcanic thermal spring', 'caldera rim', 'Atlantic sea mist');
      prohibitedElements.push('tropical palm trees', 'desert sand dunes', 'crowded city highrises');
    } else if (/\blaguna beach\b/i.test(fullText)) {
      primaryEntity = 'Laguna Beach, California';
      searchQuery = 'Laguna Beach Pacific coast cliffs modernist architecture cove';
      promptSubject = 'Laguna Beach coastal bluffs at golden hour, Pacific ocean swells meeting architectural sandstone coves, calm minimalist coastal atmosphere';
      requiredElements.push('Laguna Beach coastal bluffs', 'Pacific ocean sandstone cove');
      keyObjects.push('sandstone bluffs', 'Pacific ocean cove', 'modernist coastal home');
      prohibitedElements.push('tropical Caribbean resort', 'snowy mountains', 'European cobblestone streets');
    } else if (/\bjapan\b/i.test(fullText)) {
      primaryEntity = 'Japan Travel & Urban Culture';
      searchQuery = 'Japan quiet urban street traditional cedar architecture morning';
      promptSubject = 'Quiet traditional Japanese wooden architecture along serene cobblestone alley, morning mist, subtle modern design harmony';
      requiredElements.push('authentic Japanese architecture or quiet streetscape');
      keyObjects.push('cedar machiya facade', 'stone-paved alley', 'morning lantern');
      prohibitedElements.push('generic Western city streets', 'tropical beaches', 'neon cyber clichés');
    } else {
      primaryEntity = cleanSubject;
      searchQuery = `${cleanSubject} authentic regional landscape`;
      promptSubject = `Atmospheric editorial travel landscape representing ${cleanSubject}, authentic natural light, spacious composition`;
      requiredElements.push('authentic destination landscape');
    }
  }

  // Culinary / Food & Drink
  else if (pillar === 'food-drink' || /\b(vinegar|sourdough|hummus|soup|lentil|tahini|cast iron|coffee|cooking)\b/i.test(fullText)) {
    visualType = 'editorial_photo';
    photographAppropriate = true;
    primaryEntity = cleanSubject;
    searchQuery = `${cleanSubject} culinary kitchen ingredients artisanal daylight`;
    promptSubject = `Artisanal culinary photograph of authentic ${cleanSubject}, warm organic kitchen tabletop, natural window light, tactile ceramic bowls, fresh rustic ingredients`;
    requiredElements.push('culinary kitchen setting', 'natural window light', 'tactile organic ingredients');
    keyObjects.push('artisan kitchen cookware', 'ceramic bowl', 'fresh organic produce');
    prohibitedElements.push('fast food plastic packaging', 'harsh flash glare', 'generic stock restaurant');
  }

  // Style & Personal Care
  else if (pillar === 'style' || /\b(capsule wardrobe|skincare|fragrance|double cleansing|wool|linen|hair care)\b/i.test(fullText)) {
    visualType = 'editorial_photo';
    photographAppropriate = true;
    primaryEntity = cleanSubject;
    searchQuery = `${cleanSubject} minimalist editorial aesthetic tactile natural daylight`;
    promptSubject = `Minimalist editorial flat-lay or tactile close-up representing ${cleanSubject}, warm natural daylight, linen textures, elegant neutral color grade`;
    requiredElements.push('tactile material texture', 'natural daylight', 'minimalist aesthetic');
    keyObjects.push('linen texture', 'amber glass apothecary bottle', 'natural materials');
    prohibitedElements.push('glamour paparazzi flash', 'heavy artificial makeup', 'garish neon colors');
  }

  // Tech & AI Workflows
  else if (pillar === 'tech-ai') {
    if (/\b(downdetector|outage)\b/i.test(fullText)) {
      visualType = 'editorial_graphic';
      isEditorialGraphicPreferred = true;
      photographAppropriate = false;
      primaryEntity = 'Internet Infrastructure & Outage Monitoring';
      searchQuery = 'server network status terminal minimalist telemetry';
      promptSubject = 'Clean editorial technical telemetry visual, network node status diagram on matte display, minimalist server rack in soft ambient studio daylight';
      requiredElements.push('minimalist network telemetry or server hardware');
      prohibitedElements.push('hacker in hoodie', 'green binary matrix code', 'broken cables');
    } else if (/\b(sovereign|local ai|hardware setup)\b/i.test(fullText)) {
      visualType = 'editorial_photo';
      photographAppropriate = true;
      primaryEntity = 'Sovereign Local AI Hardware';
      searchQuery = 'minimalist developer workstation matte keyboard dual monitors natural light';
      promptSubject = 'Refined developer workspace with high-performance compact workstation, matte mechanical keyboard, warm oak desk, soft daylight';
      requiredElements.push('clean developer workstation', 'matte mechanical keyboard');
      prohibitedElements.push('generic business suits', 'glowing 3D cyborgs');
    } else {
      visualType = 'editorial_photo';
      photographAppropriate = true;
      primaryEntity = cleanSubject;
      searchQuery = `${cleanSubject} modern workspace minimalist technology`;
      promptSubject = `Contemporary human-centric workspace reflecting ${cleanSubject}, warm architectural daylight, tactile oak wood desk`;
    }
  }

  const negativePrompt = prohibitedElements.join(', ');
  const altText = `${title} — editorial visual representation of ${primaryEntity}`;

  return {
    subject: cleanSubject || title,
    editorialAngle,
    keyObjects,
    keyConcepts,
    requiredVisualRelationship,
    visualType,
    composition,
    orientation,
    aspectRatio,
    importantExclusions: prohibitedElements,
    photographAppropriate,
    infographicPreferable,
    noImagePreferable,
    explanation,
    imageSearchQuery: searchQuery,
    aiGenerationPrompt: promptSubject,
    negativePrompt,
    altText,

    // Legacy field mappings
    primaryVisualSubject: promptSubject,
    primaryEntity,
    eventOrPersonOrPlace,
    requiredVisualElements: requiredElements,
    prohibitedVisualElements: prohibitedElements,
    isRealWorldIdentifiableRequired,
    isEditorialGraphicPreferred,
  };
}
