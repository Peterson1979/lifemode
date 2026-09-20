/**
 * Domain-specific typed payloads for LifeMode Topic Data Layer.
 * All payloads are strictly typed without `any`.
 */

/**
 * Single seismic event data.
 */
export interface EarthquakeItem {
  id: string;
  magnitude: number;
  place: string;
  time: string; // ISO 8601
  updatedTime?: string; // ISO 8601
  coordinates: {
    longitude: number;
    latitude: number;
    depthKm: number;
  };
  significance: number; // 0 - 1000
  url: string;
  tsunamiWarning: boolean;
}

export interface EarthquakeFeedData {
  summary: string;
  totalEventsCount: number;
  minMagnitude: number;
  items: EarthquakeItem[];
}

/**
 * Currency exchange rate representation.
 */
export interface FxRateItem {
  currency: string; // e.g. 'USD', 'GBP', 'JPY', 'CHF'
  symbol: string;
  rate: number;
  change24h?: number; // percentage change if available
}

export interface FxRatesData {
  baseCurrency: string; // e.g. 'EUR' or 'USD'
  date: string; // YYYY-MM-DD
  rates: FxRateItem[];
  availableCurrencies: string[];
}

/**
 * Location weather reading.
 */
export interface WeatherLocationReading {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  temperatureCelsius: number;
  temperatureFahrenheit: number;
  condition: string; // e.g. 'Clear sky', 'Partly cloudy', 'Light rain'
  conditionCode?: number;
  humidityPercent: number;
  windSpeedKmh: number;
  isDay: boolean;
  localTime?: string;
}

export interface WeatherData {
  locations: WeatherLocationReading[];
  primaryLocation?: WeatherLocationReading;
}

/**
 * Current news item representation (FreeNewsAPI.ai).
 */
export interface NewsItem {
  id?: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string; // ISO 8601
  snippet?: string;
  language?: string;
  country?: string;
  imageUrl?: string;
}

export interface NewsData {
  items: NewsItem[];
  featuredItem?: NewsItem;
  totalResults?: number;
}

/**
 * Economic & demographic indicator representation.
 */
export interface EconomicIndicator {
  indicatorId: string;
  indicatorName: string; // e.g. 'GDP Growth (Annual %)', 'Inflation, Consumer Prices (%)'
  countryCode: string; // ISO-3 or ISO-2
  countryName: string;
  value: number;
  unit: string; // e.g. '%', 'USD (Billions)', 'Years'
  year: number;
  previousValue?: number;
}

export interface EconomicData {
  indicators: EconomicIndicator[];
  regionOrGlobalSummary?: string;
}

/**
 * Nutritional and ingredient reference representation (USDA FoodData Central).
 */
export interface NutrientProfile {
  calories: number; // kcal
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  sugarGrams?: number;
  sodiumMg?: number;
  potassiumMg?: number;
}

export interface FoodNutritionItem {
  fdcId?: number | string;
  foodName: string;
  category: string;
  servingSize: string; // e.g. '100g' or '1 cup'
  nutrients: NutrientProfile;
  keyHighlights: string[]; // e.g. ['High in Polyphenols', 'Rich in Healthy Monounsaturated Fats']
}

export interface NutritionData {
  items: FoodNutritionItem[];
  featuredIngredient?: FoodNutritionItem;
}

/**
 * Open-source technology activity representation (GitHub REST API).
 */
export interface TechProjectActivity {
  repoName: string; // e.g. 'ollama/ollama', 'facebookresearch/llama'
  displayName: string;
  owner: string;
  description: string;
  language: string;
  starsCount: number;
  forksCount: number;
  latestReleaseTag?: string;
  latestReleaseDate?: string; // ISO 8601
  licenseName?: string;
  url: string;
}

export interface TechActivityData {
  projects: TechProjectActivity[];
  featuredProject?: TechProjectActivity;
}

/**
 * Curated knowledge / cultural context extract (Wikimedia REST API).
 */
export interface KnowledgeFactItem {
  title: string;
  extract: string;
  pageUrl: string;
  thumbnailUrl?: string;
  category: string; // e.g. 'Architecture', 'Art Movement', 'Design Philosophy'
}

export interface KnowledgeFactData {
  facts: KnowledgeFactItem[];
  featuredFact?: KnowledgeFactItem;
}
