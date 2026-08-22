/**
 * Application service store for the Product & Inventory Management bounded context.
 *
 * Business rules enforced here:
 * - fetchProducts and fetchInventory load data scoped to the authenticated business.
 * - A product cannot be deleted when its inventory record has currentStock > 0.
 * - registerStockIntake quantity must be a positive integer greater than zero.
 * - registerStockIntake calls the backend's atomic stock-intake command, which
 *   sums into the existing InventoryItem or creates one, and records the
 *   StockMovement, all server-side — this store never persists a stock
 *   movement directly (there is no POST /stock-movements on the real backend).
 * - stockStatusCounts joins products with their inventory items to compute
 *   { normal, low, critical } counts for the summary cards in the list view.
 *
 * @module useProductStore
 */
import { defineStore }  from 'pinia';
import { computed, ref } from 'vue';
import { ProductApi }               from '../infrastructure/product.api.js';
import { ProductAssembler }         from '../infrastructure/product.assembler.js';
import { InventoryItemAssembler }   from '../infrastructure/inventory-item.assembler.js';
import { InventoryItem }            from '../domain/model/inventory-item.entity.js';
import { StockMovementAssembler }   from '../infrastructure/stock-movement.assembler.js';
import { MovementType }             from '../domain/model/stock-movement.entity.js';
import { ProductStatus }            from '../domain/model/product.entity.js';
import { warnIfTruncated }          from '../../shared/infrastructure/pagination.js';

const productApi = new ProductApi();

/**
 * Parses a date-only string (yyyy-mm-dd, as stored on batch.expiration) into a
 * Date at local midnight. `new Date('yyyy-mm-dd')` parses as UTC midnight,
 * which in a timezone behind UTC (e.g. Peru, UTC-5) displays/compares as the
 * previous day — this avoids that off-by-one.
 * @param {string} dateOnlyString - 'yyyy-mm-dd'.
 * @returns {Date}
 */
export function parseLocalDate(dateOnlyString) {
    const [year, month, day] = dateOnlyString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

const useProductStore = defineStore('product', () => {

    /** @type {import('vue').Ref<import('../domain/model/product.entity.js').Product[]>} */
    const products = ref([]);

    /**
     * Deactivated products only — populated on demand by fetchInactiveProducts,
     * used by the "reactivate a product" screen. GetProducts excludes these
     * by default, so they live in a separate ref rather than mixed into
     * `products` (which every stock/status computation above assumes is
     * active-only).
     * @type {import('vue').Ref<import('../domain/model/product.entity.js').Product[]>}
     */
    const inactiveProducts = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const inactiveProductsLoaded = ref(false);

    /** @type {import('vue').Ref<import('../domain/model/inventory-item.entity.js').InventoryItem[]>} */
    const inventory = ref([]);

    /** @type {import('vue').Ref<import('../domain/model/stock-movement.entity.js').StockMovement[]>} */
    const stockMovements = ref([]);

    /**
     * Raw batch resources (id, productId, expiration, status) across every product.
     * Used to determine which products have stock expiring soon — batches carry no
     * businessId of their own, so scoping happens by matching productId against the
     * already business-scoped `products` list.
     * @type {import('vue').Ref<Array>}
     */
    const batches = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const batchesLoaded = ref(false);

    /** @type {import('vue').Ref<boolean>} */
    const stockMovementsLoaded = ref(false);

    /**
     * Set when the last fetchAllStockMovements call failed (e.g. a CASHIER
     * hitting the backend's 403 on GET /stock-movements), so the Movimientos
     * tab can show the real reason instead of an empty state indistinguishable
     * from "no movements yet".
     * @type {import('vue').Ref<Error|null>}
     */
    const stockMovementsError = ref(null);

    /** @type {import('vue').Ref<boolean>} */
    const productsLoaded = ref(false);

    /** @type {import('vue').Ref<boolean>} */
    const inventoryLoaded = ref(false);

    /**
     * Total number of loaded products.
     * @type {import('vue').ComputedRef<number>}
     */
    const productsCount = computed(() => products.value.length);

    /**
     * Summary counts for the three stock status categories.
     * Joins each product with its stock total across every warehouse it's
     * split into (see getTotalInventoryForProduct).
     * Products with no inventory record are counted as CRITICAL.
     *
     * @type {import('vue').ComputedRef<{normal: number, low: number, critical: number}>}
     */
    const stockStatusCounts = computed(() => {
        const counts = { normal: 0, low: 0, critical: 0 };
        products.value.forEach(product => {
            const inventoryItem = getTotalInventoryForProduct(product.id);
            if (!inventoryItem) {
                counts.critical += 1;
                return;
            }
            const status = inventoryItem.stockStatus;
            if (status === 'NORMAL')   counts.normal   += 1;
            if (status === 'LOW')      counts.low      += 1;
            if (status === 'CRITICAL') counts.critical += 1;
        });
        return counts;
    });

    // ─── Queries ──────────────────────────────────────────────────────────────

    /**
     * Finds a product entity by its numeric identifier.
     * @param {number|string} id
     * @returns {import('../domain/model/product.entity.js').Product|undefined}
     */
    function getProductById(id) {
        return products.value.find(product => product.id === parseInt(id));
    }

    /**
     * Looks up an active product by its exact barcode, among the products
     * already loaded for the business (the full catalog is loaded upfront,
     * see fetchProducts — no dedicated backend lookup endpoint needed).
     * Used both by the Products scan-in entry point and by the POS screen
     * when a physical scanner types a code into the search bar.
     * @param {string} barcode
     * @returns {import('../domain/model/product.entity.js').Product|undefined}
     */
    function getProductByBarcode(barcode) {
        const trimmed = (barcode ?? '').trim();
        if (!trimmed) return undefined;
        return products.value.find(product => product.isActive && product.barcode === trimmed);
    }

    /**
     * Returns the first inventory record linked to the given productId.
     * Only meaningful when the caller needs one specific record tied to a
     * particular warehouse (e.g. defaulting the intake modal's warehouse
     * selector) — for a product's stock total across warehouses, see
     * getTotalInventoryForProduct.
     * @param {number|string} productId
     * @returns {import('../domain/model/inventory-item.entity.js').InventoryItem|undefined}
     */
    function getInventoryByProduct(productId) {
        return inventory.value.find(item => item.productId === parseInt(productId));
    }

    /**
     * Returns a product's stock aggregated across every warehouse it's split
     * into. InventoryItem is a real N:M relation (one row per product +
     * warehouse, see the backend's architecture doc §5.6/§8.1) — a product
     * stocked in 2+ warehouses has one row each, and showing only the first
     * one (as getInventoryByProduct does) undercounts total stock whenever a
     * secondary warehouse holds more than the default one.
     *
     * Returns a synthetic InventoryItem carrying the summed currentStock, so
     * callers get isLowStock/isCritical/stockStatus for free from the same
     * business rule InventoryItem already implements. minimumStock is NOT
     * summed: the product edit form only exposes one "stock mínimo" field,
     * and the backend's UpdateMinimumStockCommand applies it to every
     * warehouse's InventoryItem in lockstep — so all of a product's items
     * carry the same threshold. This takes the highest one rather than
     * assuming that invariant always holds (e.g. a brand-new warehouse
     * item created by an intake before the product was ever re-saved with
     * a minimum), so "low stock" stays conservative instead of silently
     * reading 0 from an unsynced item.
     *
     * @param {number|string} productId
     * @returns {import('../domain/model/inventory-item.entity.js').InventoryItem|null}
     */
    function getTotalInventoryForProduct(productId) {
        const numericId = parseInt(productId);
        const items = inventory.value.filter(item => item.productId === numericId);
        if (items.length === 0) return null;

        return new InventoryItem({
            productId:    numericId,
            businessId:   items[0].businessId,
            warehouseId:  null,
            stockUnit:    items.reduce((sum, item) => sum + item.currentStock, 0),
            minimumStock: Math.max(...items.map(item => item.minimumStock))
        });
    }

    // ─── Commands ─────────────────────────────────────────────────────────────

    /**
     * Fetches all products for the authenticated business — scoped
     * server-side by the JWT, no businessId parameter needed or accepted.
     */
    function fetchProducts() {
        return productApi.getProducts()
            .then(response => {
                warnIfTruncated(response, 'Productos');
                products.value       = ProductAssembler.toEntitiesFromResponse(response);
                productsLoaded.value = true;
            });
    }

    /**
     * Fetches every deactivated product for the authenticated business, for
     * the "reactivate a product" screen — GetProducts (fetchProducts)
     * excludes these by default.
     */
    function fetchInactiveProducts() {
        return productApi.getAllProductsIncludingInactive()
            .then(response => {
                inactiveProducts.value = ProductAssembler.toEntitiesFromResponse(response)
                    .filter(product => !product.isActive);
                inactiveProductsLoaded.value = true;
            })
            .catch(() => {
                inactiveProductsLoaded.value = true;
            });
    }

    /**
     * Reactivates a deactivated product, moving it back from
     * `inactiveProducts` into `products`.
     * @param {number|string} id
     * @returns {Promise<void>}
     */
    function activateProduct(id) {
        const numericId = parseInt(id);
        return productApi.activateProduct(numericId)
            .then(() => {
                const index = inactiveProducts.value.findIndex(product => product.id === numericId);
                if (index !== -1) inactiveProducts.value.splice(index, 1);
                // Brings the product back into the main list the same way a
                // freshly-created one would appear — a targeted local patch
                // would need to re-derive the full Product from the inactive
                // copy, which is more fragile than just refetching.
                return fetchProducts();
            });
    }

    /**
     * Fetches all inventory records for the authenticated business — scoped
     * server-side by the JWT, no businessId parameter needed or accepted.
     */
    function fetchInventory() {
        return productApi.getInventory()
            .then(response => {
                inventory.value       = InventoryItemAssembler.toEntitiesFromResponse(response);
                inventoryLoaded.value = true;
            });
    }

    /**
     * Fetches stock movements for a product by loading its batches.
     * Each batch is mapped to an INTAKE StockMovement with its expiration as registeredAt.
     * @param {number|string} productId
     */
    function fetchStockMovements(productId) {
        productApi.getBatchesByProduct(productId)
            .then(response => {
                const batches = response.data instanceof Array ? response.data : [];
                stockMovements.value = batches.map(batch =>
                    StockMovementAssembler.toEntityFromResource({
                        id:           batch.id,
                        productId:    batch.productId,
                        businessId:   null,
                        quantity:     1,
                        type:         MovementType.INTAKE,
                        registeredAt: batch.expiration
                    })
                );
            });
    }

    /**
     * Fetches the real, persisted stock movement history for a business
     * (every INTAKE/SALE the backend recorded server-side), sorted
     * most-recent-first. Used by the Inventory "Movimientos" tab — callers
     * must re-invoke this after an intake to reflect the new entry, since
     * this store no longer mirrors movements into local state on its own.
     * Scoped server-side by the JWT, no businessId parameter needed or accepted.
     */
    function fetchAllStockMovements() {
        stockMovementsError.value = null;
        productApi.getStockMovements()
            .then(response => {
                warnIfTruncated(response, 'Movimientos de stock');
                const entities = StockMovementAssembler.toEntitiesFromResponse(response);
                stockMovements.value = entities.sort(
                    (first, second) => new Date(second.registeredAt) - new Date(first.registeredAt)
                );
                stockMovementsLoaded.value = true;
            })
            .catch(error => {
                stockMovementsError.value = error;
                stockMovementsLoaded.value = true;
            });
    }

    /**
     * Marks the cached stock-movement history as stale without refetching it,
     * so the next visit to the "Movimientos" tab reloads it lazily instead of
     * showing what was true before a sale/cancellation happened elsewhere
     * (Products has no way to know Sales changed stock unless told to).
     */
    function invalidateStockMovements() {
        stockMovementsLoaded.value = false;
    }

    /**
     * Fetches every batch across all products, used to determine which
     * products have stock expiring soon (see getDaysToNearestExpiry).
     */
    function fetchBatches() {
        return productApi.getAllBatches()
            .then(response => {
                batches.value = response.data instanceof Array ? response.data : [];
                batchesLoaded.value = true;
            })
            .catch(() => {
                batchesLoaded.value = true;
            });
    }

    /**
     * Discards a batch (goods left the shelf) — this is what stops an
     * expired/expiring batch from alerting forever. Patches the local copy
     * to INACTIVE from the response instead of a full refetch, so the
     * "vence en N días" / "vencido" state clears immediately everywhere
     * batches.value is read from (product list, alert modal).
     * @param {number|string} batchId
     * @returns {Promise<void>}
     */
    function discardBatch(batchId) {
        return productApi.discardBatch(batchId)
            .then(response => {
                const index = batches.value.findIndex(batch => batch.id === response.data.id);
                if (index !== -1) batches.value[index] = response.data;
            });
    }

    /**
     * Sets/corrects a batch's expiration date — most useful right after a
     * purchase order is received, since that intake has no expiration
     * field of its own and lands the batch with none set. Also moves it to
     * its correct FEFO position for free: the server ranks batches by
     * expiration on every sale, so nothing else needs to change here.
     * Patches the local copy from the response, same as discardBatch.
     * @param {number|string} batchId
     * @param {string|null} expiration ISO date string (YYYY-MM-DD), or null to clear it.
     * @returns {Promise<void>}
     */
    function updateBatchExpiration(batchId, expiration) {
        return productApi.updateBatchExpiration(batchId, expiration)
            .then(response => {
                const index = batches.value.findIndex(batch => batch.id === response.data.id);
                if (index !== -1) batches.value[index] = response.data;
            });
    }

    /**
     * Returns the number of days until the nearest active batch of a product expires.
     *
     * Reads the server-computed `daysToExpiry` already present on every
     * BatchResource (BatchResourceFromEntityAssembler, backed by the same
     * ExpirationRules Alerts uses) instead of re-deriving it from
     * `expiration` client-side — two independent date-math implementations
     * risk timezone/off-by-one drift from what actually triggers alerts.
     * Business rule: only ACTIVE batches are considered; when a product has
     * several, the soonest expiration wins. Negative values mean the batch
     * already expired.
     *
     * @param {number|string} productId
     * @returns {number|null} Days to the nearest expiration, or null if the product
     *   has no active batch with a computed expiry.
     */
    function getDaysToNearestExpiry(productId) {
        const numericId = parseInt(productId);
        const activeExpirations = batches.value
            .filter(batch => batch.productId === numericId && batch.status === 'ACTIVE' && batch.daysToExpiry != null)
            .map(batch => batch.daysToExpiry);

        return activeExpirations.length > 0 ? Math.min(...activeExpirations) : null;
    }

    /**
     * Returns true when a product has an active batch the server flags as
     * expiring soon (BatchResource.isExpiringSoon, the same rule Alerts
     * uses) but not already expired — see isProductExpired for that case.
     *
     * @param {number|string} productId
     * @returns {boolean}
     */
    function isProductExpiringSoon(productId) {
        const numericId = parseInt(productId);
        return batches.value.some(batch =>
            batch.productId === numericId && batch.status === 'ACTIVE' && batch.isExpiringSoon
        );
    }

    /**
     * Returns true when a product has an active batch the server flags as
     * already expired (BatchResource.isExpired). Kept distinct from
     * isProductExpiringSoon so the UI can tell "will expire soon" apart from
     * "already expired" instead of collapsing both into one bucket.
     *
     * @param {number|string} productId
     * @returns {boolean}
     */
    function isProductExpired(productId) {
        const numericId = parseInt(productId);
        return batches.value.some(batch =>
            batch.productId === numericId && batch.status === 'ACTIVE' && batch.isExpired
        );
    }

    /**
     * Fetches warehouses for the authenticated business and returns them as
     * a plain array. Warehouses are not kept in store state because
     * warehouse management belongs to a separate bounded context. Scoped
     * server-side by the JWT, no businessId parameter needed or accepted.
     * @returns {Promise<Array>}
     */
    function fetchWarehousesForBusiness() {
        return productApi.getWarehouses()
            .then(response => response.data instanceof Array ? response.data : [])
            .catch(() => []);
    }

    /**
     * Creates a new warehouse for a business.
     * Not kept in this store's own state, matching fetchWarehousesForBusiness
     * above — the caller (Inventario's Almacén tab) manages its own local list.
     * @param {Object} resource
     * @returns {Promise<Object>} The created warehouse.
     */
    function createWarehouse(resource) {
        return productApi.createWarehouse(resource)
            .then(response => response.data);
    }

    /**
     * Fetches suppliers for the authenticated business and returns them as
     * a plain array. Scoped server-side by the JWT, no businessId parameter
     * needed or accepted.
     * @returns {Promise<Array>}
     */
    function fetchSuppliersForBusiness() {
        return productApi.getSuppliers()
            .then(response => response.data instanceof Array ? response.data : [])
            .catch(() => []);
    }

    /**
     * Creates a new product and appends it to local state.
     * @param {import('../domain/model/product.entity.js').Product} product
     * @returns {Promise<import('../domain/model/product.entity.js').Product>}
     */
    function addProduct(product) {
        return productApi.createProduct(ProductAssembler.toResourceFromEntity(product))
            .then(response => {
                const createdProduct = ProductAssembler.toEntityFromResource(response.data);
                products.value.push(createdProduct);
                return createdProduct;
            });
    }

    /**
     * Updates an existing product and synchronizes local state.
     * @param {import('../domain/model/product.entity.js').Product} product - Must include id.
     * @returns {Promise<import('../domain/model/product.entity.js').Product>}
     */
    function updateProduct(product) {
        return productApi.updateProduct(product.id, ProductAssembler.toResourceFromEntity(product))
            .then(response => {
                const updatedProduct = ProductAssembler.toEntityFromResource(response.data);
                const index = products.value.findIndex(existingProduct => existingProduct.id === updatedProduct.id);
                if (index !== -1) products.value[index] = updatedProduct;
                return updatedProduct;
            });
    }

    /**
     * Deletes a product and removes it from local state.
     *
     * Business rule: deletion is blocked when the product has any stock,
     * summed across every warehouse it's split into (X4 M23) — this used to
     * only look at the first matching inventory record, so a product with
     * zero in one warehouse and real stock in another passed this check even
     * though the backend's own guard (CannotDeleteWithStock) would still
     * reject it; the view's own total-stock check happened to catch this
     * before it reached the API, so it was never actually exploitable from
     * the UI, but the store's own invariant was still wrong on its own terms.
     *
     * @param {number|string} id
     * @returns {Promise<void>}
     */
    function deleteProduct(id) {
        const numericId  = parseInt(id);
        const totalStock = inventory.value
            .filter(item => item.productId === numericId)
            .reduce((sum, item) => sum + item.currentStock, 0);

        if (totalStock > 0) {
            return Promise.reject(
                new Error(`Cannot delete product #${numericId}: it has ${totalStock} units in stock.`)
            );
        }

        return productApi.deleteProduct(numericId)
            .then(() => {
                const productIndex = products.value.findIndex(product => product.id === numericId);
                if (productIndex !== -1) products.value.splice(productIndex, 1);

                // Every warehouse's record, not just the first — same reasoning as the totalStock check above.
                inventory.value = inventory.value.filter(item => item.productId !== numericId);
            });
    }

    /**
     * Registers a stock intake for a product via the real backend's dedicated
     * command endpoint (POST /products/{id}/stock-intake) — it sums into the
     * existing InventoryItem for (product, warehouse) or creates one, and
     * records the StockMovement, all server-side and atomically. This
     * collapses what used to be a client-orchestrated "GET, then PUT-or-POST,
     * then separately log a movement" sequence required by the mock API.
     *
     * A quantity of exactly 0 (product registered with no initial stock,
     * only a minimumStock threshold) still calls the backend — the real
     * command accepts a 0 quantity and creates the InventoryItem anyway
     * (with 0 stock, minimumStock persisted, no StockMovement recorded).
     * This used to skip the call entirely on the mistaken assumption the
     * backend required a positive quantity, which silently dropped the
     * minimumStock the user had just entered for any brand-new product with
     * no initial stock.
     *
     * @param {Object} resource
     * @param {number} resource.productId
     * @param {number} resource.quantity   - Must be a non-negative integer; 0 is valid.
     * @param {number} [resource.warehouseId]
     * @param {number} [resource.minimumStock]
     * @param {number} [resource.purchasePrice]
     * @param {string} [resource.expiration]
     * @param {string} [resource.supplier]
     * @param {number} [resource.supplierId]
     * @param {string} [resource.note]
     * @returns {Promise<import('../domain/model/inventory-item.entity.js').InventoryItem|null>}
     */
    function registerStockIntake(resource) {
        if (resource.quantity == null || resource.quantity < 0) {
            return Promise.reject(new Error('Stock intake quantity must be zero or a positive integer.'));
        }

        const intakeResource = {
            warehouseId:   resource.warehouseId ? parseInt(resource.warehouseId) : null,
            quantity:      resource.quantity,
            purchasePrice: resource.purchasePrice ?? null,
            expiration:    resource.expiration ?? null,
            supplier:      resource.supplier ?? '',
            supplierId:    resource.supplierId ?? null,
            note:          resource.note ?? '',
            minimumStock:  resource.minimumStock != null ? parseInt(resource.minimumStock) || 0 : null
        };

        return productApi.registerStockIntake(parseInt(resource.productId), intakeResource)
            .then(response => {
                const updatedItem = InventoryItemAssembler.toEntityFromResource(response.data);
                const index = inventory.value.findIndex(item => item.id === updatedItem.id);
                if (index !== -1) inventory.value[index] = updatedItem;
                else inventory.value.push(updatedItem);
                return updatedItem;
            });
    }

    /**
     * Manually adjusts a product's stock in one warehouse — shrinkage,
     * breakage, theft, or a physical count correction (I25). There is no
     * other way to move stock outside of a sale/intake/return.
     * @param {number|string} productId
     * @param {number|string} warehouseId
     * @param {number} delta - Signed: negative removes units, positive adds them.
     * @param {string} reason
     * @returns {Promise<import('../domain/model/inventory-item.entity.js').InventoryItem>}
     */
    function adjustStock(productId, warehouseId, delta, reason) {
        const numericDelta = parseInt(delta);
        if (!numericDelta) {
            return Promise.reject(new Error('Stock adjustment delta must be a non-zero integer.'));
        }
        if (!reason || !reason.trim()) {
            return Promise.reject(new Error('Stock adjustment requires a reason.'));
        }

        return productApi.adjustStock(parseInt(productId), { warehouseId: parseInt(warehouseId), delta: numericDelta, reason: reason.trim() })
            .then(response => {
                const updatedItem = InventoryItemAssembler.toEntityFromResource(response.data);
                const index = inventory.value.findIndex(item => item.id === updatedItem.id);
                if (index !== -1) inventory.value[index] = updatedItem;
                else inventory.value.push(updatedItem);
                return updatedItem;
            });
    }

    /**
     * Updates the minimum stock threshold on a product's existing inventory record.
     *
     * Business rule: minimumStock must be a non-negative integer. Every
     * product gets an InventoryItem at creation time now (see
     * registerStockIntake, which no longer skips a 0-quantity intake), so
     * reaching "no inventory record" here means either inventory hasn't
     * been fetched yet or this product predates that fix — surfaced as a
     * real failure instead of a silent no-op, so a threshold the user just
     * typed doesn't quietly vanish.
     *
     * @param {number|string} productId
     * @param {number} minimumStock
     * @returns {Promise<import('../domain/model/inventory-item.entity.js').InventoryItem>}
     */
    function updateMinimumStock(productId, minimumStock) {
        if (minimumStock == null || Number.isNaN(minimumStock) || minimumStock < 0) {
            return Promise.reject(new Error('Minimum stock must be a non-negative integer.'));
        }

        const existingItem = inventory.value.find(item => item.productId === parseInt(productId));
        if (!existingItem) {
            return Promise.reject(new Error('No inventory record exists yet for this product.'));
        }

        return productApi.updateMinimumStock(existingItem.productId, { minimumStock: parseInt(minimumStock) })
            .then(response => {
                const updatedItem = InventoryItemAssembler.toEntityFromResource(response.data);
                const index = inventory.value.findIndex(item => item.id === updatedItem.id);
                if (index !== -1) inventory.value[index] = updatedItem;
                return updatedItem;
            });
    }

    return {
        products,
        inactiveProducts,
        inactiveProductsLoaded,
        inventory,
        stockMovements,
        batches,
        productsLoaded,
        inventoryLoaded,
        batchesLoaded,
        stockMovementsLoaded,
        stockMovementsError,
        productsCount,
        stockStatusCounts,
        getProductById,
        getProductByBarcode,
        getInventoryByProduct,
        getTotalInventoryForProduct,
        getDaysToNearestExpiry,
        isProductExpiringSoon,
        isProductExpired,
        fetchProducts,
        fetchInactiveProducts,
        activateProduct,
        fetchInventory,
        fetchBatches,
        discardBatch,
        updateBatchExpiration,
        fetchStockMovements,
        fetchAllStockMovements,
        invalidateStockMovements,
        fetchWarehousesForBusiness,
        createWarehouse,
        fetchSuppliersForBusiness,
        addProduct,
        updateProduct,
        deleteProduct,
        registerStockIntake,
        adjustStock,
        updateMinimumStock
    };
});

export default useProductStore;