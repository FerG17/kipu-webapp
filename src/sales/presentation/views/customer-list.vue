<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n }           from 'vue-i18n';
import { useToast }          from 'primevue/usetoast';
import { useConfirm }        from 'primevue';
import useSalesStore         from '../../application/sales.store.js';
import useIamStore           from '../../../iam/application/iam.store.js';
import CustomerModal         from '../components/customer-modal.vue';
import CustomerDetailModal   from '../components/customer-detail-modal.vue';
import { Customer }          from '../../domain/model/customer.entity.js';
import { toDateLocale }      from '../../../shared/presentation/date-locale.js';
import { canEditCustomers }  from '../../../iam/application/permissions.js';

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
const confirm    = useConfirm();
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

/** @type {import('vue').Ref<import('../../domain/model/customer.entity.js').Customer|null>} The customer being edited, or null when the modal is registering a new one. */
const editingCustomer = ref(null);

/** @type {import('vue').ComputedRef<boolean>} Whether the current user may edit customer records — admin only. */
const canEdit = computed(() => canEditCustomers(iamStore.currentUserPosition));

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
 * Handles the save event from CustomerModal — creates a new Customer when
 * editingCustomer is unset, or updates the existing one when it's an edit.
 * @param {{ id: number|null, fullName: string, documentNumber: string, phoneNumber: string, email: string }} formData
 */
function handleSaveCustomer(formData) {
  savingCustomer.value = true;

  const request = formData.id
      ? salesStore.updateCustomer(new Customer({ ...editingCustomer.value, ...formData }))
      : salesStore.addCustomer(new Customer({
          businessId:     iamStore.currentUser?.businessId,
          fullName:       formData.fullName,
          documentNumber: formData.documentNumber,
          phoneNumber:    formData.phoneNumber,
          email:          formData.email,
          registeredAt:   new Date().toISOString()
        }));

  request
      .then(() => {
        const successKey = formData.id ? 'customers.toast-update-success' : 'customers.toast-save-success';
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t(successKey), life: 3500 });
        closeCustomerModal();
      })
      .catch(error => {
        const errorKey = formData.id ? 'customers.toast-update-error' : 'customers.toast-save-error';
        const detail = error.response?.data?.detail ?? t(errorKey);
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail, life: 4500 });
      })
      .finally(() => {
        savingCustomer.value = false;
      });
}

/**
 * Opens the CustomerModal pre-filled with the given customer for editing.
 * @param {import('../../domain/model/customer.entity.js').Customer} customer
 */
function openEditModal(customer) {
  editingCustomer.value = customer;
  showRegisterModal.value = true;
}

/** Closes the CustomerModal, whether it was registering or editing. */
function closeCustomerModal() {
  showRegisterModal.value = false;
  editingCustomer.value = null;
}

/**
 * Opens the CustomerDetailModal for the given customer.
 * @param {import('../../domain/model/customer.entity.js').Customer} customer
 */
function openDetail(customer) {
  selectedCustomer.value = customer;
}

/**
 * Confirms and runs a customer deletion (soft delete server-side — the
 * customer stops appearing here but existing sales/plans keep pointing at
 * it, see CustomerCommandService.Handle(DeleteCustomerCommand)).
 * @param {import('../../domain/model/customer.entity.js').Customer} customer
 */
function confirmDeleteCustomer(customer) {
  confirm.require({
    message: t('customers.confirm-delete', { name: customer.fullName }),
    header:  t('customers.delete-header'),
    icon:    'pi pi-exclamation-triangle',
    accept:  () => salesStore.deleteCustomer(customer.id)
        .then(() => toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('customers.toast-delete-success', { name: customer.fullName }), life: 3500 }))
        .catch(error => {
          const detail = error.response?.data?.detail ?? t('customers.toast-delete-error');
          toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail, life: 4500 });
        })
  });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  if (!salesStore.customersLoaded) salesStore.fetchCustomers();
  if (!salesStore.salesLoaded)     salesStore.fetchSales();
});
</script>

<template>
  <div class="flex flex-column h-full overflow-hidden">

    <!-- Header bar: search + register button -->
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
            :placeholder="t('customers.search-placeholder')"
            class="w-full border-round-lg"
            style="padding: 8px 12px 8px 36px; border: 1px solid var(--border); font-size: 0.85rem; background-color: var(--surface-alt); outline: none;"
            @focus="(e) => e.target.style.borderColor = 'var(--brand)'"
            @blur="(e) => e.target.style.borderColor = 'var(--border)'"
        />
      </div>
      <button
          class="flex align-items-center gap-2 border-round-lg px-4 py-2 shrink-0"
          style="background-color: var(--brand); color: var(--surface); font-size: 0.85rem; font-weight: 600; border: none; cursor: pointer;"
          @click="editingCustomer = null; showRegisterModal = true"
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
          <tr style="background-color: var(--surface-alt); border-bottom: 1px solid var(--border);">
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
                style="font-size: 0.72rem; font-weight: 600; color: var(--text-faint);"
            >
              {{ header }}
            </th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="customer in filteredCustomers"
              :key="customer.id"
              style="border-bottom: 1px solid var(--surface-alt);"
              @mouseenter="(e) => e.currentTarget.style.backgroundColor = 'var(--surface-alt)'"
              @mouseleave="(e) => e.currentTarget.style.backgroundColor = 'transparent'"
          >
            <!-- Name + avatar -->
            <td class="px-4 py-3">
              <div class="flex align-items-center gap-3">
                <div
                    class="flex align-items-center justify-content-center border-round-3xl shrink-0"
                    style="width: 32px; height: 32px; background-color: var(--brand-soft);"
                >
                                        <span style="font-size: 0.65rem; font-weight: 700; color: var(--brand);">
                                            {{ getAvatarInitials(customer.fullName) }}
                                        </span>
                </div>
                <div>
                  <p class="m-0" style="font-size: 0.82rem; font-weight: 600; color: var(--text);">
                    {{ customer.fullName }}
                  </p>
                  <p class="m-0" style="font-size: 0.68rem; color: var(--text-faint);">
                    {{ t('customers.col-since') }} {{ formatDate(customer.registeredAt) }}
                  </p>
                </div>
              </div>
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: var(--text-muted);">
              {{ customer.documentNumber || '—' }}
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: var(--text-muted);">
              {{ customer.phoneNumber || '—' }}
            </td>
            <td class="px-4 py-3" style="font-size: 0.78rem; color: var(--text-muted);">
              {{ formatDate(customer.registeredAt) }}
            </td>
            <td class="px-4 py-3">
              <div class="flex align-items-center gap-2">
                <button
                    class="flex align-items-center gap-1 border-round-lg px-3 py-2"
                    style="background-color: var(--brand-soft); color: var(--brand); font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
                    @click="openDetail(customer)"
                >
                  <i class="pi pi-eye" style="font-size: 0.8rem;" />
                  <span>{{ t('customers.view-btn') }}</span>
                </button>
                <button
                    v-if="canEdit"
                    class="flex align-items-center gap-1 border-round-lg px-3 py-2"
                    style="background-color: var(--surface-alt); color: var(--text-muted); font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
                    @click="openEditModal(customer)"
                >
                  <i class="pi pi-pencil" style="font-size: 0.8rem;" />
                  <span>{{ t('customers.edit-btn') }}</span>
                </button>
                <button
                    v-if="canEdit"
                    class="flex align-items-center justify-content-center border-round-lg"
                    style="width: 30px; height: 30px; background-color: var(--status-critical-bg); color: var(--status-critical-fg); border: none; cursor: pointer;"
                    :title="t('customers.delete-header')"
                    @click="confirmDeleteCustomer(customer)"
                >
                  <i class="pi pi-trash" style="font-size: 0.75rem;" />
                </button>
              </div>
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
            style="border: 1px solid var(--border);"
        >
          <div class="flex align-items-center gap-3 mb-3">
            <div
                class="flex align-items-center justify-content-center border-round-3xl shrink-0"
                style="width: 40px; height: 40px; background-color: var(--brand-soft);"
            >
                            <span style="font-size: 0.75rem; font-weight: 700; color: var(--brand);">
                                {{ getAvatarInitials(customer.fullName) }}
                            </span>
            </div>
            <div class="flex-1">
              <p class="m-0" style="font-size: 0.88rem; font-weight: 700; color: var(--text);">
                {{ customer.fullName }}
              </p>
              <p class="m-0" style="font-size: 0.72rem; color: var(--text-faint);">
                DNI: {{ customer.documentNumber || '—' }}
              </p>
            </div>
            <button
                v-if="canEdit"
                class="flex align-items-center justify-content-center border-round-lg"
                style="width: 36px; height: 36px; background-color: var(--surface-alt); color: var(--text-muted); border: none; cursor: pointer;"
                @click="openEditModal(customer)"
            >
              <i class="pi pi-pencil" style="font-size: 0.9rem;" />
            </button>
            <button
                v-if="canEdit"
                class="flex align-items-center justify-content-center border-round-lg"
                style="width: 36px; height: 36px; background-color: var(--status-critical-bg); color: var(--status-critical-fg); border: none; cursor: pointer;"
                @click="confirmDeleteCustomer(customer)"
            >
              <i class="pi pi-trash" style="font-size: 0.9rem;" />
            </button>
            <button
                class="flex align-items-center justify-content-center border-round-lg"
                style="width: 36px; height: 36px; background-color: var(--brand-soft); color: var(--brand); border: none; cursor: pointer;"
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
              <div class="border-round-lg p-2" style="background-color: var(--surface-alt);">
                <p class="m-0" style="font-size: 0.62rem; color: var(--text-faint);">{{ info.label }}</p>
                <p class="m-0" style="font-size: 0.78rem; font-weight: 600; color: var(--text);">{{ info.value }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Error state (a real fetch failure, not "no customers yet") -->
      <div
          v-if="salesStore.customersError"
          class="flex flex-column align-items-center justify-content-center py-12 text-center"
      >
        <i class="pi pi-lock mb-2" style="font-size: 2.25rem; color: var(--status-critical-fg);" />
        <p class="m-0" style="color: var(--text-faint); font-size: 0.88rem;">
          {{ t('customers.error-loading') }}
        </p>
      </div>

      <!-- Empty state -->
      <div
          v-else-if="filteredCustomers.length === 0"
          class="flex flex-column align-items-center justify-content-center py-12 text-center"
      >
        <i class="pi pi-users mb-2" style="font-size: 2.25rem; color: var(--text-faint);" />
        <p class="m-0" style="color: var(--text-faint); font-size: 0.88rem;">
          {{ t('customers.no-results') }}
        </p>
      </div>
    </div>

    <!-- Customer register/edit modal -->
    <customer-modal
        v-if="showRegisterModal"
        :saving="savingCustomer"
        :customer="editingCustomer"
        @save="handleSaveCustomer"
        @close="closeCustomerModal"
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