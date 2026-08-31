/**
 * Application service store for the product category catalog (X6 #5) — a
 * per-business list of category names, fed to the product form's dropdown
 * and quick "+" inline-create button, replacing the old "type anything
 * under Otros" hardcoded/free-text vocabulary.
 *
 * @module useCategoryStore
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { CategoryApi } from '../infrastructure/category.api.js';

const categoryApi = new CategoryApi();

const useCategoryStore = defineStore('category', () => {

    /** @type {import('vue').Ref<Array<{id: number, name: string}>>} */
    const categories = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const categoriesLoaded = ref(false);

    /**
     * Fetches every category in the authenticated business's catalog —
     * seeded with the fixed vocabulary (Dairy/Grains/.../Other) at sign-up,
     * plus whatever custom categories were quick-created since.
     * @returns {Promise<void>}
     */
    function fetchCategories() {
        return categoryApi.getCategories()
            .then(response => {
                categories.value = response.data;
                categoriesLoaded.value = true;
            });
    }

    /**
     * Quick-creates a category and appends it to local state.
     * @param {string} name
     * @returns {Promise<{id: number, name: string}>}
     */
    function addCategory(name) {
        return categoryApi.createCategory({ name })
            .then(response => {
                categories.value.push(response.data);
                return response.data;
            });
    }

    return { categories, categoriesLoaded, fetchCategories, addCategory };
});

export default useCategoryStore;
