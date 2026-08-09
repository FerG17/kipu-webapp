/**
 * InventoryItem entity within the Product & Inventory Management bounded context.
 * Represents the current stock state of one product for a given business.
 *
 * Business rules:
 * - currentStock must be a non-negative integer.
 * - minimumStock is the threshold at or below which the product is considered low stock.
 * - stockStatus priority: CRITICAL (0 units) > LOW (> 0 but <= minimum) > NORMAL.
 *
 * @class InventoryItem
 */
export class InventoryItem {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {number|null} [params.productId=null]
     * @param {number|null} [params.businessId=null]
     * @param {number|null} [params.warehouseId=null]
     * @param {number}      [params.stockUnit=0]      - Field name used by json-server.
     * @param {number}      [params.minimumStock=0]
     * @param {string}      [params.updatedAt='']
     */
    constructor({
                    id           = null,
                    productId    = null,
                    businessId   = null,
                    warehouseId  = null,
                    stockUnit    = 0,
                    minimumStock = 0,
                    updatedAt    = ''
                }) {
        this.id           = id;
        this.productId    = productId;
        this.businessId   = businessId;
        this.warehouseId  = warehouseId;
        this.currentStock = stockUnit;
        this.minimumStock = minimumStock;
        this.updatedAt    = updatedAt;
    }

    /**
     * Returns true when current stock is exactly zero.
     * @returns {boolean}
     */
    get isCritical() {
        return this.currentStock === 0;
    }

    /**
     * Returns true when current stock is above zero but at or below the minimum threshold.
     * @returns {boolean}
     */
    get isLowStock() {
        return this.currentStock > 0 && this.currentStock <= this.minimumStock;
    }

    /**
     * Returns a stock status string used by the presentation layer for badge rendering.
     * Priority order: CRITICAL → LOW → NORMAL.
     *
     * @returns {'CRITICAL'|'LOW'|'NORMAL'}
     */
    get stockStatus() {
        if (this.isCritical) return 'CRITICAL';
        if (this.isLowStock) return 'LOW';
        return 'NORMAL';
    }
}