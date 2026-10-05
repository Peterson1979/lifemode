export interface CuratedProduct {
  id: string;
  name: string;
  brand?: string;
  category: 'kitchen' | 'home' | 'cleaning' | 'storage' | 'style' | 'self-care' | 'tech';
  description: string;
  editorialNote: string;
  affiliateUrl: string;
  asin?: string;
  priceRange?: string;
  badge?: string;
  imageUrl?: string;
}

export interface DailyIdeasPicksData {
  heading?: string;
  kicker?: string;
  subheading?: string;
  items: CuratedProduct[];
}
