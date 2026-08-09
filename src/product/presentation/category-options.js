import { ProductCategory } from '../domain/model/product.entity.js';

/**
 * Fixed categories in their intended display order, excluding OTHER — OTHER
 * (and any custom category, see below) always sorts last, since it's the
 * catch-all/most-recently-created bucket, not a primary grouping.
 * @type {string[]}
 */
const BASE_CATEGORY_ORDER = [
    ProductCategory.DAIRY,
    ProductCategory.GRAINS,
    ProductCategory.OILS,
    ProductCategory.BEVERAGES,
    ProductCategory.CLEANING,
    ProductCategory.MEDICINE
];

/**
 * Returns true when a category value is a custom label the admin typed in
 * (i.e. anything outside the fixed ProductCategory enum), rather than a
 * predefined category.
 * @param {string} category
 * @returns {boolean}
 */
export function isCustomCategory(category) {
    return !Object.values(ProductCategory).includes(category);
}

/**
 * Builds the full category option list from a flat array of category values
 * already in use (by products, suppliers, or both — see below) — only the
 * fixed categories actually represented (in BASE_CATEGORY_ORDER's order),
 * then every distinct custom category currently in use (sorted by first
 * appearance), then OTHER last.
 *
 * An empty input resolves to just [OTHER]: fixed categories are not
 * pre-populated, they only appear once something actually uses them — same
 * treatment as custom categories, so once an admin creates one (via OTHER,
 * e.g. "Frutas y verduras"), it's immediately selectable everywhere a
 * category is chosen or filtered, without retyping it, and without ever
 * sorting below OTHER.
 * @param {string[]} categoryValues
 * @returns {string[]}
 */
export function orderedCategoryOptionsFromValues(categoryValues) {
    const usedCategories = new Set(categoryValues);
    const usedFixedCategories = BASE_CATEGORY_ORDER.filter(category => usedCategories.has(category));
    const customCategories = [...new Set(categoryValues.filter(isCustomCategory))];
    return [...usedFixedCategories, ...customCategories, ProductCategory.OTHER];
}

/**
 * Same as orderedCategoryOptionsFromValues, but without OTHER — for
 * search/filter dropdowns, where OTHER would always match zero records once
 * a custom category is properly typed in (OTHER is only a form trigger for
 * creating a new category, never a real persisted value to filter by).
 * @param {string[]} categoryValues
 * @returns {string[]}
 */
export function filterableCategoryOptionsFromValues(categoryValues) {
    return orderedCategoryOptionsFromValues(categoryValues).filter(category => category !== ProductCategory.OTHER);
}

/**
 * Product-specific convenience wrapper over orderedCategoryOptionsFromValues.
 * @param {Array<{category: string}>} products
 * @returns {string[]}
 */
export function orderedCategoryOptions(products) {
    return orderedCategoryOptionsFromValues(products.map(product => product.category));
}

/**
 * Product-specific convenience wrapper over filterableCategoryOptionsFromValues.
 * @param {Array<{category: string}>} products
 * @returns {string[]}
 */
export function filterableCategoryOptions(products) {
    return filterableCategoryOptionsFromValues(products.map(product => product.category));
}
