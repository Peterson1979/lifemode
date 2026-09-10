/**
 * Lightweight, zero-dependency RSS 2.0 and Atom XML feed parser.
 * Designed for reliable streaming and extraction of headline trends without heavy DOM parsers.
 */

export interface ParsedFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  categories: string[];
  approxTraffic?: string; // Google Trends specific (<ht:approx_traffic>)
}

export interface ParsedFeed {
  title?: string;
  link?: string;
  description?: string;
  items: ParsedFeedItem[];
}

/**
 * Unescapes common XML entities and HTML numeric/named entities.
 */
export function unescapeXml(text: string): string {
  if (!text) return '';

  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, '—')
    .replace(/&#8211;/g, '–')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
}

/**
 * Strips HTML tags and collapses whitespace.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return unescapeXml(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the inner text of a tag, supporting attributes and CDATA.
 */
function extractTagContent(xml: string, tagName: string): string | null {
  // Support namespaced tags e.g. ht:approx_traffic or atom:title
  const escapedTagName = tagName.replace(':', '\\:');
  const regex = new RegExp(`<${escapedTagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${escapedTagName}>`, 'i');
  const match = xml.match(regex);
  if (match && match[1] !== undefined) {
    return stripHtml(match[1]);
  }
  return null;
}

/**
 * Extracts attributes from self-closing or regular tags (e.g. <link href="..." />).
 */
function extractAttribute(xml: string, tagName: string, attrName: string): string | null {
  const escapedTagName = tagName.replace(':', '\\:');
  const regex = new RegExp(`<${escapedTagName}\\s+[^>]*?${attrName}=["']([^"']+)["'][^>]*>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Extracts multiple tag contents (e.g. multiple <category> tags).
 */
function extractAllTagsContent(xml: string, tagName: string): string[] {
  const escapedTagName = tagName.replace(':', '\\:');
  const regex = new RegExp(`<${escapedTagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${escapedTagName}>`, 'gi');
  const results: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    if (match[1]) {
      const cleaned = stripHtml(match[1]);
      if (cleaned && !results.includes(cleaned)) {
        results.push(cleaned);
      }
    }
  }

  // Also check Atom category attributes: <category term="design" />
  const termRegex = new RegExp(`<${escapedTagName}\\s+[^>]*?term=["']([^"']+)["'][^>]*>`, 'gi');
  while ((match = termRegex.exec(xml)) !== null) {
    if (match[1]) {
      const term = stripHtml(match[1]);
      if (term && !results.includes(term)) {
        results.push(term);
      }
    }
  }

  return results;
}

/**
 * Parses raw XML string into structured Feed representation.
 * Supports RSS 0.91, 1.0, 2.0 and Atom 1.0.
 */
export function parseXmlFeed(rawXml: string): ParsedFeed {
  if (!rawXml || typeof rawXml !== 'string') {
    return { items: [] };
  }

  const items: ParsedFeedItem[] = [];

  // Check if Atom feed (<feed> with <entry>)
  const isAtom = /<feed\b/i.test(rawXml) && /<entry\b/i.test(rawXml);

  if (isAtom) {
    const entryRegex = /<entry\b[\s\S]*?<\/entry>/gi;
    let entryMatch: RegExpExecArray | null;

    while ((entryMatch = entryRegex.exec(rawXml)) !== null) {
      const entryXml = entryMatch[0];
      const title = extractTagContent(entryXml, 'title') || '';
      
      // Link can be in <link href="..." /> or <link>...</link>
      let link = extractAttribute(entryXml, 'link', 'href') || extractTagContent(entryXml, 'link') || '';
      
      // If there are multiple links, prefer rel="alternate"
      const altLinkMatch = entryXml.match(/<link\s+[^>]*?rel=["']alternate["'][^>]*?href=["']([^"']+)["'][^>]*>/i);
      if (altLinkMatch) {
        link = altLinkMatch[1];
      }

      const description =
        extractTagContent(entryXml, 'summary') ||
        extractTagContent(entryXml, 'content') ||
        '';

      const pubDate =
        extractTagContent(entryXml, 'published') ||
        extractTagContent(entryXml, 'updated') ||
        '';

      const categories = extractAllTagsContent(entryXml, 'category');

      if (title.trim()) {
        items.push({
          title: title.trim(),
          link: link.trim(),
          pubDate: pubDate || undefined,
          description: description || undefined,
          categories,
        });
      }
    }

    const channelTitle = extractTagContent(rawXml.split(/<entry\b/i)[0] || '', 'title') || undefined;

    return {
      title: channelTitle,
      items,
    };
  }

  // RSS 2.0 / RSS 1.0 (<rss> / <rdf:RDF> with <item>)
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(rawXml)) !== null) {
    const itemXml = itemMatch[0];
    const title = extractTagContent(itemXml, 'title') || '';
    const link = extractTagContent(itemXml, 'link') || extractAttribute(itemXml, 'link', 'href') || '';
    const description = extractTagContent(itemXml, 'description') || extractTagContent(itemXml, 'content:encoded') || '';
    const pubDate = extractTagContent(itemXml, 'pubDate') || extractTagContent(itemXml, 'dc:date') || '';
    const approxTraffic = extractTagContent(itemXml, 'ht:approx_traffic') || undefined;
    const categories = extractAllTagsContent(itemXml, 'category');

    if (title.trim()) {
      items.push({
        title: title.trim(),
        link: link.trim(),
        pubDate: pubDate || undefined,
        description: description || undefined,
        categories,
        approxTraffic,
      });
    }
  }

  const headerSection = rawXml.split(/<item\b/i)[0] || '';
  const channelTitle = extractTagContent(headerSection, 'title') || undefined;

  return {
    title: channelTitle,
    items,
  };
}
