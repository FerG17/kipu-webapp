<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter }             from 'vue-router';
import { useI18n }                         from 'vue-i18n';
import { useConfirm }                      from 'primevue';
import useAlertsStore                      from '../../application/alerts.store.js';
import useIamStore                         from '../../../iam/application/iam.store.js';
import { AlertType, AlertStatus, AlertSeverity } from '../../domain/model/alert.entity.js';

const { t }       = useI18n();
const route       = useRoute();
const router      = useRouter();
const confirm     = useConfirm();
const alertsStore = useAlertsStore();
const iamStore    = useIamStore();

const { fetchAlerts, resolveAlert } = alertsStore;

/**
 * The alert entity currently displayed in this detail view.
 * Null until the store has loaded.
 * @type {import('vue').Ref<import('../../domain/model/alert.entity.js').Alert|null>}
 */
const currentAlert = ref(null);

/**
 * Attempts to resolve the alert from the store by route param ID.
 * If not found, redirects back to the alerts list.
 */
function loadAlertFromStore() {
  const found = alertsStore.getAlertById(route.params.id);
  if (!found) {
    router.push({ name: 'alerts' });
    return;
  }
  currentAlert.value = found;
}

/**
 * On mount: if alerts are already loaded, resolve immediately.
 * Otherwise trigger a fetch and let the watcher handle the resolution.
 */
onMounted(() => {
  if (alertsStore.alertsLoaded) {
    loadAlertFromStore();
    return;
  }
  const businessId = iamStore.currentUser?.businessId ?? null;
  fetchAlerts(businessId);
});

/**
 * Watches alertsLoaded to resolve the alert once data is available.
 * This avoids the fragile setTimeout approach.
 */
watch(
    () => alertsStore.alertsLoaded,
    (loaded) => {
      if (loaded) loadAlertFromStore();
    }
);

/**
 * Returns the PrimeVue Tag severity prop for the current alert severity.
 * Business rule: HIGH → danger, MEDIUM → warn, LOW → info.
 * @type {import('vue').ComputedRef<string>}
 */
const badgeSeverity = computed(() => {
  if (!currentAlert.value) return 'info';
  if (currentAlert.value.severity === AlertSeverity.HIGH)   return 'danger';
  if (currentAlert.value.severity === AlertSeverity.MEDIUM) return 'warn';
  return 'info';
});

/**
 * Returns the PrimeIcon class for the current alert type.
 * @type {import('vue').ComputedRef<string>}
 */
const alertIcon = computed(() => {
  if (!currentAlert.value) return 'pi pi-bell';
  return currentAlert.value.type === AlertType.EXPIRATION
      ? 'pi pi-calendar'
      : 'pi pi-exclamation-triangle';
});

/**
 * Returns the background color for the icon container based on alert type.
 * @type {import('vue').ComputedRef<string>}
 */
const iconBackground = computed(() => {
  if (!currentAlert.value) return '#F3F4F6';
  return currentAlert.value.type === AlertType.EXPIRATION ? '#FEE2E2' : '#FFEDD5';
});

/**
 * Returns the icon color based on alert type.
 * @type {import('vue').ComputedRef<string>}
 */
const iconColor = computed(() => {
  if (!currentAlert.value) return '#6B7280';
  return currentAlert.value.type === AlertType.EXPIRATION ? '#EF4444' : '#F97316';
});

/**
 * Returns the i18n key for the current alert status.
 * @type {import('vue').ComputedRef<string>}
 */
const statusLabelKey = computed(() => {
  if (!currentAlert.value) return 'alerts.status-active';
  if (currentAlert.value.status === AlertStatus.RESOLVED) return 'alerts.status-resolved';
  if (currentAlert.value.status === AlertStatus.SENT)     return 'alerts.status-sent';
  return 'alerts.status-active';
});

/**
 * Returns the PrimeVue Tag severity for the status badge.
 * @type {import('vue').ComputedRef<string>}
 */
const statusSeverity = computed(() => {
  if (!currentAlert.value) return 'info';
  if (currentAlert.value.status === AlertStatus.RESOLVED) return 'success';
  if (currentAlert.value.status === AlertStatus.SENT)     return 'warn';
  return 'danger';
});

/**
 * Formats an ISO date string with full date and time for display.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('es-PE', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Prompts the user to confirm resolution of the current alert.
 * Business rule: only ACTIVE or SENT alerts may be resolved.
 */
function confirmResolve() {
  if (!currentAlert.value || currentAlert.value.status === AlertStatus.RESOLVED) return;
  confirm.require({
    message: t('alerts.confirm-resolve', { message: currentAlert.value.message }),
    header:  t('alerts.resolve-header'),
    icon:    'pi pi-check-circle',
    accept:  () => {
      resolveAlert(currentAlert.value);
      currentAlert.value = { ...currentAlert.value, status: AlertStatus.RESOLVED };
    }
  });
}

/**
 * Navigates back to the alerts list view.
 */
function navigateBack() {
  router.push({ name: 'alerts' });
}

/**
 * Navigates to the product detail view linked to this alert.
 * Only called when currentAlert.productId is defined.
 */
function navigateToProduct() {
  if (currentAlert.value?.productId) {
    router.push({ name: 'product-detail', params: { id: currentAlert.value.productId } });
  }
}
</script>

<template>
  <div class="p-3 md:p-5">

    <!-- Back button -->
    <pv-button
        icon="pi pi-arrow-left"
        :label="t('alerts.back')"
        text
        class="mb-4"
        @click="navigateBack"
    />

    <!-- Loading state -->
    <div v-if="!currentAlert" class="flex justify-content-center align-items-center py-6">
      <i class="pi pi-spin pi-spinner text-4xl text-primary"></i>
      <span class="ml-3 text-color-secondary">{{ t('alerts.loading') }}</span>
    </div>

    <div v-else>
      <!-- Alert detail card -->
      <pv-card class="mb-4">
        <template #content>
          <div class="flex flex-column gap-4">

            <!-- Header row -->
            <div class="flex flex-column md:flex-row md:align-items-center gap-3">
              <div
                  class="border-round p-4 flex-shrink-0 align-self-start"
                  :style="{ backgroundColor: iconBackground }"
              >
                <i :class="alertIcon" class="text-3xl" :style="{ color: iconColor }"></i>
              </div>
              <div class="flex-1">
                <div class="flex flex-wrap gap-2 mb-2">
                  <pv-tag :severity="badgeSeverity" :value="t('alerts.severity-' + currentAlert.severity.toLowerCase())" />
                  <pv-tag :severity="statusSeverity" :value="t(statusLabelKey)" />
                </div>
                <p class="text-lg font-medium m-0">{{ currentAlert.message }}</p>
              </div>
            </div>

            <!-- Detail fields grid -->
            <div class="grid">
              <div class="col-12 md:col-6">
                <div class="flex flex-column gap-1">
                  <span class="text-color-secondary text-sm font-medium">{{ t('alerts.field-type') }}</span>
                  <span class="font-medium">
                                        {{ currentAlert.type === 'LOW_STOCK' ? t('alerts.type-low-stock') : t('alerts.type-expiration') }}
                                    </span>
                </div>
              </div>
              <div class="col-12 md:col-6">
                <div class="flex flex-column gap-1">
                  <span class="text-color-secondary text-sm font-medium">{{ t('alerts.field-date') }}</span>
                  <span class="font-medium">{{ formatDate(currentAlert.date) }}</span>
                </div>
              </div>
              <div class="col-12 md:col-6 mt-3">
                <div class="flex flex-column gap-1">
                  <span class="text-color-secondary text-sm font-medium">{{ t('alerts.field-severity') }}</span>
                  <pv-tag :severity="badgeSeverity" :value="t('alerts.severity-' + currentAlert.severity.toLowerCase())" />
                </div>
              </div>
              <div class="col-12 md:col-6 mt-3">
                <div class="flex flex-column gap-1">
                  <span class="text-color-secondary text-sm font-medium">{{ t('alerts.field-status') }}</span>
                  <pv-tag :severity="statusSeverity" :value="t(statusLabelKey)" />
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex flex-column md:flex-row gap-2">
              <pv-button
                  v-if="currentAlert.status !== 'RESOLVED'"
                  icon="pi pi-check"
                  :label="t('alerts.btn-resolve')"
                  severity="success"
                  @click="confirmResolve"
              />
              <pv-button
                  v-if="currentAlert.productId"
                  icon="pi pi-box"
                  :label="t('alerts.btn-view-product')"
                  outlined
                  @click="navigateToProduct"
              />
            </div>
          </div>
        </template>
      </pv-card>
    </div>
  </div>
</template>

<style scoped>
</style>
