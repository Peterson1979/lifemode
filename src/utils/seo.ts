import { SITE_CONFIG } from '../config/site';

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

/**
 * Resolves a full canonical URL given an absolute or relative path.
 */
export function getCanonicalUrl(pathname: string, siteUrl: string = SITE_CONFIG.siteUrl): string {
  const cleanBase = siteUrl.replace(/\/+$/, '');
  const cleanPath = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return cleanPath ? `${cleanBase}/${cleanPath}/` : `${cleanBase}/`;
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
