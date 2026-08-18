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
 * exactly (in cents) — a naive `total / count` can drop or misplace
 * fractions of a cent, so every installment gets the same floored amount
 * except the last, which absorbs whatever's left over.
 * @param {number} total
 * @param {number} count
 * @returns {number[]}
 */
function splitIntoInstallments(total, count) {
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / count);
  const lastCents = totalCents - baseCents * (count - 1);
  return Array.from({ length: count }, (_, index) =>
      (index === count - 1 ? lastCents : baseCents) / 100
  );
}

/**
 * Amount of the plan's next unpaid installment — purely informational, the
 * backend tracks installment counts only, not individual amounts.
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

onMounted(() => {
  if (!salesStore.paymentPlansLoaded) salesStore.fetchPendingPaymentPlans();
  if (!salesStore.salesLoaded)        salesStore.fetchSales();
  if (!salesStore.customersLoaded)    salesStore.fetchCustomers();
});
</script>

<template>
  <div class="flex flex-column h-full overflow-hidden">

    <!-- Header bar: search -->
    <div class="px-4 py-3" style="border-bottom: 1px solid var(--border);">
      <div style="position: relative;">
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
          <tr
              v-for="plan in filteredPlans"
              :key="plan.id"
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
              <button
                  class="flex align-items-center gap-2 border-round-lg px-3 py-2"
                  style="background-color: var(--brand); color: var(--surface); font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
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
  </div>
</template>
