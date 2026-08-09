/**
 * Enumeration of the supported product categories
 * within the Product & Inventory Management bounded context.
 * @enum {string}
 */
export const ProductCategory = Object.freeze({
    DAIRY:     'DAIRY',
    GRAINS:    'GRAINS',
    OILS:      'OILS',
    BEVERAGES: 'BEVERAGES',
    CLEANING:  'CLEANING',
    MEDICINE:  'MEDICINE',
    OTHER:     'OTHER'
});

/**
 * Enumeration of the supported product statuses.
 * @enum {string}
 */
export const ProductStatus = Object.freeze({
    ACTIVE:   'ACTIVE',
    INACTIVE: 'INACTIVE'
});

/**
 * Product entity within the Product & Inventory Management bounded context.
 *
 * Business rules:
 * - name must be a non-empty string.
 * - basePrice must be a number greater than 0.
 * - category must be one of the values defined in ProductCategory.
 * - status defaults to ACTIVE on creation.
 *
 * @class Product
 */
export class Product {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {number|null} [params.businessId=null]
     * @param {string}      [params.name='']
     * @param {string}      [params.description='']
     * @param {string}      [params.category=ProductCategory.OTHER]
     * @param {number}      [params.basePrice=0]
     * @param {string}      [params.status=ProductStatus.ACTIVE]
     */
    constructor({
                    id          = null,
                    businessId  = null,
                    name        = '',
                    description = '',
                    category    = ProductCategory.OTHER,
                    basePrice   = 0,
                    status      = ProductStatus.ACTIVE
                }) {
        this.id          = id;
        this.businessId  = businessId;
        this.name        = name;
        this.description = description;
        this.category    = category;
        this.basePrice   = basePrice;
        this.status      = status;
    }

    /**
     * Returns true when the product is available for sale and stock operations.
     * @returns {boolean}
     */
    get isActive() {
        return this.status === ProductStatus.ACTIVE;
    }
}