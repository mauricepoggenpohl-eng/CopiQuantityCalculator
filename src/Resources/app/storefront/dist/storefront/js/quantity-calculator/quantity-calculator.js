/*
 * Pre-built, dependency-free storefront artifact for the Quantity Calculator.
 *
 * This file lets the plugin work WITHOUT running the storefront webpack build:
 * `bin/console theme:compile` concatenates every active plugin's
 * `Resources/app/storefront/dist/storefront/js/<name>/<name>.js` into the theme
 * bundle, where `window.PluginManager` and `window.PluginBaseClass` are available.
 *
 * It mirrors the ES module sources under `../../../../src/`. If you change the
 * calculation or behaviour there, mirror it here (or run `bin/build-storefront.sh`
 * to regenerate this file from source).
 */
(function () {
    'use strict';

    if (typeof window === 'undefined' || !window.PluginManager || !window.PluginBaseClass) {
        return;
    }

    function calculateRequiredQuantity(need, options) {
        var factor = Number(options.factor);
        var value = Number(need);

        var min = Math.max(1, Math.floor(Number(options.min) || 1));
        var step = Math.max(1, Math.floor(Number(options.step) || 1));
        var hasMax = Number(options.max) > 0;
        var max = hasMax ? Math.floor(Number(options.max)) : Number.POSITIVE_INFINITY;

        var invalid = {
            quantity: null,
            raw: 0,
            adjustedToMin: false,
            adjustedToMax: false,
            adjustedToStep: false,
        };

        if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(value) || value <= 0) {
            return invalid;
        }

        var raw = value / factor;
        var quantity = Math.ceil(raw);

        var adjustedToMin = false;
        var adjustedToStep = false;
        var adjustedToMax = false;

        if (quantity < min) {
            quantity = min;
            adjustedToMin = true;
        } else if ((quantity - min) % step !== 0) {
            quantity = min + Math.ceil((quantity - min) / step) * step;
            adjustedToStep = true;
        }

        if (quantity > max) {
            var aligned = min + Math.floor((max - min) / step) * step;
            quantity = Math.max(min, aligned);
            adjustedToMax = true;
        }

        return {
            quantity: quantity,
            raw: raw,
            adjustedToMin: adjustedToMin,
            adjustedToStep: adjustedToStep,
            adjustedToMax: adjustedToMax,
        };
    }

    class QuantityCalculatorPlugin extends window.PluginBaseClass {
        init() {
            this._form = this.el.closest('form');
            this._needInput = this.el.querySelector('.js-qc-need-input');
            this._resultEl = this.el.querySelector('[data-qc-result]');
            this._noticeEl = this.el.querySelector('[data-qc-notice]');
            this._needPayload = this.el.querySelector('.js-qc-need-payload');
            this._unitPayload = this.el.querySelector('.js-qc-unit-payload');
            this._quantityInput = this._form ? this._form.querySelector('input.js-quantity-selector') : null;
            this._timer = null;

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
            var rawNeed = (this._needInput.value || '').trim().replace(',', '.');

            var result = null;
            if (this._canUseServer()) {
                // The server round trip has latency the in-browser path does not, so show a hint.
                this._renderCalculating();
                result = await this._calculateOnServer(rawNeed);

                // Ignore a stale response if the input changed while the request was in flight.
                if ((this._needInput.value || '').trim().replace(',', '.') !== rawNeed) {
                    return;
                }
            }

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
                var response = await fetch(this.options.calculateUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: new URLSearchParams({ productId: this.options.productId, need: need }).toString(),
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

            var unit = quantity > 1 ? (this.options.packUnitPlural || this.options.packUnit) : this.options.packUnit;
            var unitSuffix = unit ? ' ' + unit : '';

            this._resultEl.textContent = this.options.txtResultLabel + ': ' + quantity + unitSuffix;
        }

        _renderNotice(result) {
            if (!this._noticeEl) {
                return;
            }

            var message = '';
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

    QuantityCalculatorPlugin.options = {
        productId: '',
        factor: 0,
        mode: 'area',
        min: 1,
        max: 0,
        step: 1,
        inputUnit: '',
        packUnit: '',
        packUnitPlural: '',
        autoUpdate: true,
        useServerCalculation: false,
        calculateUrl: '',
        debounce: 200,
        txtResultLabel: 'Required quantity',
        txtCalculating: '',
        txtAdjustedMin: '',
        txtAdjustedMax: '',
        txtAdjustedStep: '',
    };

    window.PluginManager.register('QuantityCalculator', QuantityCalculatorPlugin, '[data-quantity-calculator]');
})();
