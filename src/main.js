import { createApp } from 'vue';
import './style.css';
import App from './app.vue';
import i18n from './i18n.js';
import 'primeflex/primeflex.css';
import 'primeicons/primeicons.css';
import KipuPreset from './styles/theme.js';
import PrimeVue from 'primevue/config';
import {
    Button,
    Card,
    Checkbox,
    Column,
    ConfirmationService,
    ConfirmDialog,
    DataTable,
    Dialog,
    DialogService,
    Drawer,
    FileUpload,
    FloatLabel,
    IconField,
    InputIcon,
    InputNumber,
    InputText,
    Menu,
    MultiSelect,
    Rating,
    Row,
    Select,
    SelectButton,
    Tag,
    Textarea,
    Toast,
    ToastService,
    Toolbar,
    Tooltip
} from 'primevue';
import router from './router.js';
import pinia from './pinia.js';
import useThemeStore from './shared/application/theme.store.js';

// noinspection JSCheckFunctionSignatures
createApp(App)
    .use(i18n)
    // darkModeSelector matches the `data-theme` attribute the theme store
    // stamps on <html>, so PrimeVue's own dark tokens follow the same manual
    // toggle instead of running their own prefers-color-scheme check.
    .use(PrimeVue, { theme: { preset: KipuPreset, options: { darkModeSelector: '[data-theme="dark"]' } }, ripple: true })
    .use(ConfirmationService)
    .use(DialogService)
    .use(ToastService)
    .component('pv-button', Button)
    .component('pv-card', Card)
    .component('pv-checkbox', Checkbox)
    .component('pv-column', Column)
    .component('pv-confirm-dialog', ConfirmDialog)
    .component('pv-data-table', DataTable)
    .component('pv-dialog', Dialog)
    .component('pv-drawer', Drawer)
    .component('pv-file-upload', FileUpload)
    .component('pv-float-label', FloatLabel)
    .component('pv-icon-field', IconField)
    .component('pv-input-icon', InputIcon)
    .component('pv-input-number', InputNumber)
    .component('pv-input-text', InputText)
    .component('pv-menu', Menu)
    .component('pv-multiselect', MultiSelect)
    .component('pv-rating', Rating)
    .component('pv-row', Row)
    .component('pv-select', Select)
    .component('pv-select-button', SelectButton)
    .component('pv-tag', Tag)
    .component('pv-textarea', Textarea)
    .component('pv-toast', Toast)
    .component('pv-toolbar', Toolbar)
    .directive('tooltip', Tooltip)
    .use(pinia)
    .use(router)
    .mount('#app');

useThemeStore(pinia).initialize();
