/**
 * Application service store for the Sales & POS Management bounded context.
 *
 * Business rules enforced here:
 * - fetchSales and fetchCustomers load data scoped to the authenticated business.
 * - A sale can only be confirmed (PAID) when:
 *     1. The cart has at least one SaleDetail.
 *     2. A valid PaymentMethod is provided.
 *     3. No item quantity exceeds the available stock (validated in the POS view).
 * - A sale can only be cancelled when its status is OPEN or PAID.
 * - On confirmSale: the sale and all of its lines are persisted atomically in
 *   a single POST /sales (see confirmSale) — the backend validates stock,
 *   decrements it, and returns the sale already PAID with lines embedded.
 * - totalAmount stored on the sale resource equals the sum of all line totals
 *   (pre-tax subtotal); IGV and grandTotal are derived in the domain entity.
 * - currentSale holds the in-progress POS session (null when no active session).
 *
 * @module useSalesStore
 */
import { defineStore }  from 'pinia';
import { computed, ref } from 'vue';
import { SalesApi }           from '../infrastructure/sales.api.js';
import { SaleAssembler }      from '../infrastructure/sale.assembler.js';
import { SaleDetailAssembler } from '../infrastructure/sale-detail.assembler.js';
import { CustomerAssembler }  from '../infrastructure/customer.assembler.js';
import { Sale, SaleStatus, PaymentMethod }               from '../domain/model/sale.entity.js';
import { SaleDetail }         from '../domain/model/sale-detail.entity.js';

const salesApi = new SalesApi();

const useSalesStore = defineStore('sales', () => {

    /** @type {import('vue').Ref<Sale[]>} */
    const sales = ref([]);

    /** @type {import('vue').Ref<import('../domain/model/customer.entity.js').Customer[]>} */
    const customers = ref([]);

    /**
     * The in-progress sale being built in the POS screen.
     * Null when no POS session is active.
     * @type {import('vue').Ref<Sale|null>}
     */
    const currentSale = ref(null);

    /** @type {import('vue').Ref<boolean>} */
    const salesLoaded = ref(false);

    /** @type {import('vue').Ref<boolean>} */
    const customersLoaded = ref(false);

    /** @type {import('vue').Ref<Error[]>} */
    const errors = ref([]);

    /**
     * Total number of loaded sales.
     * @type {import('vue').ComputedRef<number>}
     */
    const salesCount = computed(() => sales.value.length);

    /**
     * Total revenue from PAID sales (pre-tax subtotal sum).
     * Used for quick summary cards.
     * @type {import('vue').ComputedRef<number>}
     */
    const totalRevenue = computed(() => {
        const paidSales = sales.value.filter(sale => sale.status === SaleStatus.PAID);
        const sum = paidSales.reduce((accumulator, sale) => accumulator + sale.subtotal, 0);
        return Math.round(sum * 100) / 100;
    });

    /**
     * Count of PAID sales.
     * @type {import('vue').ComputedRef<number>}
     */
    const paidSalesCount = computed(() => {
        return sales.value.filter(sale => sale.status === SaleStatus.PAID).length;
    });

    /**
     * Count of OPEN sales.
     * @type {import('vue').ComputedRef<number>}
     */
    const openSalesCount = computed(() => {
        return sales.value.filter(sale => sale.status === SaleStatus.OPEN).length;
    });

    // ─── Queries ──────────────────────────────────────────────────────────────

    /**
     * Finds a Sale entity by its identifier in the local state.
     * @param {number|string} id - Sale identifier.
     * @returns {Sale|undefined} Matching Sale, or undefined if not found.
     */
    function getSaleById(id) {
        const numericId = parseInt(id);
        return sales.value.find(sale => sale.id === numericId);
    }

    /**
     * Finds a Customer entity by its identifier in the local state.
     * @param {number|string} id - Customer identifier.
     * @returns {import('../domain/model/customer.entity.js').Customer|undefined}
     */
    function getCustomerById(id) {
        const numericId = parseInt(id);
        return customers.value.find(customer => customer.id === numericId);
    }

    // ─── Fetch Actions ────────────────────────────────────────────────────────

    /**
     * Loads all sales for the authenticated business and updates local
     * state. Scoped server-side by the JWT, no businessId parameter needed
     * or accepted.
     *
     * The real backend already embeds each sale's line items in the /sales
     * response (GetAllSalesByBusinessIdQuery eager-loads SaleDetails), so
     * this no longer needs the mock-era one-fetch-per-sale hydration step.
     *
     * @returns {void}
     */
    function fetchSales() {
        salesApi.getSales()
            .then(response => {
                sales.value        = SaleAssembler.toEntitiesFromResponse(response);
                salesLoaded.value = true;
            })
            .catch(error => {
                errors.value.push(error);
            });
    }

    /**
     * Loads all customers for the authenticated business and updates local
     * state. Scoped server-side by the JWT, no businessId parameter needed
     * or accepted.
     * @returns {void}
     */
    function fetchCustomers() {
        salesApi.getCustomers().then(response => {
            customers.value   = CustomerAssembler.toEntitiesFromResponse(response);
            customersLoaded.value = true;
        }).catch(error => {
            errors.value.push(error);
        });
    }

    // ─── POS Session ──────────────────────────────────────────────────────────

    /**
     * Initialises a fresh in-memory POS session for the given business.
     * Does NOT persist to the API yet; persistence happens on confirmSale.
     *
     * @param {number|string} businessId - Business identifier.
     * @returns {void}
     */
    function startNewSale(businessId) {
        currentSale.value = new Sale({
            businessId: businessId,
            status:     SaleStatus.OPEN,
            date:       new Date().toISOString(),
            details:    []
        });
    }

    /**
     * Adds a SaleDetail line item to the current in-memory sale.
     *
     * Business rules:
     * - The sale must be in OPEN status.
     * - A product can only appear once; calling this for an existing productId
     *   increments quantity instead of adding a duplicate line.
     * - quantity must be a positive integer > 0.
     * - quantity must not exceed the available stock (caller is responsible for passing
     *   the correct availableStock value from the ProductStore).
     *
     * @param {number|string} productId      - Product to add.
     * @param {number}        quantity       - Number of units.
     * @param {number}        unitPrice      - Price per unit at point of sale.
     * @param {number}        availableStock - Current inventory count (for validation).
     * @param {number}        [discount=0]   - Per-unit discount amount.
     * @returns {{ success: boolean, errorKey: string|null }}
     *   Object indicating success or the i18n key of the validation error.
     */
    function addDetailToCurrentSale({ productId, quantity, unitPrice, availableStock, discount = 0 }) {
        if (!currentSale.value || !currentSale.value.isOpen) {
            return { success: false, errorKey: 'pos.error-no-active-sale' };
        }
        if (!quantity || quantity < 1) {
            return { success: false, errorKey: 'pos.error-quantity-invalid' };
        }
        if (quantity > availableStock) {
            return { success: false, errorKey: 'pos.error-insufficient-stock' };
        }

        const existingDetail = currentSale.value.details.find(
            detail => detail.productId === productId
        );

        if (existingDetail) {
            const newQuantity = existingDetail.quantity + quantity;
            if (newQuantity > availableStock) {
                return { success: false, errorKey: 'pos.error-insufficient-stock' };
            }
            existingDetail.quantity = newQuantity;
        } else {
            currentSale.value.details.push(new SaleDetail({
                productId: productId,
                quantity:  quantity,
                unitPrice: unitPrice,
                discount:  discount
            }));
        }
        return { success: true, errorKey: null };
    }

    /**
     * Updates the quantity of an existing detail line in the current in-memory sale.
     *
     * Business rules:
     * - newQuantity must be >= 1.
     * - newQuantity must not exceed availableStock.
     * - If newQuantity is 0 or less, the line item should be removed instead (use removeDetailFromCurrentSale).
     *
     * @param {number|string} productId      - Product whose quantity to update.
     * @param {number}        newQuantity    - Desired new quantity.
     * @param {number}        availableStock - Current inventory count (for validation).
     * @returns {{ success: boolean, errorKey: string|null }}
     */
    function updateDetailQuantity({ productId, newQuantity, availableStock }) {
        if (!currentSale.value || !currentSale.value.isOpen) {
            return { success: false, errorKey: 'pos.error-no-active-sale' };
        }
        if (newQuantity < 1) {
            return { success: false, errorKey: 'pos.error-quantity-invalid' };
        }
        if (newQuantity > availableStock) {
            return { success: false, errorKey: 'pos.error-insufficient-stock' };
        }
        const detail = currentSale.value.details.find(d => d.productId === productId);
        if (detail) {
            detail.quantity = newQuantity;
        }
        return { success: true, errorKey: null };
    }

    /**
     * Removes a detail line item from the current in-memory sale by productId.
     *
     * @param {number|string} productId - Product whose line to remove.
     * @returns {void}
     */
    function removeDetailFromCurrentSale(productId) {
        if (!currentSale.value) return;
        currentSale.value.details = currentSale.value.details.filter(
            detail => detail.productId !== productId
        );
    }

    /**
     * Confirms and persists the current POS sale.
     *
     * The real backend creates a sale atomically in one call — validates
     * stock per line, persists the sale with its lines embedded, and
     * decrements inventory, "todo o nada" (CreateSaleCommand). There is no
     * OPEN status on the backend (see SaleStatus.cs): a sale is PAID the
     * moment it's created. This replaces the mock-era 3-request sequence
     * (POST sale header as OPEN, POST each line separately, PATCH to PAID)
     * that the real backend's non-nullable PaymentMethod/Lines rejected
     * with 400 on the very first request.
     *
     * @param {string} paymentMethod - One of the PaymentMethod enum values.
     * @param {number|null} customerId - Optional customer id.
     * @param {string} description - Optional sale description/note.
     * @returns {Promise<{ success: boolean, errorKey: string|null, sale: Sale|null }>}
     */
    async function confirmSale({ paymentMethod, customerId = null, description = '' }) {
        if (!currentSale.value || !currentSale.value.isOpen) {
            return { success: false, errorKey: 'pos.error-no-active-sale', sale: null };
        }
        if (currentSale.value.details.length === 0) {
            return { success: false, errorKey: 'pos.error-empty-cart', sale: null };
        }
        if (!paymentMethod || !Object.values(PaymentMethod).includes(paymentMethod)) {
            return { success: false, errorKey: 'pos.error-no-payment-method', sale: null };
        }

        try {
            const saleResource = {
                customerId:    customerId,
                paymentMethod: paymentMethod,
                currency:      'PEN',
                description:   description,
                lines: currentSale.value.details.map(detail => ({
                    productId: detail.productId,
                    quantity:  detail.quantity,
                    unitPrice: detail.unitPrice,
                    discount:  detail.discount
                }))
            };
            const saleResponse = await salesApi.createSale(saleResource);
            const finalSale    = SaleAssembler.toEntityFromResource(saleResponse.data);

            sales.value.push(finalSale);
            currentSale.value = null;

            return { success: true, errorKey: null, sale: finalSale };
        } catch (error) {
            errors.value.push(error);
            return { success: false, errorKey: 'pos.error-confirm-failed', sale: null };
        }
    }

    /**
     * Cancels the current in-memory POS session without persisting anything.
     * Clears the cart and resets currentSale to null.
     *
     * @returns {void}
     */
    function discardCurrentSale() {
        currentSale.value = null;
    }

    /**
     * Fetches the persisted SaleDetail lines for a sale.
     * Needed because sales loaded via fetchSales carry an empty `details`
     * array (the mock API does not embed line items in the sale resource).
     *
     * @param {number|string} saleId
     * @returns {Promise<SaleDetail[]>}
     */
    function fetchSaleDetailsForSale(saleId) {
        return salesApi.getSaleDetailsBySale(saleId)
            .then(response => SaleDetailAssembler.toEntitiesFromResponse(response))
            .catch(error => {
                errors.value.push(error);
                return [];
            });
    }

    /**
     * Cancels a previously persisted sale by updating its status to CANCELLED.
     *
     * Business rule: only OPEN or PAID sales can be cancelled.
     *
     * Stock is NOT reverted here: reverting inventory belongs to the Product &
     * Inventory Management bounded context, so this returns the line items
     * that were sold and lets the caller (presentation layer) restock them
     * via the ProductStore, mirroring how other cross-context orchestration
     * is already done in this codebase (see purchase-order-list.vue).
     *
     * @param {Sale} sale - The Sale entity to cancel.
     * @returns {Promise<{ success: boolean, restockedDetails: SaleDetail[] }>}
     */
    async function cancelSale(sale) {
        if (sale.status === SaleStatus.CANCELLED) {
            return { success: false, restockedDetails: [] };
        }

        try {
            const response = await salesApi.updateSale(sale.id, { status: SaleStatus.CANCELLED });
            const cancelledSale = SaleAssembler.toEntityFromResource(response.data);
            const index = sales.value.findIndex(existingSale => existingSale.id === cancelledSale.id);
            if (index !== -1) {
                sales.value[index] = cancelledSale;
            }

            const restockedDetails = sale.details.length > 0
                ? sale.details
                : await fetchSaleDetailsForSale(sale.id);

            return { success: true, restockedDetails };
        } catch (error) {
            errors.value.push(error);
            return { success: false, restockedDetails: [] };
        }
    }

    // ─── Customer CRUD ────────────────────────────────────────────────────────

    /**
     * Creates a new customer and appends it to local state.
     * @param {import('../domain/model/customer.entity.js').Customer} customer - Customer entity to persist.
     * @returns {Promise<import('../domain/model/customer.entity.js').Customer>}
     */
    function addCustomer(customer) {
        return salesApi.createCustomer(CustomerAssembler.toResourceFromEntity(customer)).then(response => {
            const newCustomer = CustomerAssembler.toEntityFromResource(response.data);
            customers.value.push(newCustomer);
            return newCustomer;
        }).catch(error => {
            errors.value.push(error);
            throw error;
        });
    }

    /**
     * Updates an existing customer and synchronises local state.
     * @param {import('../domain/model/customer.entity.js').Customer} customer - Customer entity with updated data.
     * @returns {Promise<import('../domain/model/customer.entity.js').Customer>}
     */
    function updateCustomer(customer) {
        return salesApi.updateCustomer(customer.id, CustomerAssembler.toResourceFromEntity(customer)).then(response => {
            const updatedCustomer = CustomerAssembler.toEntityFromResource(response.data);
            const index = customers.value.findIndex(existingCustomer => existingCustomer.id === updatedCustomer.id);
            if (index !== -1) {
                customers.value[index] = updatedCustomer;
            }
            return updatedCustomer;
        }).catch(error => {
            errors.value.push(error);
            throw error;
        });
    }

    /**
     * Deletes a customer and removes it from local state.
     * @param {number|string} customerId - Identifier of the customer to delete.
     * @returns {Promise<void>}
     */
    function deleteCustomer(customerId) {
        return salesApi.deleteCustomer(customerId).then(() => {
            const index = customers.value.findIndex(customer => customer.id === parseInt(customerId));
            if (index !== -1) {
                customers.value.splice(index, 1);
            }
        }).catch(error => {
            errors.value.push(error);
            throw error;
        });
    }

    return {
        // State
        sales,
        customers,
        currentSale,
        salesLoaded,
        customersLoaded,
        errors,
        // Computed
        salesCount,
        totalRevenue,
        paidSalesCount,
        openSalesCount,
        // Queries
        getSaleById,
        getCustomerById,
        // Fetch
        fetchSales,
        fetchCustomers,
        fetchSaleDetailsForSale,
        // POS session
        startNewSale,
        addDetailToCurrentSale,
        updateDetailQuantity,
        removeDetailFromCurrentSale,
        confirmSale,
        discardCurrentSale,
        cancelSale,
        // Customer CRUD
        addCustomer,
        updateCustomer,
        deleteCustomer
    };
});

export default useSalesStore;