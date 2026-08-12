<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n }  from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue';
import useSalesStore from '../../application/sales.store.js';

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

const { t }        = useI18n();
const toast         = useToast();
const confirm        = useConfirm();
const salesStore     = useSalesStore();

/** @type {import('vue').Ref<string>} Text in the customer-name search input. */
const searchQuery = ref('');

/** @type {import('vue').Ref<number|null>} Id of the plan currently being paid, for its button's spinner. */
const registeringPlanId = ref(null);

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
  return customer ? customer.fullName : t('pos.unknown-customer');
}

/**
 * Resolves the sale's grandTotal (with IGV) for a plan, or null if the sale
 * isn't loaded yet.
 * @param {import('../../domain/model/payment-plan.entity.js').PaymentPlan} plan
 * @returns {number|null}
 */
function saleTotalForPlan(plan) {
  const sale = salesStore.getSaleById(plan.saleId);
  return sale ? sale.grandTotal : null;
}

/**
 * Per-installment amount for a plan, derived client-side from the sale's
 * total split evenly across totalInstallments — purely informational, the
 * backend tracks installment counts only, not individual amounts.
 * @param {import('../../domain/model/payment-plan.entity.js').PaymentPlan} plan
 * @returns {string}
 */
function installmentAmountLabel(plan) {
  const total = saleTotalForPlan(plan);
  if (total == null) return '—';
  return formatCurrency(total / plan.totalInstallments);
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

onMounted(() => {
  if (!salesStore.paymentPlansLoaded) salesStore.fetchPendingPaymentPlans();
  if (!salesStore.salesLoaded)        salesStore.fetchSales();
  if (!salesStore.customersLoaded)    salesStore.fetchCustomers();
});
</script>

<template>
  <div class="flex flex-column h-full overflow-hidden">

    <!-- Header bar: search -->
    <div class="px-4 py-3" style="border-bottom: 1px solid #E2E8F0;">
      <div style="position: relative;">
        <i
            class="pi pi-search"
            style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.85rem;"
        />
        <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('payment-plans.search-placeholder')"
            class="w-full border-round-lg"
            style="padding: 8px 12px 8px 36px; border: 1px solid #E2E8F0; font-size: 0.85rem; background-color: #F8FAFC; outline: none;"
            @focus="(e) => e.target.style.borderColor = '#0E7490'"
            @blur="(e) => e.target.style.borderColor = '#E2E8F0'"
        />
      </div>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto">

      <!-- Loading -->
      <div v-if="!salesStore.paymentPlansLoaded" class="flex justify-content-center align-items-center gap-3 py-8">
        <i class="pi pi-spin pi-spinner" style="font-size: 1.5rem; color: #0E7490;"/>
        <span style="font-size: 0.85rem; color: #64748B;">{{ t('payment-plans.loading') }}</span>
      </div>

      <template v-else>
      <!-- Desktop table -->
      <div class="hidden md:block">
        <table class="w-full" style="border-collapse: collapse;">
          <thead>
          <tr style="background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
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
                style="font-size: 0.72rem; font-weight: 600; color: #94A3B8;"
            >
              {{ header }}
            </th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="plan in filteredPlans"
              :key="plan.id"
              style="border-bottom: 1px solid #F1F5F9;"
          >
            <td class="px-4 py-3" style="font-size: 0.82rem; font-weight: 600; color: #1E293B;">
              {{ customerNameForPlan(plan) }}
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: #64748B;">
              #{{ plan.saleId }}
            </td>
            <td class="px-4 py-3">
              <div class="flex align-items-center gap-2">
                <div class="border-round-3xl" style="width: 80px; height: 6px; background-color: #E2E8F0; overflow: hidden;">
                  <div
                      class="h-full border-round-3xl"
                      style="background-color: #0E7490;"
                      :style="{ width: `${(plan.paidInstallments / plan.totalInstallments) * 100}%` }"
                  />
                </div>
                <span style="font-size: 0.78rem; color: #64748B;">{{ plan.paidInstallments }}/{{ plan.totalInstallments }}</span>
              </div>
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: #64748B;">
              {{ installmentAmountLabel(plan) }}
            </td>
            <td class="px-4 py-3">
              <button
                  class="flex align-items-center gap-2 border-round-lg px-3 py-2"
                  style="background-color: #0B3558; color: #fff; font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
                  :disabled="registeringPlanId === plan.id"
                  @click="confirmRegisterPayment(plan)"
              >
                <i :class="registeringPlanId === plan.id ? 'pi pi-spin pi-spinner' : 'pi pi-check'" style="font-size: 0.8rem;" />
                <span>{{ t('payment-plans.btn-register-payment') }}</span>
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="md:hidden p-4" style="display: flex; flex-direction: column; gap: 12px;">
        <div
            v-for="plan in filteredPlans"
            :key="plan.id"
            class="bg-white border-round-xl p-4"
            style="border: 1px solid #E2E8F0;"
        >
          <div class="flex align-items-center justify-content-between mb-2">
            <p class="m-0" style="font-size: 0.88rem; font-weight: 700; color: #1E293B;">
              {{ customerNameForPlan(plan) }}
            </p>
            <span style="font-size: 0.72rem; color: #94A3B8;">#{{ plan.saleId }}</span>
          </div>
          <div class="flex align-items-center gap-2 mb-3">
            <div class="border-round-3xl flex-1" style="height: 6px; background-color: #E2E8F0; overflow: hidden;">
              <div
                  class="h-full border-round-3xl"
                  style="background-color: #0E7490;"
                  :style="{ width: `${(plan.paidInstallments / plan.totalInstallments) * 100}%` }"
              />
            </div>
            <span style="font-size: 0.72rem; color: #64748B;">{{ plan.paidInstallments }}/{{ plan.totalInstallments }}</span>
          </div>
          <div class="flex align-items-center justify-content-between">
            <span style="font-size: 0.75rem; color: #64748B;">{{ installmentAmountLabel(plan) }} {{ t('payment-plans.per-installment') }}</span>
            <button
                class="flex align-items-center gap-2 border-round-lg px-3 py-2"
                style="background-color: #0B3558; color: #fff; font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
                :disabled="registeringPlanId === plan.id"
                @click="confirmRegisterPayment(plan)"
            >
              <i :class="registeringPlanId === plan.id ? 'pi pi-spin pi-spinner' : 'pi pi-check'" style="font-size: 0.8rem;" />
              <span>{{ t('payment-plans.btn-register-payment') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
          v-if="filteredPlans.length === 0"
          class="flex flex-column align-items-center justify-content-center py-12 text-center"
      >
        <i class="pi pi-wallet mb-2" style="font-size: 2.25rem; color: #CBD5E1;" />
        <p class="m-0" style="color: #94A3B8; font-size: 0.88rem;">
          {{ t('payment-plans.no-results') }}
        </p>
      </div>
      </template>
    </div>
  </div>
</template>
