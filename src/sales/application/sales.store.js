/**
 * Application service store for the Sales & POS Management bounded context.
 *
 * Business rules enforced here:
 * - fetchSales and fetchCustomers load data scoped to the authenticated business.
 * - A sale can only be confirmed (PAID) when:
 *     1. The cart has at least one SaleDetail.
 *     2. A valid PaymentMethod is provided.
 *     3. No item quantity exceeds the available stock (validated in the POS view).
 * - A sale can only be cancelled while its status is PAID.
 * - On confirmSale: the sale and all of its lines are persisted atomically in
 *   a single POST /sales (see confirmSale) — the backend validates stock,
 *   decrements it, and returns the sale already PAID with lines embedded.
 * - totalAmount stored on the sale resource equals the sum of all line totals.
 *   Prices already include IGV, so this is the final amount — no separate
 *   tax calculation happens client-side.
 * - currentSale holds the in-progress POS session (null when no active session).
 *
 * @module useSalesStore
 */
import { defineStore }  from 'pinia';
import { computed, ref } from 'vue';
import { SalesApi }           from '../infrastructure/sales.api.js';
import { SaleAssembler }      from '../infrastructure/sale.assembler.js';
import { CustomerAssembler }  from '../infrastructure/customer.assembler.js';
import { PaymentPlanAssembler } from '../infrastructure/payment-plan.assembler.js';
import { Sale, SaleStatus, PaymentMethod }               from '../domain/model/sale.entity.js';
import { SaleDetail }         from '../domain/model/sale-detail.entity.js';
import { warnIfTruncated }    from '../../shared/infrastructure/pagination.js';

const salesApi = new SalesApi();

const useSalesStore = defineStore('sales', () => {

    /** @type {import('vue').Ref<Sale[]>} */
    const sales = ref([]);

    /** @type {import('vue').Ref<import('../domain/model/customer.entity.js').Customer[]>} */
    const customers = ref([]);

    /**
     * Customer ids currently being fetched by getCustomerById's background
     * lookup — prevents firing a duplicate GET /customers/{id} for the same
     * id while one is already in flight (e.g. the same missing id rendered
     * in both sales-history.vue and payment-plans-list.vue at once).
     * @type {Set<number>}
     */
    const customerFetchesInFlight = new Set();

    /**
     * The in-progress sale being built in the POS screen.
     * Null when no POS session is active.
     * @type {import('vue').Ref<Sale|null>}
     */
    const currentSale = ref(null);

    /**
     * Idempotency key for the current checkout attempt — generated once in
     * startNewSale and sent unchanged with every confirmSale() call for that
     * same cart, including retries. Lets the backend recognise "this already
     * went through, the response just never arrived" instead of selling the
     * same cart twice on a retry after a dropped connection.
     * @type {import('vue').Ref<string|null>}
     */
    const currentSaleIdempotencyKey = ref(null);

    /** @type {import('vue').Ref<boolean>} */
    const salesLoaded = ref(false);

    /**
     * Set when the last fetchSales call failed (e.g. a WAREHOUSE role, which
     * the backend denies read access to Sales) — lets callers like the
     * Dashboard tell a permissions error apart from "still loading" instead
     * of hanging in a loading state forever.
     * @type {import('vue').Ref<Error|null>}
     */
    const salesError = ref(null);

    /** @type {import('vue').Ref<boolean>} */
    const customersLoaded = ref(false);

    /**
     * Set when the last fetchCustomers() call failed — lets a view tell a
     * real error apart from "this business genuinely has no customers yet"
     * instead of both rendering the same empty state.
     * @type {import('vue').Ref<Error|null>}
     */
    const customersError = ref(null);

    /**
     * Pending (not fully paid) payment plans — for the whole business, or
     * narrowed to one customer via fetchPendingPaymentPlans(customerId).
     * @type {import('vue').Ref<import('../domain/model/payment-plan.entity.js').PaymentPlan[]>}
     */
    const paymentPlans = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const paymentPlansLoaded = ref(false);

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
     *
     * `customers` is populated by fetchCustomers() from GET /customers,
     * which only returns ACTIVE customers — a deleted (soft-deactivated)
     * customer's id won't be in it, even though their past sales/payment
     * plans still reference it and still need a name to display (a plan
     * with money still owed shouldn't show "unknown customer"). On a miss,
     * this kicks off a background GET /customers/{id} (that endpoint isn't
     * status-filtered) and caches the result into `customers` once it
     * resolves — Vue's reactivity re-renders whatever called this the first
     * time automatically. The first call for a given id still returns
     * undefined synchronously; callers already render a fallback for that.
     * @param {number|string} id - Customer identifier.
     * @returns {import('../domain/model/customer.entity.js').Customer|undefined}
     */
    function getCustomerById(id) {
        const numericId = parseInt(id);
        const found = customers.value.find(customer => customer.id === numericId);
        if (found || customerFetchesInFlight.has(numericId)) return found;

        customerFetchesInFlight.add(numericId);
        salesApi.getCustomerById(numericId)
            .then(response => {
                customers.value.push(CustomerAssembler.toEntityFromResource(response.data));
            })
            .catch(() => {
                // Not found (e.g. a stale/invalid id) or a network error — the
                // caller's existing "unknown customer" fallback stays as-is.
            })
            .finally(() => {
                customerFetchesInFlight.delete(numericId);
            });
        return found;
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
        salesError.value = null;
        salesApi.getSales()
            .then(response => {
                warnIfTruncated(response, 'Ventas');
                sales.value        = SaleAssembler.toEntitiesFromResponse(response);
                salesLoaded.value = true;
            })
            .catch(error => {
                salesError.value = error;
                salesLoaded.value = true;
            });
    }

    /**
     * Fetches sales within a date range directly from the server, without
     * touching the shared `sales`/`salesLoaded` state — other views (Team
     * stats, Clientes, Cuotas) rely on that cache holding the FULL set, so a
     * date-scoped result must not overwrite it. Callers (Sales History's
     * date filter) hold the returned array themselves.
     * @param {string} [dateFrom] - 'yyyy-mm-dd'.
     * @param {string} [dateTo]   - 'yyyy-mm-dd'.
     * @returns {Promise<import('../domain/model/sale.entity.js').Sale[]>}
     */
    function fetchSalesInRange(dateFrom, dateTo) {
        return salesApi.getSales(dateFrom, dateTo).then(response => SaleAssembler.toEntitiesFromResponse(response));
    }

    /**
     * Total revenue for an optional date range, straight from the backend's
     * one true calculation (GetTotalRevenueByBusinessIdQuery) — Paid sales'
     * totals plus installments actually collected on credit sales. Never
     * derive this client-side from `sales`/`paymentPlans`: that was exactly
     * how A10 happened (a credit sale's full total counted as revenue the
     * moment it was created, in a second calculation that quietly diverged
     * from the backend's).
     * @param {string} [dateFrom] - 'yyyy-mm-dd'.
     * @param {string} [dateTo]   - 'yyyy-mm-dd'.
     * @returns {Promise<number>}
     */
    function fetchSalesRevenue(dateFrom, dateTo) {
        return salesApi.getSalesRevenue(dateFrom, dateTo).then(response => response.data.totalRevenue);
    }

    /**
     * Loads all customers for the authenticated business and updates local
     * state. Scoped server-side by the JWT, no businessId parameter needed
     * or accepted.
     * @returns {void}
     */
    function fetchCustomers() {
        customersError.value = null;
        salesApi.getCustomers()
            .then(response => {
                warnIfTruncated(response, 'Clientes');
                customers.value   = CustomerAssembler.toEntitiesFromResponse(response);
                customersLoaded.value = true;
            })
            .catch(error => {
                customersError.value = error;
                customersLoaded.value = true;
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
            date:       new Date().toISOString(),
            details:    []
        });
        currentSaleIdempotencyKey.value = crypto.randomUUID();
    }

    /**
     * Adds a SaleDetail line item to the current in-memory sale.
     *
     * Business rules:
     * - A POS session must be active (currentSale non-null).
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
        if (!currentSale.value) {
            return { success: false, errorKey: 'pos.error-no-active-sale' };
        }
        // X5 Bloque D: a weight-sold product's quantity may legitimately be
        // below 1 (e.g. 0.25 kg) — only "not a positive number" is rejected
        // here; whether it's allowed to carry a fraction at all is enforced
        // server-side (Product.UnitOfSale) and, client-side, by the cart UI
        // only offering a fractional input for a weight-sold product.
        if (!quantity || quantity <= 0) {
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
        if (!currentSale.value) {
            return { success: false, errorKey: 'pos.error-no-active-sale' };
        }
        // X5 Bloque D — same reasoning as addDetailToCurrentSale above.
        if (!newQuantity || newQuantity <= 0) {
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
     * @returns {Promise<{ success: boolean, errorKey: string|null, errorDetail: string|null, status: number|null, sale: Sale|null }>}
     */
    async function confirmSale({ paymentMethod, customerId = null, description = '' }) {
        if (!currentSale.value) {
            return { success: false, errorKey: 'pos.error-no-active-sale', errorDetail: null, status: null, sale: null };
        }
        if (currentSale.value.details.length === 0) {
            return { success: false, errorKey: 'pos.error-empty-cart', errorDetail: null, status: null, sale: null };
        }
        if (!paymentMethod || !Object.values(PaymentMethod).includes(paymentMethod)) {
            return { success: false, errorKey: 'pos.error-no-payment-method', errorDetail: null, status: null, sale: null };
        }

        try {
            const saleResource = {
                customerId:    customerId,
                paymentMethod: paymentMethod,
                currency:      'PEN',
                description:   description,
                // Neither discount nor unitPrice is part of the backend's sale
                // contract (see SaleLineResource/CreateSaleCommandValidator) —
                // the POS never offers discount, and a submitted unitPrice was
                // always silently ignored server-side in favor of the
                // product's own BasePrice, so it was removed from the wire
                // shape entirely rather than kept as a decoy.
                lines: currentSale.value.details.map(detail => ({
                    productId: detail.productId,
                    quantity:  detail.quantity
                })),
                idempotencyKey: currentSaleIdempotencyKey.value
            };
            const saleResponse = await salesApi.createSale(saleResource);
            const finalSale    = SaleAssembler.toEntityFromResource(saleResponse.data);

            sales.value.push(finalSale);
            currentSale.value = null;
            currentSaleIdempotencyKey.value = null;

            return { success: true, errorKey: null, errorDetail: null, status: null, sale: finalSale };
        } catch (error) {
            // Every failure used to collapse into the same generic "try
            // again" message — 409 (insufficient stock, inactive product)
            // and 404 (product/customer gone) have real, localized backend
            // messages (see SalesActionResultAssembler) worth showing
            // instead of guessing at a fixed i18n key here.
            return {
                success:     false,
                errorKey:    'pos.error-confirm-failed',
                errorDetail: error.response?.data?.detail ?? null,
                status:      error.response?.status ?? null,
                sale:        null
            };
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
     * Cancels a previously persisted sale by updating its status to CANCELLED.
     *
     * Business rule: only PAID sales can be cancelled.
     *
     * Stock IS reverted here, but server-side: the backend restores every
     * sold line back into inventory atomically as part of this same request
     * (SaleCommandService, PR #18). The caller must not also restock via
     * ProductStore — that used to be necessary before PR #18 and is now a
     * double-restore (a cancelled sale of 4 units put 8 back on the shelf).
     *
     * @param {Sale} sale - The Sale entity to cancel.
     * @returns {Promise<{ success: boolean }>}
     */
    async function cancelSale(sale) {
        if (sale.status === SaleStatus.CANCELLED) {
            return { success: false };
        }

        try {
            const response = await salesApi.updateSale(sale.id, { status: SaleStatus.CANCELLED });
            const cancelledSale = SaleAssembler.toEntityFromResource(response.data);
            const index = sales.value.findIndex(existingSale => existingSale.id === cancelledSale.id);
            if (index !== -1) {
                sales.value[index] = cancelledSale;
            }

            // A credit sale's payment plan is cancelled server-side in the same
            // request (SaleCommandService) — refresh so it drops off "Cuotas
            // pendientes" immediately instead of showing a plan for a sale that
            // no longer exists until the tab is revisited.
            if (paymentPlansLoaded.value) fetchPendingPaymentPlans();

            return { success: true };
        } catch {
            return { success: false };
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
        });
    }

    // ─── Payment Plans ────────────────────────────────────────────────────────

    /**
     * Loads pending (not fully paid) payment plans into local state — for
     * the whole business, or narrowed to one customer's sales when
     * customerId is given.
     * @param {number|string} [customerId]
     * @returns {Promise<void>}
     */
    function fetchPendingPaymentPlans(customerId) {
        return salesApi.getPendingPaymentPlans(customerId)
            .then(response => {
                paymentPlans.value = PaymentPlanAssembler.toEntitiesFromResponse(response);
                paymentPlansLoaded.value = true;
            })
            .catch(() => {
                paymentPlansLoaded.value = true;
            });
    }

    /**
     * Fetches the payment plan attached to a specific sale, if any.
     * @param {number|string} saleId
     * @returns {Promise<import('../domain/model/payment-plan.entity.js').PaymentPlan|null>}
     */
    function fetchPaymentPlanBySale(saleId) {
        return salesApi.getPaymentPlanBySale(saleId)
            .then(response => PaymentPlanAssembler.toEntityFromResource(response.data))
            .catch(() => null);
    }

    /**
     * Attaches a payment plan (sells "a cuotas") to an already-confirmed
     * sale. Deliberately a separate call from confirmSale — the backend
     * itself never lets plan creation touch how the sale was totaled or
     * had its stock decremented (see PaymentPlanCommandService).
     *
     * @param {number|string} saleId
     * @param {Array<{dueDate: string, amount: number|string}>} schedule - Must add up exactly to the sale's total (X6 #7).
     * @returns {Promise<import('../domain/model/payment-plan.entity.js').PaymentPlan>}
     */
    function createPaymentPlan(saleId, schedule) {
        const resource = PaymentPlanAssembler.toResourceFromEntity({ saleId, schedule });
        return salesApi.createPaymentPlan(resource)
            .then(response => {
                const createdPlan = PaymentPlanAssembler.toEntityFromResource(response.data);
                paymentPlans.value.push(createdPlan);
                return createdPlan;
            });
    }

    /**
     * Edits an unpaid cuota's date/amount (X6 #7, decision 5 — allowed even
     * when other cuotas in the plan are already paid) and syncs local state.
     * @param {number|string} planId
     * @param {number|string} installmentId
     * @param {{dueDate: string, amount: number|string}} line
     * @returns {Promise<import('../domain/model/payment-plan.entity.js').PaymentPlan>}
     */
    function updatePaymentInstallment(planId, installmentId, line) {
        const resource = PaymentPlanAssembler.toUpdateInstallmentResource(line);
        return salesApi.updatePaymentInstallment(planId, installmentId, resource)
            .then(response => {
                const updatedPlan = PaymentPlanAssembler.toEntityFromResource(response.data);
                const index = paymentPlans.value.findIndex(plan => plan.id === updatedPlan.id);
                if (index !== -1) paymentPlans.value[index] = updatedPlan;
                return updatedPlan;
            });
    }

    /**
     * Registers the payment of one installment on a pending plan and
     * synchronises local state — removing it from the pending list once
     * fully paid, since this store only tracks pending plans. Also patches
     * the matching Sale's isFullyPaid (X5 #5) so its badge in
     * sales-history.vue flips to "Completada" immediately, without waiting
     * for a fetchSales() the user may not trigger this session.
     * @param {number|string} planId
     * @returns {Promise<import('../domain/model/payment-plan.entity.js').PaymentPlan>}
     */
    function registerInstallmentPayment(planId) {
        return salesApi.registerInstallmentPayment(planId)
            .then(response => {
                const updatedPlan = PaymentPlanAssembler.toEntityFromResource(response.data);
                const index = paymentPlans.value.findIndex(plan => plan.id === updatedPlan.id);
                if (updatedPlan.isFullyPaid) {
                    if (index !== -1) paymentPlans.value.splice(index, 1);
                } else if (index !== -1) {
                    paymentPlans.value[index] = updatedPlan;
                }
                const sale = sales.value.find(sale => sale.id === updatedPlan.saleId);
                if (sale) sale.isFullyPaid = updatedPlan.isFullyPaid;
                return updatedPlan;
            });
    }

    /**
     * Reverts the most recently registered payment on a plan (X4 A5) —
     * Admin only, enforced server-side. A previously-fully-paid plan that
     * drops out of paidInstallments === totalInstallments becomes pending
     * again, so it needs to be (re-)inserted into the local list, not just
     * updated in place. Also patches the matching Sale's isFullyPaid back
     * to false (X5 #5), the mirror of registerInstallmentPayment's patch.
     * @param {number|string} planId
     * @returns {Promise<import('../domain/model/payment-plan.entity.js').PaymentPlan>}
     */
    function revertInstallmentPayment(planId) {
        return salesApi.revertInstallmentPayment(planId)
            .then(response => {
                const updatedPlan = PaymentPlanAssembler.toEntityFromResource(response.data);
                const index = paymentPlans.value.findIndex(plan => plan.id === updatedPlan.id);
                if (index !== -1) {
                    paymentPlans.value[index] = updatedPlan;
                } else {
                    paymentPlans.value.push(updatedPlan);
                }
                const sale = sales.value.find(sale => sale.id === updatedPlan.saleId);
                if (sale) sale.isFullyPaid = updatedPlan.isFullyPaid;
                return updatedPlan;
            });
    }

    return {
        // State
        sales,
        customers,
        currentSale,
        salesLoaded,
        salesError,
        customersLoaded,
        customersError,
        paymentPlans,
        paymentPlansLoaded,
        // Computed
        salesCount,
        totalRevenue,
        paidSalesCount,
        // Queries
        getSaleById,
        getCustomerById,
        // Fetch
        fetchSales,
        fetchSalesInRange,
        fetchSalesRevenue,
        fetchCustomers,
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
        deleteCustomer,
        // Payment Plans
        fetchPendingPaymentPlans,
        fetchPaymentPlanBySale,
        createPaymentPlan,
        updatePaymentInstallment,
        registerInstallmentPayment,
        revertInstallmentPayment
    };
});

export default useSalesStore;