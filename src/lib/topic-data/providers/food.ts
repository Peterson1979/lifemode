import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { NutritionData, FoodNutritionItem, NutrientProfile } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface UsdaRawNutrient {
  nutrientName?: string;
  nutrientNumber?: string;
  value?: number;
  unitName?: string;
}

interface UsdaRawFoodItem {
  fdcId?: number;
  description?: string;
  foodCategory?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: UsdaRawNutrient[];
}

interface UsdaRawResponse {
  foods?: UsdaRawFoodItem[];
}

export class UsdaFoodDataProvider extends BaseTopicDataProvider<NutritionData> {
  readonly providerId = 'usda-fooddata';
  readonly name = 'USDA FoodData Central';
  readonly domain: DataDomain = 'nutrition';
  readonly defaultPillar: PillarSlug = 'food-drink';

  readonly source: DataSource = {
    id: 'usda-fdc',
    name: 'U.S. Department of Agriculture (USDA)',
    url: 'https://fdc.nal.usda.gov',
    attribution: 'Nutritional data sourced from USDA FoodData Central',
    license: 'Public Domain',
    isOfficial: true,
  };

  protected getEndpointUrl(options: ProviderRequestOptions): string {
    const apiKey =
      options.apiKey ||
      (typeof process !== 'undefined' && process.env?.FDC_API_KEY) ||
      'DEMO_KEY';
    return `https://api.nal.usda.gov/fdc/v1/foods/search?query=wild+salmon&pageSize=2&dataType=Foundation,Survey%20(FNDDS)&api_key=${apiKey}`;
  }

  protected validateAndNormalize(raw: unknown): NutritionData {
    if (!raw || typeof raw !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'USDA FoodData response is not an object');
    }

    const payload = raw as UsdaRawResponse;
    if (!Array.isArray(payload.foods) || payload.foods.length === 0) {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'USDA response missing foods array');
    }

    const items: FoodNutritionItem[] = [];

    for (const food of payload.foods) {
      if (!food.description) continue;

      const nutrients: NutrientProfile = {
        calories: 0,
        proteinGrams: 0,
        carbsGrams: 0,
        fatGrams: 0,
        fiberGrams: 0,
      };

      if (Array.isArray(food.foodNutrients)) {
        for (const n of food.foodNutrients) {
          const name = (n.nutrientName || '').toLowerCase();
          const val = typeof n.value === 'number' ? n.value : 0;

          if (name.includes('energy') && (n.unitName?.toLowerCase() === 'kcal' || !n.unitName)) {
            nutrients.calories = Math.round(val);
          } else if (name.includes('protein')) {
            nutrients.proteinGrams = Number(val.toFixed(1));
          } else if (name.includes('carbohydrate')) {
            nutrients.carbsGrams = Number(val.toFixed(1));
          } else if (name.includes('total lipid') || name === 'fat') {
            nutrients.fatGrams = Number(val.toFixed(1));
          } else if (name.includes('fiber')) {
            nutrients.fiberGrams = Number(val.toFixed(1));
          }
        }
      }

      items.push({
        fdcId: food.fdcId,
        foodName: food.description,
        category: food.foodCategory || 'Culinary Ingredient',
        servingSize: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit || 'g'}` : '100g serving',
        nutrients,
        keyHighlights: [
          `Calories: ${nutrients.calories} kcal`,
          `Protein: ${nutrients.proteinGrams}g`,
          `Healthy Fats: ${nutrients.fatGrams}g`,
        ],
      });
    }

    return {
      items,
      featuredIngredient: items[0],
    };
  }

  protected getTitle(_data: NutritionData | null): string {
    return 'Ingredient Nutrient Reference Profile';
  }

  protected getSubtitle(data: NutritionData | null): string {
    if (data && data.featuredIngredient) {
      return `Nutrient profile for ${data.featuredIngredient.foodName} (${data.featuredIngredient.servingSize})`;
    }
    return 'Official USDA FoodData Central nutritional values';
  }
}
