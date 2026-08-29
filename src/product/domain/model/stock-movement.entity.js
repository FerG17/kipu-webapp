/**
 * Enumeration of the supported stock movement types.
 *
 * Business rules:
 * - INTAKE     → stock increases; triggered by purchase reception or manual intake.
 * - SALE       → stock decreases; triggered by a completed POS sale.
 * - ADJUSTMENT → manual stock correction; direction depends on signed quantity.
 *
 * @enum {string}
 */
export const MovementType = Object.freeze({
    INTAKE:     'INTAKE',
    SALE:       'SALE',
    ADJUSTMENT: 'ADJUSTMENT'
});

/**
 * StockMovement entity within the Product & Inventory Management bounded context.
 * Records a single stock change event for a product.
 *
 * Business rules:
 * - For INTAKE, SALE and RETURN, quantity is always a positive integer —
 *   the type field alone determines direction.
 * - For ADJUSTMENT, quantity is signed: negative removes units, positive
 *   adds them (a manual correction can legitimately go either way).
 * - signedQuantity returns a negative value for SALE movements, and
 *   quantity as-is for every other type (already signed for ADJUSTMENT).
 *
 * @class StockMovement
 */
export class StockMovement {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {number|null} [params.productId=null]
     * @param {number|null} [params.businessId=null]
     * @param {number|null} [params.warehouseId=null]
     * @param {number}      [params.quantity=0]
     * @param {string}      [params.type=MovementType.INTAKE]
     * @param {string}      [params.supplier='']  - Free-text supplier name, only meaningful for INTAKE.
     * @param {string}      [params.note='']
     * @param {string}      [params.registeredAt='']
     * @param {number|null} [params.batchId=null]  - The lot this movement drew from/into, when it has one (never set for ADJUSTMENT).
     * @param {number|null} [params.unitCost=null]  - That lot's purchase price — Kardex's per-row cost column.
     */
    constructor({
                    id           = null,
                    productId    = null,
                    businessId   = null,
                    warehouseId  = null,
                    quantity     = 0,
                    type         = MovementType.INTAKE,
                    supplier     = '',
                    note         = '',
                    registeredAt = '',
                    batchId      = null,
                    unitCost     = null
                }) {
        this.id           = id;
        this.productId    = productId;
        this.businessId   = businessId;
        this.warehouseId  = warehouseId;
        this.quantity     = quantity;
        this.type         = type;
        this.supplier     = supplier;
        this.note         = note;
        this.registeredAt = registeredAt;
        this.batchId      = batchId;
        this.unitCost     = unitCost;
    }

    /**
     * Returns true when this movement increased stock — always true for
     * INTAKE/RETURN, never for SALE, and for ADJUSTMENT only when its own
     * signed quantity is positive (a correction can go either way).
     * @returns {boolean}
     */
    get isIntake() {
        if (this.type === MovementType.SALE) return false;
        if (this.type === MovementType.ADJUSTMENT) return this.quantity > 0;
        return true;
    }

    /**
     * Returns the quantity with the correct directional sign for display.
     * SALE → negative. INTAKE / RETURN → positive. ADJUSTMENT → already
     * signed as stored.
     * @returns {number}
     */
    get signedQuantity() {
        return this.type === MovementType.SALE ? -this.quantity : this.quantity;
    }
}