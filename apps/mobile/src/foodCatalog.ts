import { useData } from './api';
import snapshot from './content/food-catalog.json';

export type FoodItem = {
  id: string;
  name: string;
  storeId: string;
  category: string;
  imageUrl: string | null;
  sourceUrl: string;
  priceLabel: string | null;
  calories: number | null;
  proteinGrams: number | null;
  nutritionBasis: string | null;
};

export type FoodStore = {
  id: string;
  name: string;
  area: string;
  specialty: string;
  sourceUrl: string;
};
export type FoodCatalog = { updatedAt: string; stores: FoodStore[]; items: FoodItem[] };

/** The menus shipped inside the app: what the Food tab shows with no network. */
export const foodCatalog: FoodCatalog = snapshot;

/**
 * The live catalogue administrators edit, with the bundled snapshot behind it. The
 * snapshot also stands in until someone imports the catalogue into the database.
 */
export function useFoodCatalog(): FoodCatalog {
  const { data } = useData<FoodCatalog>('/food');
  if (!data?.items?.length || !data.stores?.length) return foodCatalog;
  return {
    updatedAt: data.updatedAt || foodCatalog.updatedAt,
    stores: data.stores,
    items: data.items,
  };
}
