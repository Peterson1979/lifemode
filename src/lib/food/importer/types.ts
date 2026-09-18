export interface RawSourceRecipe {
  slug: string;
  title: string;
  description: string;
  sourceId: 'based-cooking' | 'public-domain-recipes';
  sourceAuthor?: string;
  sourceUrl: string;
  sourceLicense: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string | number;
  cuisine?: string;
  mealType?: string;
  dietaryTags?: string[];
  tags?: string[];
  ingredients: string[];
  directions: string[];
  notes?: string;
  // Local asset path
  imagePath: string;
  imageAlt: string;
  imageSource: string;
  imageSourceUrl: string;
  imageLicense: string;
}

export interface IngestedRecipeResult {
  slug: string;
  filePath: string;
  frontmatter: Record<string, any>;
  body: string;
  valid: boolean;
  errors?: string[];
}
