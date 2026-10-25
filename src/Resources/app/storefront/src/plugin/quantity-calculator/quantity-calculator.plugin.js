import Plugin from 'src/plugin-system/plugin.class';
import { calculateRequiredQuantity } from './quantity-calculator.calculation.mjs';
import { parseSpokenNumber } from './quantity-calculator.speech.mjs';

/**
 * Quantity calculator storefront plugin.
 *
 * Bound to `[data-quantity-calculator]` (the widget rendered above the buy form's
 * quantity selector). It reads the customer's need, calculates the required order
 * quantity, writes it into the native quantity input, and mirrors the entered need
 * into the hidden payload inputs so it is carried into cart and checkout.
 *
 * Optionally the need can be dictated (Web Speech API): a microphone button next
 * to the input is revealed when voice input is enabled and the browser supports
 * speech recognition.
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
        /** Offer voice input via the browser's speech recognition (if supported). */
        voiceInput: false,
        /** BCP 47 language for speech recognition, e.g. "de-DE". */
        voiceLang: '',
        /** Translated strings. */
        txtResultLabel: 'Required quantity',
        txtCalculating: '',
        txtAdjustedMin: '',
        txtAdjustedMax: '',
        txtAdjustedStep: '',
        txtVoiceStart: '',
        txtVoiceStop: '',
        txtVoiceListening: '',
        txtVoiceNoNumber: '',
        txtVoiceError: '',
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
        this._initVoiceInput();
    }

    _registerEvents() {
        this._needInput.addEventListener('input', this._onInput.bind(this));
        this._needInput.addEventListener('change', this._recalculate.bind(this));
    }

    _initVoiceInput() {
        this._voiceButton = this.el.querySelector('[data-qc-voice]');
        this._voiceStatusEl = this.el.querySelector('[data-qc-voice-status]');
        this._recognition = null;
        this._listening = false;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!this.options.voiceInput || !this._voiceButton || !SpeechRecognition) {
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = this.options.voiceLang || document.documentElement.lang || 'de-DE';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 3;

        recognition.addEventListener('result', this._onVoiceResult.bind(this));
        recognition.addEventListener('error', this._onVoiceError.bind(this));
        recognition.addEventListener('end', this._onVoiceEnd.bind(this));

        this._recognition = recognition;
        this._voiceButton.hidden = false;
        this._voiceButton.addEventListener('click', this._toggleVoice.bind(this));
    }

    _toggleVoice() {
        if (this._listening) {
            this._recognition.stop();
            return;
        }

        try {
            this._recognition.start();
        } catch (e) {
            // start() throws if a recognition session is already running.
            return;
        }

        this._setListening(true);
        this._renderVoiceStatus(this.options.txtVoiceListening);
    }

    _onVoiceResult(event) {
        const result = event.results[0];
        let need = null;
        let transcript = '';

        // Take the first alternative that contains a usable number.
        for (let i = 0; i < result.length && need === null; i++) {
            transcript = result[i].transcript;
            need = parseSpokenNumber(transcript);
        }

        if (need === null) {
            this._renderVoiceStatus(this.options.txtVoiceNoNumber.replace('%transcript%', result[0].transcript));
            return;
        }

        this._renderVoiceStatus('');
        this._needInput.value = String(need);
        this._recalculate();

        this.$emitter.publish('voiceInput', { transcript, need });
    }

    _onVoiceError(event) {
        // "no-speech" and "aborted" are normal user outcomes, not errors worth showing.
        if (event.error === 'no-speech' || event.error === 'aborted') {
            this._renderVoiceStatus('');
            return;
        }

        this._renderVoiceStatus(this.options.txtVoiceError);
    }

    _onVoiceEnd() {
        this._setListening(false);
        if (this._voiceStatusEl && this._voiceStatusEl.textContent === this.options.txtVoiceListening) {
            this._renderVoiceStatus('');
        }
    }

    _setListening(listening) {
        this._listening = listening;
        this._voiceButton.classList.toggle('is-listening', listening);
        this._voiceButton.setAttribute('aria-pressed', listening ? 'true' : 'false');

        const label = listening ? this.options.txtVoiceStop : this.options.txtVoiceStart;
        if (label) {
            this._voiceButton.setAttribute('aria-label', label);
            this._voiceButton.setAttribute('title', label);
        }
    }

    _renderVoiceStatus(message) {
        if (this._voiceStatusEl) {
            this._voiceStatusEl.textContent = message;
        }
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
