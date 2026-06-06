import template from './copi-qc-product-detail.html.twig';
import './copi-qc-product-detail.scss';

/**
 * Dedicated "Quantity calculator" tab on the product detail page.
 *
 * This is a nicer, focused alternative to configuring the calculator through the
 * generic "Specifications -> Custom fields" card. It reads and writes the very same
 * product custom fields (`quantity_calculator_*`), so the storefront, the Store API
 * and the cart keep working unchanged — this view only improves the editing UX.
 *
 * The product is taken from the `swProductDetail` Pinia store (the same source the
 * core product views use), so saving is handled by the page's existing save action.
 */
const FIELD = {
    enabled: 'quantity_calculator_enabled',
    mode: 'quantity_calculator_mode',
    factor: 'quantity_calculator_factor',
    inputUnit: 'quantity_calculator_input_unit',
    helpText: 'quantity_calculator_help_text',
};

// eslint-disable-next-line sw-deprecation-rules/private-feature-declarations
export default {
    template,

    inject: ['acl'],

    computed: {
        product() {
            return Shopware.Store.get('swProductDetail').product;
        },

        isLoading() {
            return Shopware.Store.get('swProductDetail').isLoading;
        },

        isEditable() {
            return this.acl.can('product.editor');
        },

        modeOptions() {
            return [
                { value: 'area', label: this.$t('copi-quantity-calculator.detail.modeArea') },
                { value: 'length', label: this.$t('copi-quantity-calculator.detail.modeLength') },
                { value: 'consumption', label: this.$t('copi-quantity-calculator.detail.modeConsumption') },
            ];
        },

        enabled: {
            get() {
                return Boolean(this.product?.customFields?.[FIELD.enabled]);
            },
            set(value) {
                this._setField(FIELD.enabled, Boolean(value));
            },
        },

        mode: {
            get() {
                return this.product?.customFields?.[FIELD.mode] ?? 'area';
            },
            set(value) {
                this._setField(FIELD.mode, value);
            },
        },

        factor: {
            get() {
                const value = this.product?.customFields?.[FIELD.factor];
                return value === undefined || value === null ? null : Number(value);
            },
            set(value) {
                this._setField(FIELD.factor, value === null || value === '' ? null : Number(value));
            },
        },

        inputUnit: {
            get() {
                return this.product?.customFields?.[FIELD.inputUnit] ?? '';
            },
            set(value) {
                this._setField(FIELD.inputUnit, value);
            },
        },

        helpText: {
            get() {
                return this.product?.customFields?.[FIELD.helpText] ?? '';
            },
            set(value) {
                this._setField(FIELD.helpText, value);
            },
        },

        /** A non-positive factor makes the calculation meaningless — surface it inline. */
        showFactorWarning() {
            return this.enabled && !(this.factor > 0);
        },
    },

    methods: {
        _setField(key, value) {
            if (!this.product) {
                return;
            }

            // Replace the object so Vue reactivity picks up the change even when it
            // started out null/undefined.
            this.product.customFields = {
                ...(this.product.customFields ?? {}),
                [key]: value,
            };
        },
    },
};
