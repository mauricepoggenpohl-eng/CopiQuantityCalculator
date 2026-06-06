import Plugin from 'src/plugin-system/plugin.class';
import { calculateRequiredQuantity } from './quantity-calculator.calculation.mjs';

/**
 * Quantity calculator storefront plugin.
 *
 * Bound to `[data-quantity-calculator]` (the widget rendered above the buy form's
 * quantity selector). It reads the customer's need, calculates the required order
 * quantity, writes it into the native quantity input, and mirrors the entered need
 * into the hidden payload inputs so it is carried into cart and checkout.
 */
export default class QuantityCalculatorPlugin extends Plugin {
    static options = {
        /** Product id (needed for the server-side calculation). */
        productId: '',
        /** Coverage of the customer input per one sales unit (> 0). */
        factor: 0,
        /** Calculation mode (area | length | consumption) — affects labels only. */
        mode: 'area',
        /** Native purchase constraints (sales units). */
        min: 1,
        max: 0,
        step: 1,
        /** Customer input unit label, e.g. "m²". */
        inputUnit: '',
        /** Sales unit labels for the result text. */
        packUnit: '',
        packUnitPlural: '',
        /** Recalculate live while typing (true) or only on blur/change (false). */
        autoUpdate: true,
        /** Request the authoritative calculation from the server (Store API via the storefront route). */
        useServerCalculation: false,
        /** Storefront route that proxies the Store API calculate route. */
        calculateUrl: '',
        /** Debounce in ms for the live "input" recalculation. */
        debounce: 200,
        /** Translated strings. */
        txtResultLabel: 'Required quantity',
        txtCalculating: '',
        txtAdjustedMin: '',
        txtAdjustedMax: '',
        txtAdjustedStep: '',
    };

    init() {
        this._form = this.el.closest('form');
        this._needInput = this.el.querySelector('.js-qc-need-input');
        this._resultEl = this.el.querySelector('[data-qc-result]');
        this._noticeEl = this.el.querySelector('[data-qc-notice]');
        this._needPayload = this.el.querySelector('.js-qc-need-payload');
        this._unitPayload = this.el.querySelector('.js-qc-unit-payload');
        this._quantityInput = this._form ? this._form.querySelector('input.js-quantity-selector') : null;
        this._timer = null;

        // Nothing to do without an input to read or a quantity field to drive.
        if (!this._needInput || !this._quantityInput) {
            return;
        }

        if (this._unitPayload && !this._unitPayload.value) {
            this._unitPayload.value = this.options.inputUnit;
        }

        this._registerEvents();
    }

    _registerEvents() {
        this._needInput.addEventListener('input', this._onInput.bind(this));
        this._needInput.addEventListener('change', this._recalculate.bind(this));
    }

    _onInput() {
        if (!this.options.autoUpdate) {
            return;
        }

        if (this.options.debounce > 0) {
            window.clearTimeout(this._timer);
            this._timer = window.setTimeout(this._recalculate.bind(this), this.options.debounce);
        } else {
            this._recalculate();
        }
    }

    async _recalculate() {
        // Accept both comma and dot as decimal separators.
        const rawNeed = (this._needInput.value || '').trim().replace(',', '.');

        let result = null;
        if (this._canUseServer()) {
            // The server round trip has latency the in-browser path does not, so show a hint.
            this._renderCalculating();
            result = await this._calculateOnServer(rawNeed);

            // Ignore a stale response if the input changed while the request was in flight.
            if ((this._needInput.value || '').trim().replace(',', '.') !== rawNeed) {
                return;
            }
        }

        // No server result (disabled or request failed) -> calculate in the browser.
        if (!result) {
            result = calculateRequiredQuantity(rawNeed, this.options);
        }

        if (this._isInvalid(result)) {
            this._clear();
            return;
        }

        this._applyQuantity(result.quantity);
        this._renderResult(result.quantity);
        this._renderNotice(result);
        this._updatePayload(rawNeed);

        this.$emitter.publish('calculated', { need: rawNeed, quantity: result.quantity });
    }

    _canUseServer() {
        return this.options.useServerCalculation && !!this.options.calculateUrl && !!this.options.productId;
    }

    _isInvalid(result) {
        return !result || result.quantity === null || result.valid === false || result.quantity <= 0;
    }

    async _calculateOnServer(need) {
        try {
            const response = await fetch(this.options.calculateUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: new URLSearchParams({ productId: this.options.productId, need }).toString(),
            });

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (e) {
            return null;
        }
    }

    _applyQuantity(quantity) {
        if (parseInt(this._quantityInput.value, 10) === quantity) {
            return;
        }

        this._quantityInput.value = quantity;
        // Let the native quantity selector / add-to-cart plugins react.
        this._quantityInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: false }));
    }

    _renderCalculating() {
        if (this._resultEl && this.options.txtCalculating) {
            this._resultEl.textContent = this.options.txtCalculating;
        }
    }

    _renderResult(quantity) {
        if (!this._resultEl) {
            return;
        }

        const unit = quantity > 1 ? (this.options.packUnitPlural || this.options.packUnit) : this.options.packUnit;
        const unitSuffix = unit ? ` ${unit}` : '';

        this._resultEl.textContent = `${this.options.txtResultLabel}: ${quantity}${unitSuffix}`;
    }

    _renderNotice(result) {
        if (!this._noticeEl) {
            return;
        }

        let message = '';
        if (result.adjustedToMax) {
            message = this.options.txtAdjustedMax;
        } else if (result.adjustedToMin) {
            message = this.options.txtAdjustedMin;
        } else if (result.adjustedToStep) {
            message = this.options.txtAdjustedStep;
        }

        this._noticeEl.textContent = message;
    }

    _updatePayload(need) {
        if (this._needPayload) {
            this._needPayload.value = need;
        }
        if (this._unitPayload) {
            this._unitPayload.value = this.options.inputUnit;
        }
    }

    _clear() {
        if (this._resultEl) {
            this._resultEl.textContent = '';
        }
        if (this._noticeEl) {
            this._noticeEl.textContent = '';
        }
        if (this._needPayload) {
            this._needPayload.value = '';
        }
    }
}
