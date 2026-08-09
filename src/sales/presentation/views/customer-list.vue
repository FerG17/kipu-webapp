<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n }           from 'vue-i18n';
import { useToast }          from 'primevue/usetoast';
import useSalesStore         from '../../application/sales.store.js';
import useIamStore           from '../../../iam/application/iam.store.js';
import CustomerModal         from '../components/customer-modal.vue';
import CustomerDetailModal   from '../components/customer-detail-modal.vue';
import { Customer }          from '../../domain/model/customer.entity.js';
import { toDateLocale }      from '../../../shared/presentation/date-locale.js';

/**
 * CustomerList view for the Sales & POS Management bounded context.
 *
 * Displays all registered customers for the business in a searchable table
 * (desktop) or card list (mobile). Provides:
 * - CustomerModal for registering new customers inline.
 * - CustomerDetailModal for viewing customer details and purchase history.
 *
 * Business rules:
 * - A customer requires a fullName, documentNumber (DNI/RUC), and phoneNumber.
 * - Email is optional.
 *
 * @view CustomerList
 */

const { t, locale } = useI18n();
const toast      = useToast();
const salesStore = useSalesStore();
const iamStore   = useIamStore();

// ─── UI state ──────────────────────────────────────────────────────────────

/** @type {import('vue').Ref<string>} Text in the search input. */
const searchQuery = ref('');

/** @type {import('vue').Ref<boolean>} Whether the CustomerModal is visible. */
const showRegisterModal = ref(false);

/** @type {import('vue').Ref<boolean>} Whether a customer registration request is in flight. */
const savingCustomer = ref(false);

/** @type {import('vue').Ref<import('../../domain/model/customer.entity.js').Customer|null>} The customer shown in the detail modal. */
const selectedCustomer = ref(null);

// ─── Computed ──────────────────────────────────────────────────────────────

/**
 * Customers filtered by the search query.
 * Matches against fullName, documentNumber, and phoneNumber.
 * @type {import('vue').ComputedRef<import('../../domain/model/customer.entity.js').Customer[]>}
 */
const filteredCustomers = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return salesStore.customers;
  return salesStore.customers.filter(customer =>
      customer.fullName.toLowerCase().includes(query) ||
      (customer.documentNumber || '').includes(query) ||
      (customer.phoneNumber    || '').includes(query)
  );
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Computes two-letter avatar initials from a full name.
 * @param {string} fullName
 * @returns {string}
 */
function getAvatarInitials(fullName) {
  return (fullName || '')
      .split(' ')
      .filter(word => word.length > 0)
      .slice(0, 2)
      .map(word => word[0].toUpperCase())
      .join('');
}

/**
 * Formats an ISO date string as a short locale date.
 * @param {string} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString(toDateLocale(locale.value));
}

// ─── Actions ───────────────────────────────────────────────────────────────

/**
 * Handles the save event from CustomerModal.
 * Creates a new Customer entity and persists it via the store.
 * @param {{ fullName: string, documentNumber: string, phoneNumber: string, email: string }} formData
 */
function handleRegisterCustomer(formData) {
  const businessId = iamStore.currentUser?.businessId;
  const customer   = new Customer({
    businessId:     businessId,
    fullName:       formData.fullName,
    documentNumber: formData.documentNumber,
    phoneNumber:    formData.phoneNumber,
    email:          formData.email,
    registeredAt:   new Date().toISOString()
  });

  savingCustomer.value = true;
  salesStore.addCustomer(customer)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('customers.toast-save-success'), life: 3500 });
        showRegisterModal.value = false;
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('customers.toast-save-error'), life: 4500 });
      })
      .finally(() => {
        savingCustomer.value = false;
      });
}

/**
 * Opens the CustomerDetailModal for the given customer.
 * @param {import('../../domain/model/customer.entity.js').Customer} customer
 */
function openDetail(customer) {
  selectedCustomer.value = customer;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  const businessId = iamStore.currentUser?.businessId;
  if (!salesStore.customersLoaded) salesStore.fetchCustomers(businessId);
  if (!salesStore.salesLoaded)     salesStore.fetchSales(businessId);
});
</script>

<template>
  <div class="flex flex-column h-full overflow-hidden">

    <!-- Header bar: search + register button -->
    <div
        class="flex flex-column sm:flex-row sm:align-items-center gap-2 px-4 py-3"
        style="border-bottom: 1px solid #E2E8F0;"
    >
      <div class="flex-1" style="position: relative;">
        <i
            class="pi pi-search"
            style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.85rem;"
        />
        <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('customers.search-placeholder')"
            class="w-full border-round-lg"
            style="padding: 8px 12px 8px 36px; border: 1px solid #E2E8F0; font-size: 0.85rem; background-color: #F8FAFC; outline: none;"
            @focus="(e) => e.target.style.borderColor = '#0E7490'"
            @blur="(e) => e.target.style.borderColor = '#E2E8F0'"
        />
      </div>
      <button
          class="flex align-items-center gap-2 border-round-lg px-4 py-2 shrink-0"
          style="background-color: #0B3558; color: #fff; font-size: 0.85rem; font-weight: 600; border: none; cursor: pointer;"
          @click="showRegisterModal = true"
      >
        <i class="pi pi-user-plus" style="font-size: 1rem;" />
        <span>{{ t('customers.register-btn') }}</span>
      </button>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto">

      <!-- ── Desktop table ── -->
      <div class="hidden md:block">
        <table class="w-full" style="border-collapse: collapse;">
          <thead>
          <tr style="background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
            <th
                v-for="header in [
                                    t('customers.col-name'),
                                    t('customers.col-document'),
                                    t('customers.col-phone'),
                                    t('customers.col-registered'),
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
              v-for="customer in filteredCustomers"
              :key="customer.id"
              style="border-bottom: 1px solid #F1F5F9;"
              @mouseenter="(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'"
              @mouseleave="(e) => e.currentTarget.style.backgroundColor = 'transparent'"
          >
            <!-- Name + avatar -->
            <td class="px-4 py-3">
              <div class="flex align-items-center gap-3">
                <div
                    class="flex align-items-center justify-content-center border-round-3xl shrink-0"
                    style="width: 32px; height: 32px; background-color: #E0F2FE;"
                >
                                        <span style="font-size: 0.65rem; font-weight: 700; color: #0E7490;">
                                            {{ getAvatarInitials(customer.fullName) }}
                                        </span>
                </div>
                <div>
                  <p class="m-0" style="font-size: 0.82rem; font-weight: 600; color: #1E293B;">
                    {{ customer.fullName }}
                  </p>
                  <p class="m-0" style="font-size: 0.68rem; color: #94A3B8;">
                    {{ t('customers.col-since') }} {{ formatDate(customer.registeredAt) }}
                  </p>
                </div>
              </div>
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: #64748B;">
              {{ customer.documentNumber || '—' }}
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: #64748B;">
              {{ customer.phoneNumber || '—' }}
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: #64748B;">
              {{ formatDate(customer.registeredAt) }}
            </td>
            <td class="px-4 py-3">
              <button
                  class="flex align-items-center gap-1 border-round-lg px-3 py-2"
                  style="background-color: #E0F2FE; color: #0E7490; font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
                  @mouseenter="(e) => e.currentTarget.style.backgroundColor = '#BAE6FD'"
                  @mouseleave="(e) => e.currentTarget.style.backgroundColor = '#E0F2FE'"
                  @click="openDetail(customer)"
              >
                <i class="pi pi-eye" style="font-size: 0.8rem;" />
                <span>{{ t('customers.view-btn') }}</span>
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Mobile cards ── -->
      <div class="md:hidden p-4" style="display: flex; flex-direction: column; gap: 12px;">
        <div
            v-for="customer in filteredCustomers"
            :key="customer.id"
            class="bg-white border-round-xl p-4"
            style="border: 1px solid #E2E8F0;"
        >
          <div class="flex align-items-center gap-3 mb-3">
            <div
                class="flex align-items-center justify-content-center border-round-3xl shrink-0"
                style="width: 40px; height: 40px; background-color: #E0F2FE;"
            >
                            <span style="font-size: 0.75rem; font-weight: 700; color: #0E7490;">
                                {{ getAvatarInitials(customer.fullName) }}
                            </span>
            </div>
            <div class="flex-1">
              <p class="m-0" style="font-size: 0.88rem; font-weight: 700; color: #1E293B;">
                {{ customer.fullName }}
              </p>
              <p class="m-0" style="font-size: 0.72rem; color: #94A3B8;">
                DNI: {{ customer.documentNumber || '—' }}
              </p>
            </div>
            <button
                class="flex align-items-center justify-content-center border-round-lg"
                style="width: 36px; height: 36px; background-color: #E0F2FE; color: #0E7490; border: none; cursor: pointer;"
                @click="openDetail(customer)"
            >
              <i class="pi pi-chevron-right" style="font-size: 1rem;" />
            </button>
          </div>
          <div class="grid">
            <div
                v-for="info in [
                                { label: t('customer-form.phone-number'), value: customer.phoneNumber || '—' },
                                { label: t('customers.col-registered'),   value: formatDate(customer.registeredAt) }
                            ]"
                :key="info.label"
                class="col-6"
            >
              <div class="border-round-lg p-2" style="background-color: #F8FAFC;">
                <p class="m-0" style="font-size: 0.62rem; color: #94A3B8;">{{ info.label }}</p>
                <p class="m-0" style="font-size: 0.78rem; font-weight: 600; color: #1E293B;">{{ info.value }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
          v-if="filteredCustomers.length === 0"
          class="flex flex-column align-items-center justify-content-center py-12 text-center"
      >
        <i class="pi pi-users mb-2" style="font-size: 2.25rem; color: #CBD5E1;" />
        <p class="m-0" style="color: #94A3B8; font-size: 0.88rem;">
          {{ t('customers.no-results') }}
        </p>
      </div>
    </div>

    <!-- Customer register modal -->
    <customer-modal
        v-if="showRegisterModal"
        :saving="savingCustomer"
        @save="handleRegisterCustomer"
        @close="showRegisterModal = false"
    />

    <!-- Customer detail modal -->
    <customer-detail-modal
        v-if="selectedCustomer"
        :customer="selectedCustomer"
        :sales="salesStore.sales"
        @close="selectedCustomer = null"
    />
  </div>
</template>