<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n }  from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue';
import useSalesStore from '../../application/sales.store.js';
import useIamStore   from '../../../iam/application/iam.store.js';
import { canRevertInstallmentPayments } from '../../../iam/application/permissions.js';
import { SaleStatus } from '../../domain/model/sale.entity.js';
import { toDateLocale } from '../../../shared/presentation/date-locale.js';

/**
 * PaymentPlansList view for the Sales & POS Management bounded context.
 *
 * Lists every pending (not fully paid) credit installment plan for the
 * business, with a button to register the payment of the next installment.
 * A plan disappears from this list as soon as it becomes fully paid — the
 * store only tracks pending plans here, matching the backend's own
 * GET /payment-plans/pending.
 *
 * @view PaymentPlansList
 */

const { t, locale } = useI18n();
const toast         = useToast();
const confirm        = useConfirm();
const salesStore     = useSalesStore();
const iamStore       = useIamStore();

/** X4 A5: reverting a registered payment — admin only. */
const canRevert = computed(() => canRevertInstallmentPayments(iamStore.currentUserPosition));

/** @type {import('vue').Ref<number|null>} Id of the plan whose payment history is expanded, or null. */
const expandedPlanId = ref(null);

/** @type {import('vue').Ref<number|null>} Id of the plan whose last payment is being reverted, for its button's spinner. */
const revertingPlanId = ref(null);

/** @type {import('vue').Ref<string>} Text in the customer-name search input. */
const searchQuery = ref('');

/** @type {import('vue').Ref<number|null>} Id of the plan currently being paid, for its button's spinner. */
const registeringPlanId = ref(null);

/** @type {import('vue').Ref<boolean>} Whether the "create plan" modal is open. */
const showCreateModal = ref(false);

/** @type {import('vue').Ref<boolean>} Whether a create-plan request is in flight. */
const creatingPlan = ref(false);

/** @type {import('vue').Ref<string>} Id (as string, for the select) of the sale chosen in the create-plan modal. */
const newPlanSaleId = ref('');

/** @type {import('vue').Ref<string>} Installment count entered in the create-plan modal. */
const newPlanInstallments = ref('2');

/**
 * Sales that can have a payment plan attached (or re-attached, after a
 * partial failure — see pos-screen.vue's handlePaymentConfirm, which already
 * creates the plan automatically right after a CREDIT sale, but can leave one
 * missing if that second call fails): sold on credit (the backend rejects
 * attaching a plan to anything else — SaleIsNotACreditSale), tied to a real
 * customer (a plan needs someone to collect the debt from), and without an
 * already-pending plan. This is a best-effort client-side filter for the
 * picker — salesStore.paymentPlans only tracks PENDING plans (see the view's
 * doc comment), so a sale whose plan was already fully paid off could still
 * slip through here; the backend's own PaymentPlanAlreadyExists check (see
 * PaymentPlanCommandService.Handle) is the real guard against that edge case.
 * @type {import('vue').ComputedRef<Array>}
 */
const eligibleSales = computed(() => {
  const pendingSaleIds = new Set(salesStore.paymentPlans.map(plan => plan.saleId));
  return salesStore.sales.filter(sale =>
      sale.status === SaleStatus.CREDIT && sale.customerId && !pendingSaleIds.has(sale.id));
});

/** @type {import('vue').ComputedRef<boolean>} Whether the create-plan form is ready to submit. */
const canConfirmCreate = computed(() =>
    !!newPlanSaleId.value && (parseInt(newPlanInstallments.value) || 0) >= 2);

/** Opens the create-plan modal with a blank form. */
function openCreatePlanModal() {
  newPlanSaleId.value = '';
  newPlanInstallments.value = '2';
  showCreateModal.value = true;
}

/** Closes the create-plan modal (no-op while a request is in flight). */
function closeCreatePlanModal() {
  if (creatingPlan.value) return;
  showCreateModal.value = false;
}

/** Submits the create-plan form. */
function confirmCreatePlan() {
  if (!canConfirmCreate.value || creatingPlan.value) return;
  creatingPlan.value = true;
  salesStore.createPaymentPlan(parseInt(newPlanSaleId.value), parseInt(newPlanInstallments.value) || 2)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('payment-plans.toast-create-success'), life: 3500 });
        showCreateModal.value = false;
      })
      .catch(error => {
        const detail = error.response?.data?.detail ?? t('payment-plans.toast-create-error');
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail, life: 4500 });
      })
      .finally(() => {
        creatingPlan.value = false;
      });
}

/**
 * Resolves the customer name for a plan by joining through its sale — the
 * PaymentPlanResource itself carries no customerId, only saleId.
 * @param {import('../../domain/model/payment-plan.entity.js').PaymentPlan} plan
 * @returns {string}
 */
function customerNameForPlan(plan) {
  const sale = salesStore.getSaleById(plan.saleId);
  if (!sale || !sale.customerId) return t('pos.anonymous-customer');
  const customer = salesStore.getCustomerById(sale.customerId);
  if (!customer) return t('pos.unknown-customer');
  return customer.isActive ? customer.fullName : `${customer.fullName} ${t('customers.deleted-suffix')}`;
}

/**
 * Resolves the customer name for a raw sale — used by the create-plan
 * modal's picker, which lists sales rather than plans.
 * @param {import('../../domain/model/sale.entity.js').Sale} sale
 * @returns {string}
 */
function customerNameForSale(sale) {
  if (!sale.customerId) return t('pos.anonymous-customer');
  const customer = salesStore.getCustomerById(sale.customerId);
  if (!customer) return t('pos.unknown-customer');
  return customer.isActive ? customer.fullName : `${customer.fullName} ${t('customers.deleted-suffix')}`;
}

/**
 * Resolves the sale's total for a plan, or null if the sale isn't loaded
 * yet. Prices already include IGV (the business bakes it into BasePrice),
 * so this is just the persisted total — no extra tax gets layered on here.
 * @param {import('../../domain/model/payment-plan.entity.js').PaymentPlan} plan
 * @returns {number|null}
 */
function saleTotalForPlan(plan) {
  const sale = salesStore.getSaleById(plan.saleId);
  return sale ? sale.totalAmount : null;
}

/**
 * Splits a total into `count` installment amounts that sum back to it
 * exactly — mirrors the backend's own calculation
 * (PaymentPlanCommandService.Handle(RegisterInstallmentPaymentCommand):
 * round-to-nearest-cent per installment, remainder folded into the last
 * one) so this preview never disagrees with what actually gets recorded.
 * @param {number} total
 * @param {number} count
 * @returns {number[]}
 */
function splitIntoInstallments(total, count) {
  const base = Math.round((total / count) * 100) / 100;
  const last = Math.round((total - base * (count - 1)) * 100) / 100;
  return Array.from({ length: count }, (_, index) => index === count - 1 ? last : base);
}

/**
 * Amount of the plan's next unpaid installment. Once that installment is
 * actually registered, the real amount lives in `plan.payments` instead —
 * this is only a preview of what registering it next would produce.
 * @param {import('../../domain/model/payment-plan.entity.js').PaymentPlan} plan
 * @returns {string}
 */
function installmentAmountLabel(plan) {
  const total = saleTotalForPlan(plan);
  if (total == null) return '—';
  const amounts = splitIntoInstallments(total, plan.totalInstallments);
  const nextIndex = Math.min(plan.paidInstallments, amounts.length - 1);
  return formatCurrency(amounts[nextIndex]);
}

/**
 * Plans filtered by the customer-name search query.
 * @type {import('vue').ComputedRef<Array>}
 */
const filteredPlans = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return salesStore.paymentPlans;
  return salesStore.paymentPlans.filter(plan => customerNameForPlan(plan).toLowerCase().includes(query));
});

function formatCurrency(amount) {
  return `S/ ${Number(amount).toFixed(2)}`;
}

/**
 * Prompts for confirmation, then registers the payment of the plan's next
 * installment.
 * @param {import('../../domain/model/payment-plan.entity.js').PaymentPlan} plan
 */
function confirmRegisterPayment(plan) {
  confirm.require({
    message: t('payment-plans.confirm-register-body', { customer: customerNameForPlan(plan) }),
    header:  t('payment-plans.confirm-register-header'),
    icon:    'pi pi-check-circle',
    accept:  () => {
      registeringPlanId.value = plan.id;
      salesStore.registerInstallmentPayment(plan.id)
          .then(() => {
            toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('payment-plans.toast-payment-success'), life: 3500 });
          })
          .catch(() => {
            toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('payment-plans.toast-payment-error'), life: 4500 });
          })
          .finally(() => {
            registeringPlanId.value = null;
          });
    }
  });
}

/** Toggles a plan's payment-history panel. */
function toggleHistory(plan) {
  expandedPlanId.value = expandedPlanId.value === plan.id ? null : plan.id;
}

/**
 * Who registered/reversed a payment — "Tú" for the signed-in user, the
 * resolved name when it's loaded (GET /users is Admin-only, so a cashier
 * viewing another cashier's payment won't have it), or a numbered fallback.
 * @param {number} userId
 * @returns {string}
 */
function userLabel(userId) {
  if (iamStore.currentUser && userId === iamStore.currentUser.id) return t('payment-plans.you');
  const user = iamStore.getUserById(userId);
  return user ? `${user.name} ${user.lastName}` : t('payment-plans.unknown-user', { id: userId });
}

/**
 * Formats an ISO date string as a short locale date + time.
 * @param {string} dateString
 * @returns {string}
 */
function formatDateTime(dateString) {
  return new Date(dateString).toLocaleString(toDateLocale(locale.value), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
}

/**
 * Prompts for confirmation, then reverts a plan's most recently registered
 * payment (X4 A5) — undoes exactly one payment, not the whole plan.
 * @param {import('../../domain/model/payment-plan.entity.js').PaymentPlan} plan
 */
function confirmRevertPayment(plan) {
  confirm.require({
    message: t('payment-plans.confirm-revert-body', { customer: customerNameForPlan(plan) }),
    header:  t('payment-plans.confirm-revert-header'),
    icon:    'pi pi-exclamation-triangle',
    accept:  () => {
      revertingPlanId.value = plan.id;
      salesStore.revertInstallmentPayment(plan.id)
          .then(() => {
            toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('payment-plans.toast-revert-success'), life: 3500 });
          })
          .catch(() => {
            toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('payment-plans.toast-revert-error'), life: 4500 });
          })
          .finally(() => {
            revertingPlanId.value = null;
          });
    }
  });
}

onMounted(() => {
  if (!salesStore.paymentPlansLoaded) salesStore.fetchPendingPaymentPlans();
  if (!salesStore.salesLoaded)        salesStore.fetchSales();
  if (!salesStore.customersLoaded)    salesStore.fetchCustomers();
  // GET /users is Admin-only — only fetched for an Admin (who can also
  // revert a payment and so actually needs to identify who registered each
  // one); a cashier keeps the numbered fallback in userLabel() above.
  if (canRevert.value && !iamStore.usersLoaded && iamStore.currentUser) {
    iamStore.fetchUsers(iamStore.currentUser.businessId);
  }
});
</script>

<template>
  <div class="flex flex-column h-full overflow-hidden">

    <!-- Header bar: search + create plan -->
    <div
        class="flex flex-column sm:flex-row sm:align-items-center gap-2 px-4 py-3"
        style="border-bottom: 1px solid var(--border);"
    >
      <div class="flex-1" style="position: relative;">
        <i
            class="pi pi-search"
            style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-faint); font-size: 0.85rem;"
        />
        <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('payment-plans.search-placeholder')"
            class="w-full border-round-lg"
            style="padding: 8px 12px 8px 36px; border: 1px solid var(--border); font-size: 0.85rem; background-color: var(--surface-alt); outline: none;"
            @focus="(e) => e.target.style.borderColor = 'var(--brand)'"
            @blur="(e) => e.target.style.borderColor = 'var(--border)'"
        />
      </div>
      <button
          class="flex align-items-center gap-2 border-round-lg px-4 py-2 shrink-0"
          style="background-color: var(--brand); color: var(--surface); font-size: 0.85rem; font-weight: 600; border: none; cursor: pointer;"
          @click="openCreatePlanModal"
      >
        <i class="pi pi-plus" style="font-size: 1rem;" />
        <span>{{ t('payment-plans.create-btn') }}</span>
      </button>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto">

      <!-- Loading -->
      <div v-if="!salesStore.paymentPlansLoaded" class="flex justify-content-center align-items-center gap-3 py-8">
        <i class="pi pi-spin pi-spinner" style="font-size: 1.5rem; color: var(--brand);"/>
        <span style="font-size: 0.85rem; color: var(--text-muted);">{{ t('payment-plans.loading') }}</span>
      </div>

      <template v-else>
      <!-- Desktop table -->
      <div class="hidden md:block">
        <table class="w-full" style="border-collapse: collapse;">
          <thead>
          <tr style="background-color: var(--surface-alt); border-bottom: 1px solid var(--border);">
            <th
                v-for="header in [
                                    t('payment-plans.col-customer'),
                                    t('payment-plans.col-sale'),
                                    t('payment-plans.col-progress'),
                                    t('payment-plans.col-installment-amount'),
                                    ''
                                ]"
                :key="header"
                class="px-4 py-3 text-left"
                style="font-size: 0.72rem; font-weight: 600; color: var(--text-faint);"
            >
              {{ header }}
            </th>
          </tr>
          </thead>
          <tbody>
          <template v-for="plan in filteredPlans" :key="plan.id">
          <tr
              style="border-bottom: 1px solid var(--surface-alt);"
          >
            <td class="px-4 py-3" style="font-size: 0.82rem; font-weight: 600; color: var(--text);">
              {{ customerNameForPlan(plan) }}
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: var(--text-muted);">
              #{{ plan.saleId }}
            </td>
            <td class="px-4 py-3">
              <div class="flex align-items-center gap-2">
                <div class="border-round-3xl" style="width: 80px; height: 6px; background-color: var(--border); overflow: hidden;">
                  <div
                      class="h-full border-round-3xl"
                      style="background-color: var(--brand);"
                      :style="{ width: `${(plan.paidInstallments / plan.totalInstallments) * 100}%` }"
                  />
                </div>
                <span style="font-size: 0.78rem; color: var(--text-muted);">{{ plan.paidInstallments }}/{{ plan.totalInstallments }}</span>
              </div>
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: var(--text-muted);">
              {{ installmentAmountLabel(plan) }}
            </td>
            <td class="px-4 py-3">
              <div class="flex align-items-center gap-2">
                <button
                    class="flex align-items-center gap-2 border-round-lg px-3 py-2"
                    style="background-color: var(--brand); color: var(--surface); font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
                    :disabled="registeringPlanId === plan.id"
                    @click="confirmRegisterPayment(plan)"
                >
                  <i :class="registeringPlanId === plan.id ? 'pi pi-spin pi-spinner' : 'pi pi-check'" style="font-size: 0.8rem;" />
                  <span>{{ t('payment-plans.btn-register-payment') }}</span>
                </button>
                <button
                    v-if="plan.payments.length > 0"
                    class="border-round-lg px-2 py-2"
                    style="background: none; border: 1px solid var(--border); cursor: pointer;"
                    :title="t('payment-plans.btn-history')"
                    @click="toggleHistory(plan)"
                >
                  <i
                      class="pi pi-history"
                      style="font-size: 0.78rem; color: var(--text-muted);"
                  />
                </button>
              </div>
            </td>
          </tr>

          <!-- Payment history panel -->
          <tr v-if="expandedPlanId === plan.id" :key="`${plan.id}-history`" style="background-color: var(--surface-alt);">
            <td colspan="5" class="px-4 py-3">
              <p class="m-0 mb-2" style="font-size: 0.7rem; font-weight: 600; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em;">
                {{ t('payment-plans.history-title') }}
              </p>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <div
                    v-for="payment in [...plan.payments].reverse()"
                    :key="payment.id"
                    class="flex align-items-center justify-content-between"
                    style="font-size: 0.78rem;"
                    :style="{ opacity: payment.isReversed ? 0.55 : 1 }"
                >
                  <span :style="{ color: 'var(--text-muted)', textDecoration: payment.isReversed ? 'line-through' : 'none' }">
                    {{ formatDateTime(payment.paidAt) }} — {{ userLabel(payment.paidByUserId) }}
                  </span>
                  <div class="flex align-items-center gap-2">
                    <span :style="{ fontWeight: 600, color: payment.isReversed ? 'var(--text-faint)' : 'var(--text)', textDecoration: payment.isReversed ? 'line-through' : 'none' }">
                      {{ formatCurrency(payment.amount) }}
                    </span>
                    <span v-if="payment.isReversed" style="font-size: 0.68rem; color: var(--status-critical-fg);">
                      {{ t('payment-plans.reverted-tag') }}
                    </span>
                    <button
                        v-else-if="canRevert && plan.lastReversiblePayment && plan.lastReversiblePayment.id === payment.id"
                        class="border-round-lg px-2 py-1"
                        style="background-color: var(--status-critical-bg); color: var(--status-critical-fg); font-size: 0.68rem; font-weight: 600; border: none; cursor: pointer;"
                        :disabled="revertingPlanId === plan.id"
                        @click="confirmRevertPayment(plan)"
                    >
                      <i :class="revertingPlanId === plan.id ? 'pi pi-spin pi-spinner' : 'pi pi-undo'" style="font-size: 0.7rem;" />
                      {{ t('payment-plans.btn-revert') }}
                    </button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
          </template>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="md:hidden p-4" style="display: flex; flex-direction: column; gap: 12px;">
        <div
            v-for="plan in filteredPlans"
            :key="plan.id"
            class="bg-white border-round-xl p-4"
            style="border: 1px solid var(--border);"
        >
          <div class="flex align-items-center justify-content-between mb-2">
            <p class="m-0" style="font-size: 0.88rem; font-weight: 700; color: var(--text);">
              {{ customerNameForPlan(plan) }}
            </p>
            <span style="font-size: 0.72rem; color: var(--text-faint);">#{{ plan.saleId }}</span>
          </div>
          <div class="flex align-items-center gap-2 mb-3">
            <div class="border-round-3xl flex-1" style="height: 6px; background-color: var(--border); overflow: hidden;">
              <div
                  class="h-full border-round-3xl"
                  style="background-color: var(--brand);"
                  :style="{ width: `${(plan.paidInstallments / plan.totalInstallments) * 100}%` }"
              />
            </div>
            <span style="font-size: 0.72rem; color: var(--text-muted);">{{ plan.paidInstallments }}/{{ plan.totalInstallments }}</span>
          </div>
          <div class="flex align-items-center justify-content-between">
            <span style="font-size: 0.75rem; color: var(--text-muted);">{{ installmentAmountLabel(plan) }} {{ t('payment-plans.per-installment') }}</span>
            <div class="flex align-items-center gap-2">
              <button
                  v-if="plan.payments.length > 0"
                  class="border-round-lg px-2 py-2"
                  style="background: none; border: 1px solid var(--border); cursor: pointer;"
                  :title="t('payment-plans.btn-history')"
                  @click="toggleHistory(plan)"
              >
                <i class="pi pi-history" style="font-size: 0.78rem; color: var(--text-muted);" />
              </button>
              <button
                  class="flex align-items-center gap-2 border-round-lg px-3 py-2"
                  style="background-color: var(--brand); color: var(--surface); font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
                  :disabled="registeringPlanId === plan.id"
                  @click="confirmRegisterPayment(plan)"
              >
                <i :class="registeringPlanId === plan.id ? 'pi pi-spin pi-spinner' : 'pi pi-check'" style="font-size: 0.8rem;" />
                <span>{{ t('payment-plans.btn-register-payment') }}</span>
              </button>
            </div>
          </div>

          <!-- Payment history panel -->
          <div v-if="expandedPlanId === plan.id" class="mt-3 pt-3" style="border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px;">
            <p class="m-0" style="font-size: 0.68rem; font-weight: 600; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em;">
              {{ t('payment-plans.history-title') }}
            </p>
            <div
                v-for="payment in [...plan.payments].reverse()"
                :key="payment.id"
                class="flex align-items-center justify-content-between"
                style="font-size: 0.75rem;"
                :style="{ opacity: payment.isReversed ? 0.55 : 1 }"
            >
              <span :style="{ color: 'var(--text-muted)', textDecoration: payment.isReversed ? 'line-through' : 'none' }">
                {{ formatDateTime(payment.paidAt) }} — {{ userLabel(payment.paidByUserId) }}
              </span>
              <div class="flex align-items-center gap-2">
                <span :style="{ fontWeight: 600, color: payment.isReversed ? 'var(--text-faint)' : 'var(--text)', textDecoration: payment.isReversed ? 'line-through' : 'none' }">
                  {{ formatCurrency(payment.amount) }}
                </span>
                <span v-if="payment.isReversed" style="font-size: 0.66rem; color: var(--status-critical-fg);">
                  {{ t('payment-plans.reverted-tag') }}
                </span>
                <button
                    v-else-if="canRevert && plan.lastReversiblePayment && plan.lastReversiblePayment.id === payment.id"
                    class="border-round-lg px-2 py-1"
                    style="background-color: var(--status-critical-bg); color: var(--status-critical-fg); font-size: 0.66rem; font-weight: 600; border: none; cursor: pointer;"
                    :disabled="revertingPlanId === plan.id"
                    @click="confirmRevertPayment(plan)"
                >
                  <i :class="revertingPlanId === plan.id ? 'pi pi-spin pi-spinner' : 'pi pi-undo'" style="font-size: 0.68rem;" />
                  {{ t('payment-plans.btn-revert') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
          v-if="filteredPlans.length === 0"
          class="flex flex-column align-items-center justify-content-center py-12 text-center"
      >
        <i class="pi pi-wallet mb-2" style="font-size: 2.25rem; color: var(--text-faint);" />
        <p class="m-0" style="color: var(--text-faint); font-size: 0.88rem;">
          {{ t('payment-plans.no-results') }}
        </p>
      </div>
      </template>
    </div>

    <!-- Create plan modal -->
    <div
        v-if="showCreateModal"
        class="fixed inset-0 flex align-items-center justify-content-center px-4"
        style="background-color: rgba(0,0,0,0.35); z-index: 60;"
        @click.self="closeCreatePlanModal"
    >
      <div
          class="w-full border-round-2xl p-4 shadow-8"
          style="max-width: 380px; background-color: var(--surface); border: 1px solid var(--border);"
      >
        <div class="flex align-items-center justify-content-between mb-4">
          <h2 class="m-0" style="font-size: 1.05rem; font-weight: 700; color: var(--text);">
            {{ t('payment-plans.create-modal-title') }}
          </h2>
          <button
              style="background: none; border: none; cursor: pointer; padding: 4px;"
              :disabled="creatingPlan"
              @click="closeCreatePlanModal"
          >
            <i class="pi pi-times" style="color: var(--text-faint); font-size: 1.1rem;" />
          </button>
        </div>

        <div v-if="eligibleSales.length === 0" class="text-center py-4">
          <i class="pi pi-info-circle mb-2" style="font-size: 1.5rem; color: var(--text-faint);" />
          <p class="m-0" style="font-size: 0.82rem; color: var(--text-muted);">
            {{ t('payment-plans.create-modal-no-eligible-sales') }}
          </p>
        </div>

        <template v-else>
          <div class="mb-3">
            <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">
              {{ t('payment-plans.create-modal-sale-label') }}
            </label>
            <select
                v-model="newPlanSaleId"
                class="w-full border-round-lg px-3"
                style="border: 1px solid var(--border); font-size: 0.88rem; color: var(--text); padding: 10px 12px; outline: none; background: var(--surface);"
            >
              <option value="" disabled>{{ t('payment-plans.create-modal-sale-placeholder') }}</option>
              <option v-for="sale in eligibleSales" :key="sale.id" :value="String(sale.id)">
                #{{ sale.id }} — {{ customerNameForSale(sale) }} — {{ formatCurrency(sale.totalAmount) }}
              </option>
            </select>
          </div>

          <div class="mb-4">
            <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">
              {{ t('payment-plans.create-modal-installments-label') }}
            </label>
            <input
                v-model="newPlanInstallments"
                type="number"
                min="2"
                class="w-full border-round-lg px-3"
                style="border: 1px solid var(--border); font-size: 0.95rem; font-weight: 700; color: var(--brand); padding: 8px 12px; outline: none;"
            />
          </div>

          <button
              class="w-full border-round-xl py-3"
              :style="{
                  backgroundColor: (canConfirmCreate && !creatingPlan) ? 'var(--brand)' : 'var(--text-faint)',
                  color: 'var(--brand-ink)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: (canConfirmCreate && !creatingPlan) ? 'pointer' : 'not-allowed'
              }"
              :disabled="!canConfirmCreate || creatingPlan"
              @click="confirmCreatePlan"
          >
            <i v-if="creatingPlan" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
            {{ creatingPlan ? t('payment-plans.create-modal-saving') : t('payment-plans.create-modal-submit') }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
