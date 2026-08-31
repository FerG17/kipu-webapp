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
 * Whether a product is sold in whole units (a can, a bag) or by weight
 * (rice, cheese — "al peso"). Only WEIGHT products may carry a fractional
 * quantity in a sale/intake/adjustment (X5 Bloque D).
 * @enum {string}
 */
export const UnitOfSale = Object.freeze({
    UNIT:   'UNIDAD',
    WEIGHT: 'PESO'
});

/**
 * How the product is physically packaged for purchase/intake. Purely
 * descriptive catalog data — carries no conversion factor and never feeds
 * into stock arithmetic (X6 #9).
 * @enum {string}
 */
export const UnidadDeMedida = Object.freeze({
    CAJA:    'CAJA',
    SACO:    'SACO',
    PAQUETE: 'PAQUETE',
    UNIDAD:  'UNIDAD'
});

/**
 * What the product is measured in for display purposes (e.g. a "Saco de
 * harina de 50kg" is unidadDeMedida=SACO, presentacion=KG). Distinct from
 * UnitOfSale above: purely informational, never affects quantity math
 * (X6 #8/#9).
 * @enum {string}
 */
export const Presentacion = Object.freeze({
    KG:     'KG',
    LITRO:  'LITRO',
    UNIDAD: 'UNIDAD'
});

/**
 * Which Presentacion values make sense for each UnidadDeMedida — purely for
 * cascading the dropdown UI (X6 #9), no arithmetic implication. E.g. a "Saco"
 * doesn't make sense measured in loose "unidades".
 * @type {Record<string, string[]>}
 */
export const PresentacionOptionsByUnidadDeMedida = Object.freeze({
    [UnidadDeMedida.CAJA]:    [Presentacion.KG, Presentacion.LITRO, Presentacion.UNIDAD],
    [UnidadDeMedida.SACO]:    [Presentacion.KG, Presentacion.LITRO],
    [UnidadDeMedida.PAQUETE]: [Presentacion.KG, Presentacion.LITRO, Presentacion.UNIDAD],
    [UnidadDeMedida.UNIDAD]:  [Presentacion.UNIDAD]
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
     * @param {string|null} [params.barcode=null]
     * @param {number[]}    [params.supplierIds=[]] - The suppliers this product can be sourced from (zero or more).
     * @param {string}      [params.unitOfSale=UnitOfSale.UNIT]
     * @param {string}      [params.unidadDeMedida=UnidadDeMedida.UNIDAD]
     * @param {string}      [params.presentacion=Presentacion.UNIDAD]
     */
    constructor({
                    id             = null,
                    businessId     = null,
                    name           = '',
                    description    = '',
                    category       = ProductCategory.OTHER,
                    basePrice      = 0,
                    status         = ProductStatus.ACTIVE,
                    barcode        = null,
                    supplierIds    = [],
                    unitOfSale     = UnitOfSale.UNIT,
                    unidadDeMedida = UnidadDeMedida.UNIDAD,
                    presentacion   = Presentacion.UNIDAD
                }) {
        this.id             = id;
        this.businessId     = businessId;
        this.name           = name;
        this.description    = description;
        this.category       = category;
        this.basePrice      = basePrice;
        this.status         = status;
        this.barcode        = barcode;
        this.supplierIds    = supplierIds;
        this.unitOfSale     = unitOfSale;
        this.unidadDeMedida = unidadDeMedida;
        this.presentacion   = presentacion;
    }

    /**
     * Returns true when the product is available for sale and stock operations.
     * @returns {boolean}
     */
    get isActive() {
        return this.status === ProductStatus.ACTIVE;
    }

    /** Whether this product allows a fractional quantity (sold "al peso") rather than whole units. */
    get isSoldByWeight() {
        return this.unitOfSale === UnitOfSale.WEIGHT;
    }
}