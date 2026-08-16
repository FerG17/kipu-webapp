<script setup>
import { onMounted } from 'vue';
import { useI18n }   from 'vue-i18n';
import { useToast }  from 'primevue/usetoast';
import useIamStore   from '../../../iam/application/iam.store.js';

/**
 * SaleSuccessModal component for the Sales & POS Management bounded context.
 *
 * Displays a confirmation modal after a sale has been registered successfully.
 * Shows the sale ID, total, payment method, and the list of items sold.
 * Provides a "Nueva venta" button to start the next transaction.
 *
 * @component SaleSuccessModal
 */

const props = defineProps({
  /**
   * The completed Sale entity just registered.
   * @type {import('../../domain/model/sale.entity.js').Sale}
   */
  sale: {
    type:     Object,
    required: true
  },
  /**
   * Enriched items with product names for display.
   * @type {Array<{productName: string, quantity: number, unitPrice: number, lineTotal: number}>}
   */
  saleItems: {
    type:     Array,
    required: true
  }
});

const emit = defineEmits([
  /** Emitted when the user clicks "Nueva venta" to start a fresh POS session. */
  'new-sale'
]);

const { t }    = useI18n();
const toast    = useToast();
const iamStore = useIamStore();

// The receipt header needs the business's own name/RUC/address — settings.vue
// is the only other place that loads it today, and this modal can be the
// very first screen a session ever hits (a cashier's first sale of the day),
// so it can't assume it's already in the store.
onMounted(() => {
  if (!iamStore.businessLoaded && iamStore.currentUser?.businessId) {
    iamStore.fetchBusiness(iamStore.currentUser.businessId);
  }
});

/**
 * Formats a number as a Peruvian sol currency string.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${Number(amount).toFixed(2)}`;
}

/**
 * Returns the translated payment method label for display.
 * @param {string} method - PaymentMethod enum value.
 * @returns {string}
 */
function formatPaymentMethod(method) {
  if (!method) return '—';
  const key = `pos.payment-${method.toLowerCase()}`;
  return t(key);
}

/**
 * Formats the sale's ISO timestamp for display, falling back to "now" when
 * the backend didn't send one (defensive — Sale.date defaults to '').
 * @returns {string}
 */
function formatReceiptDate() {
  const parsed = props.sale.date ? new Date(props.sale.date) : new Date();
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

/** Opens the browser's print dialog; `@media print` below shows only the plain-text receipt block. */
function printReceipt() {
  window.print();
}

/**
 * Shares a plain-text summary of the sale via the Web Share API when
 * available (mobile/POS tablets); falls back to copying it to the clipboard
 * with a confirmation toast on desktop browsers that don't support sharing.
 *
 * Bug fixed here: this used to reference the bare `sale`/`props` fields as if
 * they were script-setup locals (works in the template, which auto-exposes
 * props, but not inside a plain function body) — every call threw a
 * ReferenceError before it could even reach the share/clipboard logic, which
 * is why the button silently did nothing.
 */
async function shareReceipt() {
  const summaryText = t('pos.success-share-text', {
    id:     props.sale.id ? `#${props.sale.id}` : '—',
    total:  formatCurrency(props.sale.totalAmount || 0),
    method: formatPaymentMethod(props.sale.paymentMethod)
  });

  if (navigator.share) {
    try {
      await navigator.share({ text: summaryText });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return; // user dismissed the native share sheet
      // Anything else (unsupported, permission denied, etc.) falls through to the clipboard below.
    }
  }

  try {
    await navigator.clipboard.writeText(summaryText);
    toast.add({ severity: 'success', summary: t('pos.success-share'), detail: t('pos.success-share-copied'), life: 3000 });
  } catch {
    toast.add({ severity: 'error', summary: t('pos.success-share'), detail: t('pos.success-share-failed'), life: 3500 });
  }
}
</script>

<template>
  <!-- Backdrop -->
  <div
      class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center receipt-backdrop"
      style="background-color: rgba(0,0,0,0.5);"
  >
    <!-- Modal panel -->
    <div
        class="w-full border-round-top-2xl sm:border-round-2xl p-6 shadow-8 text-center"
        style="max-width: 360px; background-color: var(--surface);"
    >
      <!-- Success icon -->
      <div
          class="flex align-items-center justify-content-center border-round-3xl mx-auto mb-3"
          style="width: 56px; height: 56px; background-color: var(--status-ok-bg);"
      >
        <i class="pi pi-check-circle" style="font-size: 1.75rem; color: var(--status-ok-fg);" />
      </div>

      <!-- Title -->
      <h2 class="m-0 mb-1" style="font-size: 1.15rem; font-weight: 700; color: var(--brand);">
        {{ t('pos.success-title') }}
      </h2>
      <p class="m-0" style="color: var(--text-muted); font-size: 0.82rem;">
        {{ sale.id ? `#${sale.id}` : '' }}
        · {{ formatCurrency(sale.totalAmount || 0) }}
        · {{ formatPaymentMethod(sale.paymentMethod) }}
      </p>

      <!-- Items breakdown -->
      <div
          class="my-4 border-round-xl p-3 text-left"
          style="background-color: var(--surface-alt); border: 1px solid var(--border);"
      >
        <div
            v-for="(item, index) in saleItems"
            :key="index"
            class="flex justify-content-between"
            :style="index > 0 ? 'margin-top: 4px;' : ''"
        >
                    <span style="font-size: 0.8rem; color: var(--text);">
                        {{ item.productName }} ×{{ item.quantity }}
                    </span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
                        {{ formatCurrency(item.lineTotal) }}
                    </span>
        </div>
        <div
            class="flex justify-content-between mt-2 pt-2"
            style="border-top: 1px solid var(--border);"
        >
                    <span style="font-size: 0.85rem; font-weight: 700; color: var(--brand);">
                        {{ t('pos.grand-total') }}
                    </span>
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--brand);">
                        {{ formatCurrency(sale.totalAmount || 0) }}
                    </span>
        </div>
      </div>

      <!-- Print / share actions -->
      <div class="flex gap-2 mb-3 receipt-actions">
        <button
            class="flex-1 flex align-items-center justify-content-center gap-2 border-round-xl"
            style="border: 1px solid var(--border); color: var(--text-muted); font-size: 0.82rem; font-weight: 600; background: var(--surface); padding: 9px; cursor: pointer;"
            @click="printReceipt"
        >
          <i class="pi pi-print" style="font-size: 0.85rem;" />
          {{ t('pos.success-print') }}
        </button>
        <button
            class="flex-1 flex align-items-center justify-content-center gap-2 border-round-xl"
            style="border: 1px solid var(--border); color: var(--text-muted); font-size: 0.82rem; font-weight: 600; background: var(--surface); padding: 9px; cursor: pointer;"
            @click="shareReceipt"
        >
          <i class="pi pi-share-alt" style="font-size: 0.85rem;" />
          {{ t('pos.success-share') }}
        </button>
      </div>

      <!-- New sale button -->
      <button
          class="w-full border-round-xl receipt-actions"
          style="background-color: var(--brand); color: var(--surface); font-size: 0.9rem; font-weight: 600; padding: 10px; border: none; cursor: pointer;"
          @click="emit('new-sale')"
      >
        {{ t('pos.success-new-sale') }}
      </button>

    </div>
  </div>

  <!-- Print-only receipt, teleported out to <body> (a sibling of #app, not a
       descendant) so @media print can hide the ENTIRE app with one rule
       (#app { display:none }) and print only this — no reliance on
       visibility tricks across the modal's own fixed/clipped ancestors,
       which is what was causing the whole colored screen to print across
       multiple pages before. Plain black-on-white, market-ticket layout —
       deliberately NOT labeled "Boleta" (that's a specific SUNAT electronic
       tax document requiring an authorized series/correlativo and digital
       submission, none of which this app implements), so it carries an
       explicit disclaimer instead of implying compliance. -->
  <Teleport to="body">
    <div class="print-receipt">
      <p class="print-receipt-business">{{ iamStore.currentBusiness ? iamStore.currentBusiness.name : 'Kipu' }}</p>
      <p v-if="iamStore.currentBusiness?.ruc" class="print-receipt-line">RUC: {{ iamStore.currentBusiness.ruc }}</p>
      <p v-if="iamStore.currentBusiness?.address" class="print-receipt-line">{{ iamStore.currentBusiness.address }}</p>
      <p class="print-receipt-divider">------------------------------</p>
      <p class="print-receipt-title">{{ t('pos.receipt-title') }}</p>
      <p class="print-receipt-line">{{ t('pos.receipt-number') }}: {{ sale.id ? String(sale.id).padStart(6, '0') : '—' }}</p>
      <p class="print-receipt-line">{{ t('pos.receipt-date') }}: {{ formatReceiptDate() }}</p>
      <p class="print-receipt-divider">------------------------------</p>
      <table class="print-receipt-table">
        <thead>
        <tr>
          <th>{{ t('pos.receipt-col-qty') }}</th>
          <th>{{ t('pos.receipt-col-product') }}</th>
          <th>{{ t('pos.receipt-col-price') }}</th>
          <th>{{ t('pos.receipt-col-subtotal') }}</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(item, index) in saleItems" :key="index">
          <td>{{ item.quantity }}</td>
          <td>{{ item.productName }}</td>
          <td>{{ Number(item.unitPrice).toFixed(2) }}</td>
          <td>{{ Number(item.lineTotal).toFixed(2) }}</td>
        </tr>
        </tbody>
      </table>
      <p class="print-receipt-divider">------------------------------</p>
      <p class="print-receipt-total">TOTAL: {{ formatCurrency(sale.totalAmount || 0) }}</p>
      <p class="print-receipt-line">{{ t('pos.receipt-payment-method') }}: {{ formatPaymentMethod(sale.paymentMethod) }}</p>
      <p class="print-receipt-divider">------------------------------</p>
      <p class="print-receipt-line print-receipt-thanks">{{ t('pos.receipt-thanks') }}</p>
      <p class="print-receipt-disclaimer">{{ t('pos.receipt-disclaimer') }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.print-receipt { display: none; }
</style>

<style>
/* Global (unscoped) on purpose: the teleported receipt lives outside this
   component's own DOM subtree once mounted (a direct child of <body>), so
   Vue's scoped data-v-xxxx attribute — which still gets applied to it,
   scoped styles work off the element itself, not its DOM position — would
   work here too, but keeping this block global avoids any doubt and makes
   the print behavior easy to find in one place.
   No @page size is set on purpose: paper size (A4, A6/"boleta" size, an
   80mm thermal roll, ...) depends on what printer the shop actually has,
   and is the browser print dialog's job, not this stylesheet's. Only the
   page *margin* is zeroed, which — as a side effect — also stops Chrome/Edge
   from drawing their own default header/footer (page title + date at the
   top, URL + page number at the bottom): they need margin space to render
   into and skip it when there isn't any. If a browser still shows them,
   they're a print-dialog setting ("More settings" -> uncheck "Headers and
   footers"), not something a page's CSS can control. */
@media print {
  #app { display: none !important; }

  .print-receipt {
    display: block !important;
    background: #fff;
    color: #000;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    text-align: left;
    padding: 8mm;
    margin: 0;
  }
  .print-receipt-business { margin: 0 0 2px; font-size: 14px; font-weight: 700; text-align: center; }
  .print-receipt-title { margin: 6px 0; font-size: 13px; font-weight: 700; text-align: center; }
  .print-receipt-line { margin: 2px 0; }
  .print-receipt-divider { margin: 4px 0; white-space: pre; }
  .print-receipt-total { margin: 4px 0; font-size: 13px; font-weight: 700; }
  .print-receipt-thanks { text-align: center; margin-top: 6px; }
  .print-receipt-disclaimer { margin-top: 6px; font-size: 9px; text-align: center; }
  .print-receipt-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .print-receipt-table th { text-align: left; border-bottom: 1px solid #000; padding: 2px 3px; }
  .print-receipt-table td { padding: 2px 3px; vertical-align: top; }
  .print-receipt-table th:first-child, .print-receipt-table td:first-child { text-align: center; }
  .print-receipt-table th:nth-child(3), .print-receipt-table td:nth-child(3),
  .print-receipt-table th:nth-child(4), .print-receipt-table td:nth-child(4) { text-align: right; }

  @page { margin: 0; }
}
</style>