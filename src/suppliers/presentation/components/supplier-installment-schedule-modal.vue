<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildDefaultSupplierSchedule, isSupplierScheduleValid } from '../../domain/model/supplier-installment-schedule.js';
import { useModalScrollLock } from '../../../shared/presentation/use-modal-scroll-lock.js';

/**
 * SupplierInstallmentScheduleModal — Screen 2 of the credit-purchase flow
 * (X6 #12). Shown after the "Comprar a crédito" toggle + cuota count on the
 * new purchase order form: one editable row per cuota (date + amount),
 * both pre-filled — amounts by a proportional split of the total (remainder
 * on the last one), dates by a 30-day cadence starting from the order's
 * expected delivery date (decision 12.3) — and both remain fully editable.
 * Unlike Sales' #7 (InstallmentScheduleModal), where dates start blank, X6
 * #12 explicitly asks for suggested dates too. The final "Generar orden"
 * click is what actually creates the purchase order + payment plan
 * together, in one user action, even though it's two backend calls under
 * the hood.
 *
 * @component SupplierInstallmentScheduleModal
 */

const props = defineProps({
  /** Grand total the schedule's amounts must add up to exactly. */
  total: {
    type:     Number,
    required: true
  },
  /** Number of cuota rows to show — fixed, decided on Screen 1. */
  totalInstallments: {
    type:     Number,
    required: true
  },
  /** Anchor date for the suggested cadence — the order's expectedDate. */
  startDate: {
    type:     String,
    required: true
  },
  /** Display-only — the supplier this credit purchase is for. */
  supplierName: {
    type:    String,
    default: null
  },
  /** Whether the confirm call is in flight (disables the form, shows a spinner). */
  saving: {
    type:    Boolean,
    default: false
  }
});

const emit = defineEmits([
  /** Emitted with the final schedule ([{ dueDate, amount }]) when confirmed. */
  'confirm',
  /** Emitted when backing out to Screen 1 — nothing has been created yet. */
  'cancel'
]);

const { t } = useI18n();

useModalScrollLock(ref(true));

/** @type {import('vue').Ref<Array<{dueDate: string, amount: number}>>} */
const rows = ref(buildDefaultSupplierSchedule(props.total, props.totalInstallments, props.startDate));

function formatCurrency(amount) {
  return `S/ ${Number(amount || 0).toFixed(2)}`;
}

function sumOf(rows) {
  return rows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
}

function handleConfirm() {
  if (props.saving || !isSupplierScheduleValid(rows.value, props.total)) return;
  emit('confirm', rows.value.map(row => ({ dueDate: row.dueDate, amount: parseFloat(row.amount) })));
}
</script>

<template>
  <div
      class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center"
      style="background-color: rgba(0,0,0,0.5);"
      @click.self="!saving && emit('cancel')"
  >
    <div
        class="w-full border-round-top-2xl sm:border-round-2xl p-5 shadow-8 overflow-y-auto"
        style="max-width: 440px; max-height: 92vh; background-color: var(--surface); border: 1px solid var(--border);"
    >
      <!-- Header -->
      <div class="flex align-items-center justify-content-between mb-1">
        <h2 class="m-0" style="font-size: 1.1rem; font-weight: 700; color: var(--brand);">
          {{ t('suppliers.schedule-modal-title') }}
        </h2>
        <button
            style="background: none; border: none; cursor: pointer; padding: 4px;"
            :disabled="saving"
            @click="emit('cancel')"
        >
          <i class="pi pi-times" style="color: var(--text-faint); font-size: 1.1rem;" />
        </button>
      </div>
      <p class="m-0 mb-4" style="font-size: 0.8rem; color: var(--text-muted);">
        {{ t('suppliers.schedule-modal-subtitle', { supplier: supplierName || '', count: totalInstallments }) }}
      </p>

      <!-- Rows: date + amount per cuota -->
      <div style="display: flex; flex-direction: column; gap: 10px;" class="mb-3">
        <div
            v-for="(row, index) in rows"
            :key="index"
            class="border-round-xl p-3"
            style="border: 1px solid var(--border);"
        >
          <p class="m-0 mb-2" style="font-size: 0.72rem; font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em;">
            {{ t('suppliers.schedule-modal-installment-label', { number: index + 1 }) }}
          </p>
          <div class="flex gap-2">
            <div class="flex-1">
              <label class="block mb-1" style="font-size: 0.72rem; color: var(--text-muted);">
                {{ t('suppliers.schedule-modal-date-label') }}
              </label>
              <input
                  v-model="row.dueDate"
                  type="date"
                  class="w-full border-round-lg px-2"
                  style="border: 1px solid var(--border); font-size: 0.85rem; color: var(--text); padding: 8px; outline: none;"
              />
            </div>
            <div style="width: 130px;">
              <label class="block mb-1" style="font-size: 0.72rem; color: var(--text-muted);">
                {{ t('suppliers.schedule-modal-amount-label') }}
              </label>
              <input
                  v-model="row.amount"
                  type="number"
                  step="0.01"
                  min="0"
                  class="w-full border-round-lg px-2"
                  style="border: 1px solid var(--border); font-size: 0.85rem; font-weight: 700; color: var(--brand); padding: 8px; outline: none;"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Running total vs. order total — no margin allowed -->
      <div
          class="border-round-xl p-3 mb-4 flex align-items-center justify-content-between"
          :style="{ backgroundColor: Math.round(sumOf(rows) * 100) === Math.round(total * 100) ? 'var(--status-ok-bg)' : 'var(--status-critical-bg)' }"
      >
        <span style="font-size: 0.78rem; font-weight: 600;" :style="{ color: Math.round(sumOf(rows) * 100) === Math.round(total * 100) ? 'var(--status-ok-fg)' : 'var(--status-critical-fg)' }">
          {{ t('suppliers.schedule-modal-sum-label', { sum: formatCurrency(sumOf(rows)), total: formatCurrency(total) }) }}
        </span>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-2">
        <button
            class="flex-1 border-round-xl py-3"
            style="border: 1px solid var(--border); color: var(--text-muted); font-size: 0.88rem; font-weight: 600; background: var(--surface); cursor: pointer;"
            :disabled="saving"
            @click="emit('cancel')"
        >
          {{ t('suppliers.schedule-modal-cancel') }}
        </button>
        <button
            class="flex-1 border-round-xl py-3"
            :style="{
                        backgroundColor: (isSupplierScheduleValid(rows, total) && !saving) ? 'var(--brand)' : 'var(--text-faint)',
                        color: 'var(--brand-ink)',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: (isSupplierScheduleValid(rows, total) && !saving) ? 'pointer' : 'not-allowed'
                    }"
            :disabled="!isSupplierScheduleValid(rows, total) || saving"
            @click="handleConfirm"
        >
          <i v-if="saving" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
          {{ saving ? t('suppliers.order-modal-saving') : t('suppliers.schedule-modal-confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>
