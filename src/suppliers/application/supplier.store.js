/**
 * Application service store for the Supplier & Replenishment Management bounded context.
 *
 * Business rules enforced here:
 * - fetchSuppliers and fetchPurchaseOrders are scoped to the authenticated business.
 * - A supplier cannot be deactivated while it has PENDING or DELAYED purchase
 *   orders — enforced by the backend (409 Conflict).
 * - A purchase order requires at least one detail line before being submitted.
 * - A purchase order can only transition to RECEIVED or CANCELLED when its current
 *   status is PENDING or DELAYED; attempts on final states are silently rejected.
 * - A purchase order and all of its lines are persisted atomically in a
 *   single POST /purchases (see createPurchaseOrder).
 * - totalAmount is computed client-side from detail lineTotals (entity getter).
 * - pendingOrderCount and pendingOrderTotal are derived computed refs for the stats bar.
 *
 * @module useSupplierStore
 */
import { defineStore }  from 'pinia';
import { computed, ref } from 'vue';
import { SupplierApi }              from '../infrastructure/supplier.api.js';
import { SupplierAssembler }        from '../infrastructure/supplier.assembler.js';
import { todayLocalDateString }     from '../../shared/domain/model/local-date.js';
import { PurchaseOrderAssembler }   from '../infrastructure/purchase-order.assembler.js';
import { PurchaseOrder, PurchaseOrderStatus } from '../domain/model/purchase-order.entity.js';
import { warnIfTruncated }          from '../../shared/infrastructure/pagination.js';
import { SupplierPaymentPlanAssembler } from '../infrastructure/supplier-payment-plan.assembler.js';

const supplierApi = new SupplierApi();

const useSupplierStore = defineStore('supplier', () => {

    /** @type {import('vue').Ref<import('../domain/model/supplier.entity.js').Supplier[]>} */
    const suppliers = ref([]);

    /** @type {import('vue').Ref<import('../domain/model/purchase-order.entity.js').PurchaseOrder[]>} */
    const purchaseOrders = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const suppliersLoaded = ref(false);

    /** @type {import('vue').Ref<boolean>} */
    const purchaseOrdersLoaded = ref(false);

    /**
     * Pending (not fully paid) supplier payment plans — loaded on demand
     * (fetchPendingSupplierPaymentPlans), not as part of fetchPurchaseOrders.
     * Mirrors Sales' paymentPlans (X6 #7), applied to purchase orders (X6 #12).
     * @type {import('vue').Ref<import('../domain/model/supplier-payment-plan.entity.js').SupplierPaymentPlan[]>}
     */
    const supplierPaymentPlans = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const supplierPaymentPlansLoaded = ref(false);

    // ─── Computed ──────────────────────────────────────────────────────────────

    /**
     * Count of active suppliers available for new orders.
     * @type {import('vue').ComputedRef<number>}
     */
    const activeSupplierCount = computed(() =>
        suppliers.value.filter(supplier => supplier.isActive).length
    );

    /**
     * Count of purchase orders in PENDING or DELAYED state.
     * @type {import('vue').ComputedRef<number>}
     */
    const pendingOrderCount = computed(() =>
        purchaseOrders.value.filter(order => order.isActionable).length
    );

    /**
     * Sum of totalAmount for all PENDING or DELAYED purchase orders.
     * @type {import('vue').ComputedRef<number>}
     */
    const pendingOrderTotal = computed(() => {
        const total = purchaseOrders.value
            .filter(order => order.isActionable)
            .reduce((accumulator, order) => accumulator + order.totalAmount, 0);
        return Math.round(total * 100) / 100;
    });

    /**
     * Count of purchase orders in DELAYED state.
     * @type {import('vue').ComputedRef<number>}
     */
    const delayedOrderCount = computed(() =>
        purchaseOrders.value.filter(order => order.isDelayed).length
    );

    // ─── Queries ───────────────────────────────────────────────────────────────

    /**
     * Finds a supplier entity by its numeric identifier.
     * @param {number|string} id
     * @returns {import('../domain/model/supplier.entity.js').Supplier|undefined}
     */
    function getSupplierById(id) {
        return suppliers.value.find(supplier => supplier.id === parseInt(id));
    }

    /**
     * Finds a purchase order entity by its numeric identifier.
     * @param {number|string} id
     * @returns {import('../domain/model/purchase-order.entity.js').PurchaseOrder|undefined}
     */
    function getPurchaseOrderById(id) {
        return purchaseOrders.value.find(order => order.id === parseInt(id));
    }

    /**
     * Returns all purchase orders for a specific supplier.
     * @param {number|string} supplierId
     * @returns {import('../domain/model/purchase-order.entity.js').PurchaseOrder[]}
     */
    function getPurchaseOrdersBySupplier(supplierId) {
        return purchaseOrders.value.filter(order => order.supplierId === parseInt(supplierId));
    }

    // ─── Commands ──────────────────────────────────────────────────────────────

    /**
     * Fetches all suppliers for the authenticated business, active and
     * inactive alike — this store is the single source both the supplier
     * management page (which needs to show and reactivate inactive ones)
     * and every picker (product form, purchase order form) read from; the
     * pickers already filter to `.isActive` themselves (X4 M11), so there's
     * no need for two separate fetches/caches here. Scoped server-side by
     * the JWT, no businessId parameter needed or accepted.
     * @returns {Promise<void>}
     */
    function fetchSuppliers() {
        return supplierApi.getSuppliers(true)
            .then(response => {
                warnIfTruncated(response, 'Proveedores');
                suppliers.value       = SupplierAssembler.toEntitiesFromResponse(response);
                suppliersLoaded.value = true;
            });
    }

    /**
     * Fetches all purchase orders for the authenticated business.
     *
     * The real backend already embeds each order's line items in the
     * /purchases response (FindAllByBusinessIdAsync eager-loads Details), so
     * this no longer needs a /purchaseDetails fetch per order — only
     * supplierName still needs enriching client-side, since Suppliers'
     * PurchaseOrderResource only carries supplierId.
     *
     * Ensures suppliers are loaded first (awaiting fetchSuppliers if needed) so
     * each order's supplierName can be resolved regardless of whether the caller
     * happened to load suppliers first — this view can be reached directly
     * without visiting the Suppliers tab in the same session.
     */
    function fetchPurchaseOrders() {
        const suppliersReady = suppliersLoaded.value ? Promise.resolve() : fetchSuppliers();

        return suppliersReady
            .then(() => supplierApi.getPurchaseOrders())
            .then(response => {
                warnIfTruncated(response, 'Órdenes de compra');
                const rawOrders = Array.isArray(response.data) ? response.data : (response.data?.items ?? []);
                purchaseOrders.value = rawOrders.map(rawOrder => {
                    const supplierEntity = suppliers.value.find(supplier => supplier.id === rawOrder.supplierId);
                    return PurchaseOrderAssembler.toEntityFromResource({
                        ...rawOrder,
                        supplierName: supplierEntity ? supplierEntity.fullName : ''
                    });
                });
                purchaseOrdersLoaded.value = true;
            });
    }

    /**
     * Creates a new supplier and appends it to local state.
     * @param {import('../domain/model/supplier.entity.js').Supplier} supplier
     * @returns {Promise<import('../domain/model/supplier.entity.js').Supplier>}
     */
    function addSupplier(supplier) {
        const resource = SupplierAssembler.toResourceFromEntity(supplier);
        return supplierApi.createSupplier(resource)
            .then(response => {
                const createdSupplier = SupplierAssembler.toEntityFromResource(response.data);
                suppliers.value.push(createdSupplier);
                return createdSupplier;
            });
    }

    /**
     * Updates an existing supplier and synchronizes local state.
     * @param {import('../domain/model/supplier.entity.js').Supplier} supplier - Must include id.
     * @returns {Promise<import('../domain/model/supplier.entity.js').Supplier>}
     */
    function updateSupplier(supplier) {
        const resource = SupplierAssembler.toResourceFromEntity(supplier);
        return supplierApi.updateSupplier(supplier.id, resource)
            .then(response => {
                const updatedSupplier = SupplierAssembler.toEntityFromResource(response.data);
                const index = suppliers.value.findIndex(existingSupplier => existingSupplier.id === updatedSupplier.id);
                if (index !== -1) suppliers.value[index] = updatedSupplier;
                return updatedSupplier;
            });
    }

    /**
     * Deactivates a supplier via the backend's dedicated DELETE endpoint
     * (soft-delete: flips Status to INACTIVE server-side). Previously sent a
     * full supplier resource through the PATCH/edit endpoint, whose
     * UpdateSupplierResource has no Status field — that request returned 200
     * but silently left the supplier active.
     *
     * Business rule: deactivation is blocked when the supplier has any
     * PENDING or DELAYED purchase orders — enforced backend-side (409,
     * localized message) since a client-only guard here duplicated that
     * check with a hardcoded English message and could run against a
     * `purchaseOrders` list that hadn't loaded yet.
     *
     * @param {number|string} supplierId
     * @returns {Promise<import('../domain/model/supplier.entity.js').Supplier>}
     */
    function deactivateSupplier(supplierId) {
        const numericId      = parseInt(supplierId);
        const existingSupplier = suppliers.value.find(supplier => supplier.id === numericId);
        if (!existingSupplier) return Promise.reject(new Error(`Supplier #${numericId} not found.`));

        return supplierApi.deactivateSupplier(numericId)
            .then(response => {
                const updatedSupplier = SupplierAssembler.toEntityFromResource(response.data);
                const index = suppliers.value.findIndex(supplier => supplier.id === numericId);
                if (index !== -1) suppliers.value[index] = updatedSupplier;
                return updatedSupplier;
            });
    }

    /**
     * X4 M11: undoes deactivateSupplier — there was no way back from it before.
     * @param {number|string} supplierId
     * @returns {Promise<import('../domain/model/supplier.entity.js').Supplier>}
     */
    function reactivateSupplier(supplierId) {
        const numericId = parseInt(supplierId);
        return supplierApi.reactivateSupplier(numericId)
            .then(response => {
                const updatedSupplier = SupplierAssembler.toEntityFromResource(response.data);
                const index = suppliers.value.findIndex(supplier => supplier.id === numericId);
                if (index !== -1) suppliers.value[index] = updatedSupplier;
                return updatedSupplier;
            });
    }

    /**
     * Creates a purchase order atomically with all of its lines embedded.
     *
     * The real backend has no OPEN/PENDING-then-attach-lines flow — a single
     * POST /purchases persists the order with its lines in one go
     * (CreatePurchaseOrderCommand), the same "todo o nada" pattern as Sales.
     * There is also no standalone endpoint to persist a line separately, and
     * the backend's Date field is a DateOnly, not a full timestamp — sending
     * new Date().toISOString() (which includes a time component) fails to
     * bind, so this sends only the date portion.
     *
     * Business rules:
     * - detailLines must contain at least one item.
     * - Each detail line must have quantity > 0 and unitPrice > 0.
     *
     * @param {Object}   orderPayload
     * @param {number}   orderPayload.supplierId
     * @param {string}   orderPayload.expectedDate  - yyyy-MM-dd date string.
     * @param {string}   [orderPayload.description]
     * @param {Object[]} orderPayload.detailLines
     * @param {number}   orderPayload.detailLines[].productId
     * @param {string}   orderPayload.detailLines[].productName
     * @param {number}   orderPayload.detailLines[].quantity
     * @param {number}   orderPayload.detailLines[].unitPrice
     * @param {number}   [orderPayload.detailLines[].discount]
     * @returns {Promise<import('../domain/model/purchase-order.entity.js').PurchaseOrder>}
     */
    function createPurchaseOrder(orderPayload) {
        if (!orderPayload.detailLines || orderPayload.detailLines.length === 0) {
            return Promise.reject(new Error('A purchase order requires at least one detail line.'));
        }

        const invalidLines = orderPayload.detailLines.filter(
            line => !line.quantity || line.quantity <= 0 || !line.unitPrice || line.unitPrice <= 0
        );

        if (invalidLines.length > 0) {
            return Promise.reject(new Error('All purchase order lines must have quantity > 0 and unitPrice > 0.'));
        }

        const supplierEntity = suppliers.value.find(supplier => supplier.id === parseInt(orderPayload.supplierId));

        const orderResource = {
            supplierId:   parseInt(orderPayload.supplierId),
            date:         todayLocalDateString(),
            expectedDate: orderPayload.expectedDate,
            currency:     'PEN',
            description:  orderPayload.description ?? '',
            lines: orderPayload.detailLines.map(line => ({
                productId:  parseInt(line.productId),
                quantity:   parseInt(line.quantity),
                unitPrice:  parseFloat(line.unitPrice),
                discount:   parseFloat(line.discount ?? 0),
                batchLabel: line.batchLabel ?? null
            }))
        };

        return supplierApi.createPurchaseOrder(orderResource)
            .then(orderResponse => {
                const rawDetails = orderResponse.data.details.map(detail => ({
                    ...detail,
                    productName: orderPayload.detailLines.find(
                        line => parseInt(line.productId) === detail.productId
                    )?.productName ?? ''
                }));
                const createdOrder = PurchaseOrderAssembler.toEntityFromResource({
                    ...orderResponse.data,
                    supplierName: supplierEntity ? supplierEntity.fullName : '',
                    details:      rawDetails
                });
                purchaseOrders.value.unshift(createdOrder);
                return createdOrder;
            });
    }

    /**
     * Transitions a purchase order to a new status.
     *
     * Business rule: only PENDING or DELAYED orders can be transitioned.
     * RECEIVED or CANCELLED orders are immutable and this call is rejected silently.
     *
     * @param {number|string}       orderId
     * @param {PurchaseOrderStatus} newStatus - Must be RECEIVED, DELAYED or CANCELLED.
     * @returns {Promise<import('../domain/model/purchase-order.entity.js').PurchaseOrder>}
     */
    function updatePurchaseOrderStatus(orderId, newStatus) {
        const numericId    = parseInt(orderId);
        const existingOrder = purchaseOrders.value.find(order => order.id === numericId);

        if (!existingOrder) return Promise.reject(new Error(`Purchase order #${numericId} not found.`));

        if (!existingOrder.isActionable) {
            return Promise.reject(new Error(
                `Cannot update purchase order #${numericId}: it is already ${existingOrder.status}.`
            ));
        }

        return supplierApi.updatePurchaseOrder(numericId, { status: newStatus })
            .then(response => {
                const updatedOrder = PurchaseOrderAssembler.toEntityFromResource({
                    ...response.data,
                    supplierName: existingOrder.supplierName,
                    details:      existingOrder.details
                });
                const index = purchaseOrders.value.findIndex(order => order.id === numericId);
                if (index !== -1) purchaseOrders.value[index] = updatedOrder;
                return updatedOrder;
            });
    }

    // ─── Supplier Payment Plans ────────────────────────────────────────────────

    /**
     * Loads pending (not fully paid) supplier payment plans into local state —
     * for the whole business, or narrowed to one supplier's orders when
     * supplierId is given.
     * @param {number|string} [supplierId]
     * @returns {Promise<void>}
     */
    function fetchPendingSupplierPaymentPlans(supplierId) {
        return supplierApi.getPendingSupplierPaymentPlans(supplierId)
            .then(response => {
                supplierPaymentPlans.value = SupplierPaymentPlanAssembler.toEntitiesFromResponse(response);
                supplierPaymentPlansLoaded.value = true;
            })
            .catch(() => {
                supplierPaymentPlansLoaded.value = true;
            });
    }

    /**
     * Fetches the payment plan attached to a specific purchase order, if any.
     * @param {number|string} purchaseOrderId
     * @returns {Promise<import('../domain/model/supplier-payment-plan.entity.js').SupplierPaymentPlan|null>}
     */
    function fetchSupplierPaymentPlanByPurchaseOrder(purchaseOrderId) {
        return supplierApi.getSupplierPaymentPlanByPurchaseOrder(purchaseOrderId)
            .then(response => SupplierPaymentPlanAssembler.toEntityFromResource(response.data))
            .catch(() => null);
    }

    /**
     * Attaches a payment plan (compra "a crédito") to an already-confirmed
     * purchase order. Deliberately a separate call from createPurchaseOrder —
     * the backend itself never lets plan creation touch how the order was
     * totaled (see SupplierPaymentPlanCommandService). Unlike Sales' #7, this
     * is allowed on a PENDING, DELAYED, or RECEIVED order — only CANCELLED
     * orders reject it (X6 #12, decision 12.5).
     *
     * @param {number|string} purchaseOrderId
     * @param {Array<{dueDate: string, amount: number|string}>} schedule - Must add up exactly to the order's total.
     * @returns {Promise<import('../domain/model/supplier-payment-plan.entity.js').SupplierPaymentPlan>}
     */
    function createSupplierPaymentPlan(purchaseOrderId, schedule) {
        const resource = SupplierPaymentPlanAssembler.toResourceFromEntity({ purchaseOrderId, schedule });
        return supplierApi.createSupplierPaymentPlan(resource)
            .then(response => {
                const createdPlan = SupplierPaymentPlanAssembler.toEntityFromResource(response.data);
                supplierPaymentPlans.value.push(createdPlan);
                return createdPlan;
            });
    }

    /**
     * Edits an unpaid cuota's date/amount — allowed even when other cuotas in
     * the same plan are already paid — and syncs local state.
     * @param {number|string} planId
     * @param {number|string} installmentId
     * @param {{dueDate: string, amount: number|string}} line
     * @returns {Promise<import('../domain/model/supplier-payment-plan.entity.js').SupplierPaymentPlan>}
     */
    function updateSupplierPaymentInstallment(planId, installmentId, line) {
        const resource = SupplierPaymentPlanAssembler.toUpdateInstallmentResource(line);
        return supplierApi.updateSupplierPaymentInstallment(planId, installmentId, resource)
            .then(response => {
                const updatedPlan = SupplierPaymentPlanAssembler.toEntityFromResource(response.data);
                const index = supplierPaymentPlans.value.findIndex(plan => plan.id === updatedPlan.id);
                if (index !== -1) supplierPaymentPlans.value[index] = updatedPlan;
                return updatedPlan;
            });
    }

    /**
     * Registers the payment of one installment on a pending plan and
     * synchronises local state — removing it from the pending list once
     * fully paid, since this store only tracks pending plans.
     * @param {number|string} planId
     * @returns {Promise<import('../domain/model/supplier-payment-plan.entity.js').SupplierPaymentPlan>}
     */
    function registerSupplierInstallmentPayment(planId) {
        return supplierApi.registerSupplierInstallmentPayment(planId)
            .then(response => {
                const updatedPlan = SupplierPaymentPlanAssembler.toEntityFromResource(response.data);
                const index = supplierPaymentPlans.value.findIndex(plan => plan.id === updatedPlan.id);
                if (updatedPlan.isFullyPaid) {
                    if (index !== -1) supplierPaymentPlans.value.splice(index, 1);
                } else if (index !== -1) {
                    supplierPaymentPlans.value[index] = updatedPlan;
                }
                return updatedPlan;
            });
    }

    /**
     * Reverts the most recently registered payment on a plan — Admin only,
     * enforced server-side. A previously-fully-paid plan that drops out of
     * paidInstallments === totalInstallments becomes pending again, so it
     * needs to be (re-)inserted into the local list, not just updated in place.
     * @param {number|string} planId
     * @returns {Promise<import('../domain/model/supplier-payment-plan.entity.js').SupplierPaymentPlan>}
     */
    function revertSupplierInstallmentPayment(planId) {
        return supplierApi.revertSupplierInstallmentPayment(planId)
            .then(response => {
                const updatedPlan = SupplierPaymentPlanAssembler.toEntityFromResource(response.data);
                const index = supplierPaymentPlans.value.findIndex(plan => plan.id === updatedPlan.id);
                if (index !== -1) {
                    supplierPaymentPlans.value[index] = updatedPlan;
                } else {
                    supplierPaymentPlans.value.push(updatedPlan);
                }
                return updatedPlan;
            });
    }

    return {
        suppliers,
        purchaseOrders,
        suppliersLoaded,
        purchaseOrdersLoaded,
        supplierPaymentPlans,
        supplierPaymentPlansLoaded,
        activeSupplierCount,
        pendingOrderCount,
        pendingOrderTotal,
        delayedOrderCount,
        getSupplierById,
        getPurchaseOrderById,
        getPurchaseOrdersBySupplier,
        fetchSuppliers,
        fetchPurchaseOrders,
        addSupplier,
        updateSupplier,
        deactivateSupplier,
        reactivateSupplier,
        createPurchaseOrder,
        updatePurchaseOrderStatus,
        fetchPendingSupplierPaymentPlans,
        fetchSupplierPaymentPlanByPurchaseOrder,
        createSupplierPaymentPlan,
        updateSupplierPaymentInstallment,
        registerSupplierInstallmentPayment,
        revertSupplierInstallmentPayment
    };
});

export default useSupplierStore;
