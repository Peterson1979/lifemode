/**
 * Food & Drink Editorial Vertical Content Taxonomy.
 * Defines stable topic slugs, human-readable labels, descriptions, and editorial intents.
 */

export interface FoodTaxonomyTopic {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  scope: 'editorial' | 'recipe' | 'hybrid';
}

export const FOOD_TAXONOMY_TOPICS: Record<string, FoodTaxonomyTopic> = {
  'food-drink': {
    slug: 'food-drink',
    name: 'Food & Drink',
    tagline: 'Culinary Craft, Recipes & Mindful Living',
    description: 'The overarching LifeMode editorial vertical exploring culinary arts, mindful dining, and kitchen culture.',
    scope: 'hybrid',
  },
  recipes: {
    slug: 'recipes',
    name: 'Recipes',
    tagline: 'Simple, Tested & Wholesome Dishes',
    description: 'Curated, clear recipes focused on whole ingredients, traditional techniques, and everyday utility.',
    scope: 'recipe',
  },
  ingredients: {
    slug: 'ingredients',
    name: 'Ingredients',
    tagline: 'Sourcing, Seasonality & Pantry Craft',
    description: 'Deep explorations into heritage grains, heirloom produce, cold-pressed oils, spices, and pantry foundations.',
    scope: 'editorial',
  },
  cooking: {
    slug: 'cooking',
    name: 'Cooking',
    tagline: 'Technique, Heat & Culinary Method',
    description: 'Practical guides to foundational culinary skills, sourdough fermentation, braising, roasting, and knife work.',
    scope: 'editorial',
  },
  'food-culture': {
    slug: 'food-culture',
    name: 'Food Culture',
    tagline: 'History, Tradition & Social Rituals',
    description: 'Longform cultural essays on regional cuisines, communal tables, historical foodways, and modern dining rituals.',
    scope: 'editorial',
  },
  drinks: {
    slug: 'drinks',
    name: 'Drinks',
    tagline: 'Craft Beverages, Coffee & Botanical Elixirs',
    description: 'Specialty coffee roasting, ceremonial teas, fermented shrubs, non-alcoholic aperitifs, and natural wines.',
    scope: 'hybrid',
  },
  'food-travel': {
    slug: 'food-travel',
    name: 'Food & Travel',
    tagline: 'Culinary Journeys & Regional Tables',
    description: 'Destination food guides, local markets, farm stays, coastal fisheries, and regional culinary traditions.',
    scope: 'editorial',
  },
  'seasonal-food': {
    slug: 'seasonal-food',
    name: 'Seasonal Food',
    tagline: 'Micro-Seasons, Harvests & Calendar Cooking',
    description: 'Cooking in rhythm with nature: spring greens, summer produce, autumn harvests, and winter roots.',
    scope: 'hybrid',
  },
  kitchen: {
    slug: 'kitchen',
    name: 'Kitchen',
    tagline: 'Tools, Spaces & Culinary Minimalism',
    description: 'Intentional kitchen design, enduring cookware, carbon steel care, pantry organization, and timeless tools.',
    scope: 'editorial',
  },
  'food-wellbeing': {
    slug: 'food-wellbeing',
    name: 'Food & Wellbeing',
    tagline: 'Nourishment, Longevity & Gut Ecology',
    description: 'Evidence-based culinary nutrition, fermented foods, anti-inflammatory whole meals, and mindful eating.',
    scope: 'editorial',
  },
  'food-trends': {
    slug: 'food-trends',
    name: 'Food Trends',
    tagline: 'Signals, Shifts & Contemporary Flavors',
    description: 'Observing authentic cultural movements in food, artisanal revivals, and shifting dining habits.',
    scope: 'editorial',
  },
};

export const FOOD_TOPIC_SLUGS = Object.keys(FOOD_TAXONOMY_TOPICS);

/**
 * Helper to validate if a given topic slug belongs to the Food & Drink vertical.
 */
export function isFoodTaxonomyTopic(slug: string): boolean {
  return slug in FOOD_TAXONOMY_TOPICS;
}
