<script setup>
import { ref, computed } from 'vue';
import { useI18n }       from 'vue-i18n';

/**
 * CustomerModal component for the Sales & POS Management bounded context.
 *
 * Inline modal for registering a new customer, or editing an existing one
 * when opened with a `customer` prop, from the Clientes tab. Validates
 * required fields before emitting the save event.
 *
 * Business rules:
 * - fullName is required (minimum 2 characters).
 * - documentNumber is optional; when provided, must be 8 digits (DNI) or 11 digits (RUC).
 * - phoneNumber is optional; when provided, must be 9 digits.
 * - email is optional.
 *
 * @component CustomerModal
 */

const props = defineProps({
  /** Whether a save request is currently in flight (disables the form). */
  saving: {
    type:    Boolean,
    default: false
  },
  /**
   * The customer being edited. Null/absent means the modal is in
   * registration mode — a fresh, blank form.
   * @type {import('../../domain/model/customer.entity.js').Customer|null}
   */
  customer: {
    type:    Object,
    default: null
  }
});

const emit = defineEmits([
  /**
   * Emitted when the form is valid and the user clicks save.
   * payload: { id, fullName, documentNumber, phoneNumber, email } — id is
   * null in registration mode, the existing customer's id in edit mode.
   */
  'save',
  /** Emitted when the user closes the modal without saving. */
  'close'
]);

const { t } = useI18n();

const isEditMode = computed(() => props.customer != null);

/** @type {import('vue').Ref<string>} */
const fullName = ref(props.customer?.fullName ?? '');
/** @type {import('vue').Ref<string>} */
const documentNumber = ref(props.customer?.documentNumber ?? '');
/** @type {import('vue').Ref<string>} */
const phoneNumber = ref(props.customer?.phoneNumber ?? '');
/** @type {import('vue').Ref<string>} */
const email = ref(props.customer?.email ?? '');

/** @type {import('vue').Ref<Record<string, string>>} Field-level validation error messages. */
const fieldErrors = ref({});

/**
 * Whether the form has all required fields filled.
 * Used to enable/disable the submit button.
 * @type {import('vue').ComputedRef<boolean>}
 */
const isFormValid = computed(() => fullName.value.trim().length >= 2);

/**
 * Validates all form fields and populates fieldErrors.
 * @returns {boolean} True when validation passes.
 */
function validateForm() {
  fieldErrors.value = {};

  if (!fullName.value || fullName.value.trim().length < 2) {
    fieldErrors.value.fullName = t('customer-form.error-name');
  }

  if (documentNumber.value) {
    const cleaned = documentNumber.value.replace(/\D/g, '');
    if (cleaned.length !== 8 && cleaned.length !== 11) {
      fieldErrors.value.documentNumber = t('customer-form.error-document');
    }
  }

  if (phoneNumber.value) {
    const cleaned = phoneNumber.value.replace(/\D/g, '');
    if (cleaned.length !== 9) {
      fieldErrors.value.phoneNumber = t('customer-form.error-phone');
    }
  }

  return Object.keys(fieldErrors.value).length === 0;
}

/**
 * Triggers form validation and emits save if valid.
 */
function handleSave() {
  if (!validateForm()) return;
  emit('save', {
    id:             props.customer?.id ?? null,
    fullName:       fullName.value.trim(),
    documentNumber: documentNumber.value.trim(),
    phoneNumber:    phoneNumber.value.trim(),
    email:          email.value.trim()
  });
}
</script>

<template>
  <!-- Backdrop -->
  <div
      class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center"
      style="background-color: rgba(0,0,0,0.5);"
      @click.self="emit('close')"
  >
    <!-- Modal panel -->
    <div
        class="w-full border-round-top-2xl sm:border-round-2xl shadow-8"
        style="max-width: 420px; background-color: var(--surface); border: 1px solid var(--border);"
    >
      <!-- Header -->
      <div
          class="flex align-items-center justify-content-between px-5 pt-5 pb-3"
          style="border-bottom: 1px solid var(--surface-alt);"
      >
        <h2 class="m-0" style="font-size: 1.05rem; font-weight: 700; color: var(--brand);">
          {{ isEditMode ? t('customers.modal-edit-title') : t('customers.modal-register-title') }}
        </h2>
        <button
            style="background: none; border: none; cursor: pointer; padding: 4px;"
            @click="emit('close')"
        >
          <i class="pi pi-times" style="color: var(--text-faint); font-size: 1.1rem;" />
        </button>
      </div>

      <!-- Form -->
      <div class="px-5 pb-5 pt-4" style="display: flex; flex-direction: column; gap: 12px;">

        <!-- Full name -->
        <div>
          <label
              class="block mb-1"
              style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);"
          >
            {{ t('customer-form.full-name') }} *
          </label>
          <input
              v-model="fullName"
              type="text"
              :placeholder="t('customer-form.full-name-placeholder')"
              class="w-full border-round-lg px-3 py-2"
              style="border: 1px solid var(--border); font-size: 0.88rem; color: var(--text); outline: none;"
              @focus="(e) => e.target.style.borderColor = 'var(--brand)'"
              @blur="(e) => e.target.style.borderColor = fieldErrors.fullName ? 'var(--status-critical-fg)' : 'var(--border)'"
          />
          <small v-if="fieldErrors.fullName" style="color: var(--status-critical-fg); font-size: 0.72rem;">
            {{ fieldErrors.fullName }}
          </small>
        </div>

        <!-- Document number -->
        <div>
          <label
              class="block mb-1"
              style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);"
          >
            {{ t('customer-form.document-number') }}
          </label>
          <input
              v-model="documentNumber"
              type="text"
              :placeholder="t('customer-form.document-placeholder')"
              class="w-full border-round-lg px-3 py-2"
              style="border: 1px solid var(--border); font-size: 0.88rem; color: var(--text); outline: none;"
              @focus="(e) => e.target.style.borderColor = 'var(--brand)'"
              @blur="(e) => e.target.style.borderColor = fieldErrors.documentNumber ? 'var(--status-critical-fg)' : 'var(--border)'"
          />
          <small v-if="fieldErrors.documentNumber" style="color: var(--status-critical-fg); font-size: 0.72rem;">
            {{ fieldErrors.documentNumber }}
          </small>
        </div>

        <!-- Phone number -->
        <div>
          <label
              class="block mb-1"
              style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);"
          >
            {{ t('customer-form.phone-number') }}
          </label>
          <input
              v-model="phoneNumber"
              type="tel"
              :placeholder="t('customer-form.phone-placeholder')"
              class="w-full border-round-lg px-3 py-2"
              style="border: 1px solid var(--border); font-size: 0.88rem; color: var(--text); outline: none;"
              @focus="(e) => e.target.style.borderColor = 'var(--brand)'"
              @blur="(e) => e.target.style.borderColor = fieldErrors.phoneNumber ? 'var(--status-critical-fg)' : 'var(--border)'"
          />
          <small v-if="fieldErrors.phoneNumber" style="color: var(--status-critical-fg); font-size: 0.72rem;">
            {{ fieldErrors.phoneNumber }}
          </small>
        </div>

        <!-- Email (optional) -->
        <div>
          <label
              class="block mb-1"
              style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);"
          >
            {{ t('customer-form.email') }}
          </label>
          <input
              v-model="email"
              type="email"
              :placeholder="t('customer-form.email-placeholder')"
              class="w-full border-round-lg px-3 py-2"
              style="border: 1px solid var(--border); font-size: 0.88rem; color: var(--text); outline: none;"
              @focus="(e) => e.target.style.borderColor = 'var(--brand)'"
              @blur="(e) => e.target.style.borderColor = 'var(--border)'"
          />
        </div>

        <!-- Actions -->
        <div class="flex gap-2 mt-1">
          <button
              class="flex-1 border-round-xl py-3"
              style="border: 1px solid var(--border); color: var(--text-muted); font-size: 0.88rem; font-weight: 600; background: var(--surface); cursor: pointer;"
              :disabled="saving"
              @click="emit('close')"
          >
            {{ t('customer-form.cancel') }}
          </button>
          <button
              class="flex-1 border-round-xl py-3"
              :style="{
                            backgroundColor: (isFormValid && !saving) ? 'var(--brand)' : 'var(--text-faint)',
                            color: 'var(--brand-ink)',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: (isFormValid && !saving) ? 'pointer' : 'not-allowed'
                        }"
              :disabled="!isFormValid || saving"
              @click="handleSave"
          >
            <i v-if="saving" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
            {{ saving ? t('customers.modal-saving') : (isEditMode ? t('customers.modal-save-btn') : t('customers.modal-register-btn')) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>