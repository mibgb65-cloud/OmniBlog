import categoryData from "../content/categories.json";
import type { Locale } from "./content";

export type CategoryId = string;
export type Category = {
  id: CategoryId;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
};

export const categories = categoryData satisfies Category[];

export function getCategory(id: string | undefined): Category | undefined {
  return categories.find((category) => category.id === id);
}

export function getCategoryName(id: CategoryId, locale: Locale) {
  return getCategory(id)?.name[locale] ?? id;
}
