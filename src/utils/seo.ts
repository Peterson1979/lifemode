import { SITE_CONFIG } from '../config/site.ts';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface ArticleSchemaProps {
  title: string;
  description: string;
  url: string;
  pubDate: Date | string;
  updatedDate?: Date | string;
  authorName?: string;
  image?: string;
  pillarName?: string;
}

export interface RecipeSchemaProps {
  title: string;
  description: string;
  url: string;
  pubDate: Date | string;
  updatedDate?: Date | string;
  authorName?: string;
  image?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string | number;
  cuisine?: string;
  mealType?: string;
  ingredients?: string[];
  directions?: string[];
}

/**
 * Resolves a full canonical URL given an absolute or relative path.
 */
export function getCanonicalUrl(pathname: string, siteUrl: string = SITE_CONFIG.siteUrl): string {
  const cleanBase = siteUrl.replace(/\/+$/, '');
  const cleanPath = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return cleanPath ? `${cleanBase}/${cleanPath}/` : `${cleanBase}/`;
}

/**
 * Parses time string (e.g. "15 min", "1 hour 20 min", "80 min") into ISO 8601 duration format (e.g. "PT15M", "PT1H20M").
 */
export function parseDurationToISO(timeStr?: string): string | undefined {
  if (!timeStr) return undefined;
  const str = timeStr.toLowerCase().trim();

  // If already in ISO format
  if (str.startsWith('pt')) return timeStr;

  let totalMinutes = 0;
  const hourMatch = str.match(/(\d+)\s*(?:hours?|hrs?|h)/);
  const minMatch = str.match(/(\d+)\s*(?:minutes?|mins?|m)/);

  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1], 10) * 60;
  }
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1], 10);
  }

  // Fallback for simple number followed by "min"
  if (!hourMatch && !minMatch) {
    const rawNumberMatch = str.match(/^(\d+)/);
    if (rawNumberMatch) {
      totalMinutes = parseInt(rawNumberMatch[1], 10);
    }
  }

  if (totalMinutes <= 0) return undefined;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `PT${hours}H${minutes}M`;
  } else if (hours > 0) {
    return `PT${hours}H`;
  } else {
    return `PT${minutes}M`;
  }
}

/**
 * Generates Schema.org WebSite JSON-LD data.
 */
export function generateWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.siteUrl,
    description: SITE_CONFIG.description,
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_CONFIG.siteUrl}/favicon.svg`,
      },
    },
  };
}

/**
 * Generates Schema.org Article / NewsArticle JSON-LD data.
 */
export function generateArticleSchema(props: ArticleSchemaProps) {
  const pubDateISO = new Date(props.pubDate).toISOString();
  const updatedDateISO = props.updatedDate ? new Date(props.updatedDate).toISOString() : pubDateISO;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': props.url,
    },
    headline: props.title,
    description: props.description,
    image: props.image ? (props.image.startsWith('http') ? props.image : `${SITE_CONFIG.siteUrl}${props.image}`) : undefined,
    datePublished: pubDateISO,
    dateModified: updatedDateISO,
    author: {
      '@type': 'Person',
      name: props.authorName || SITE_CONFIG.author,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_CONFIG.siteUrl}/favicon.svg`,
      },
    },
    articleSection: props.pillarName,
  };
}

/**
 * Generates Schema.org Recipe JSON-LD structured data.
 * Adheres strictly to available factual fields without fabricating ratings or nutrition.
 */
export function generateRecipeSchema(props: RecipeSchemaProps) {
  const pubDateISO = new Date(props.pubDate).toISOString();
  const updatedDateISO = props.updatedDate ? new Date(props.updatedDate).toISOString() : pubDateISO;

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': props.url,
    },
    name: props.title,
    headline: props.title,
    description: props.description,
    image: props.image ? (props.image.startsWith('http') ? props.image : `${SITE_CONFIG.siteUrl}${props.image}`) : undefined,
    datePublished: pubDateISO,
    dateModified: updatedDateISO,
    author: {
      '@type': 'Person',
      name: props.authorName || SITE_CONFIG.author,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_CONFIG.siteUrl}/favicon.svg`,
      },
    },
  };

  const prepIso = parseDurationToISO(props.prepTime);
  const cookIso = parseDurationToISO(props.cookTime);
  const totalIso = parseDurationToISO(props.totalTime);

  if (prepIso) schema.prepTime = prepIso;
  if (cookIso) schema.cookTime = cookIso;
  if (totalIso) schema.totalTime = totalIso;
  if (props.servings) schema.recipeYield = String(props.servings);
  if (props.cuisine) schema.recipeCuisine = props.cuisine;
  if (props.mealType) schema.recipeCategory = props.mealType;

  if (props.ingredients && props.ingredients.length > 0) {
    schema.recipeIngredient = props.ingredients;
  }

  if (props.directions && props.directions.length > 0) {
    schema.recipeInstructions = props.directions.map((step) => ({
      '@type': 'HowToStep',
      text: step,
    }));
  }

  return schema;
}

/**
 * Generates Schema.org BreadcrumbList JSON-LD data.
 */
export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_CONFIG.siteUrl}${item.url}`,
    })),
  };
}
