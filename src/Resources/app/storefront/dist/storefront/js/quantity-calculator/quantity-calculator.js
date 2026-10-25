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

    // Speech transcript -> number (mirrors src/.../quantity-calculator.speech.mjs).
    var UNITS = {
        null: 0, zero: 0,
        ein: 1, eins: 1, eine: 1, einen: 1, one: 1,
        zwei: 2, zwo: 2, two: 2,
        drei: 3, three: 3,
        vier: 4, four: 4,
        fuenf: 5, five: 5,
        sechs: 6, six: 6,
        sieben: 7, seven: 7,
        acht: 8, eight: 8,
        neun: 9, nine: 9,
        zehn: 10, ten: 10,
        elf: 11, eleven: 11,
        zwoelf: 12, twelve: 12,
        dreizehn: 13, thirteen: 13,
        vierzehn: 14, fourteen: 14,
        fuenfzehn: 15, fifteen: 15,
        sechzehn: 16, sixteen: 16,
        siebzehn: 17, seventeen: 17,
        achtzehn: 18, eighteen: 18,
        neunzehn: 19, nineteen: 19,
    };

    var TENS = {
        zwanzig: 20, twenty: 20,
        dreissig: 30, thirty: 30,
        vierzig: 40, forty: 40,
        fuenfzig: 50, fifty: 50,
        sechzig: 60, sixty: 60,
        siebzig: 70, seventy: 70,
        achtzig: 80, eighty: 80,
        neunzig: 90, ninety: 90,
    };

    var SCALES = {
        hundert: 100, hundred: 100,
        tausend: 1000, thousand: 1000,
    };

    var HALF = ['halb', 'halbe', 'halben', 'half'];
    var DECIMAL_WORDS = ['komma', 'point', 'dot', 'punkt'];

    /** Lowercase, fold umlauts/ß so "fünf" / "fuenf" and "dreißig" / "dreissig" match. */
    function normalize(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/ä/g, 'ae')
            .replace(/ö/g, 'oe')
            .replace(/ü/g, 'ue')
            .replace(/ß/g, 'ss');
    }

    /**
     * Parse one German compound or English number word (without decimals), e.g.
     * "dreiundzwanzig", "zweihundertfuenfzig", "twenty", "hundred".
     * Returns null if the word is not a number word.
     */
    function parseWord(word) {
        if (word === '') {
            return null;
        }
        if (Object.prototype.hasOwnProperty.call(UNITS, word)) {
            return UNITS[word];
        }
        if (Object.prototype.hasOwnProperty.call(TENS, word)) {
            return TENS[word];
        }

        // German compounds: "<a>tausend<b>", "<a>hundert<b>", "<unit>und<tens>".
        for (var [scaleWord, scale] of [['tausend', 1000], ['hundert', 100]]) {
            var idx = word.indexOf(scaleWord);
            if (idx !== -1) {
                var head = word.slice(0, idx);
                var tail = word.slice(idx + scaleWord.length);
                var multiplier = head === '' ? 1 : parseWord(head);
                var rest = tail === '' ? 0 : parseWord(tail.replace(/^und/, ''));
                if (multiplier === null || rest === null) {
                    return null;
                }
                return multiplier * scale + rest;
            }
        }

        var und = word.indexOf('und');
        if (und > 0) {
            var unit = parseWord(word.slice(0, und));
            var tens = TENS[word.slice(und + 3)];
            if (unit !== null && unit < 10 && tens !== undefined) {
                return tens + unit;
            }
        }

        return null;
    }

    /**
     * Turn a sequence of number tokens into an integer, e.g.
     * ["twenty", "five"] -> 25, ["zwei", "hundert"] -> 200, ["one", "thousand", "two"] -> 1002.
     * Returns null if any token is not a number word.
     */
    function parseIntegerTokens(tokens) {
        if (tokens.length === 0) {
            return null;
        }

        var total = 0;
        var current = 0;
        for (var token of tokens) {
            if (token === 'and' || token === 'und') {
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(SCALES, token)) {
                var scale = SCALES[token];
                current = (current === 0 ? 1 : current) * scale;
                if (scale >= 1000) {
                    total += current;
                    current = 0;
                }
                continue;
            }
            var value = parseWord(token);
            if (value === null) {
                return null;
            }
            current += value;
        }

        return total + current;
    }

    /** Fractional digits spoken one by one: ["fuenf"] -> "5", ["zwei", "fuenf"] -> "25". */
    function parseDecimalTokens(tokens) {
        var digits = '';
        for (var token of tokens) {
            if (/^\d+$/.test(token)) {
                digits += token;
                continue;
            }
            var value = parseWord(token);
            if (value === null) {
                break;
            }
            digits += String(value);
        }
        return digits;
    }

    /**
     * Extract the spoken need from a speech transcript.
     *
     * @param {string} transcript e.g. "30 Quadratmeter", "zwölf komma fünf Meter", "twenty five"
     * @returns {number|null} the parsed positive number, or null if none was found
     */
    function parseSpokenNumber(transcript) {
        var text = normalize(transcript);

        // 1) Digits are the common case: "30", "12,5", "12.5", "1.250,5", "1 250".
        var digitMatch = text.match(/\d[\d\s.,]*/);
        if (digitMatch) {
            var raw = digitMatch[0].replace(/\s+/g, '').replace(/[.,]+$/, '');
            var lastComma = raw.lastIndexOf(',');
            var lastDot = raw.lastIndexOf('.');
            if (lastComma !== -1 && lastDot !== -1) {
                // Both present: the later one is the decimal separator.
                raw = lastComma > lastDot
                    ? raw.replace(/\./g, '').replace(',', '.')
                    : raw.replace(/,/g, '');
            } else if (lastComma !== -1) {
                raw = raw.replace(',', '.');
            } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
                // "1.250" from a German engine is a thousands separator.
                raw = raw.replace(/\./g, '');
            }

            var value = Number(raw);
            // "12 komma 5" -> digits on both sides of a spoken separator.
            var after = text.slice(digitMatch.index + digitMatch[0].length).trim().split(/\s+/);
            if (Number.isInteger(value) && DECIMAL_WORDS.includes(after[0]) && /^\d+$/.test(after[1] || '')) {
                value = Number(value + '.' + after[1]);
            } else if (Number.isInteger(value) && after[0] === 'einhalb') {
                value += 0.5;
            }

            return Number.isFinite(value) && value > 0 ? value : null;
        }

        // 2) Number words: find the first run of number tokens.
        var tokens = text.split(/[^a-z]+/).filter(Boolean);
        var isHalfCompound = (t) => t.endsWith('einhalb')
            && (t === 'einhalb' || parseWord(t.slice(0, -'einhalb'.length)) !== null);
        var isNumberToken = (t) => t === 'und' || t === 'and'
            || Object.prototype.hasOwnProperty.call(SCALES, t) || parseWord(t) !== null;

        var start = tokens.findIndex((t) => t !== 'und' && t !== 'and' && (isNumberToken(t) || isHalfCompound(t)));
        if (start === -1) {
            return null;
        }

        var end = start;
        while (end < tokens.length && isNumberToken(tokens[end])) {
            end += 1;
        }

        // "zweieinhalb" / "einhalb" -> integer part + 0.5.
        var intTokens = tokens.slice(start, end);
        var half = false;
        if (intTokens.length === 0 && isHalfCompound(tokens[start])) {
            intTokens = [tokens[start].slice(0, -'einhalb'.length)];
            half = true;
            end = start + 1;
        } else if (tokens[end] === 'einhalb' || (HALF.includes(tokens[end]) && !['ein', 'eine', 'einen'].includes(intTokens[0]))) {
            half = true;
        } else if (HALF.includes(tokens[end]) && intTokens.length === 1) {
            // "eine halbe" -> 0.5
            return 0.5;
        }

        var integer = intTokens[0] === '' ? 0 : parseIntegerTokens(intTokens);
        if (integer === null) {
            return null;
        }

        var value = integer;
        if (DECIMAL_WORDS.includes(tokens[end])) {
            var digits = parseDecimalTokens(tokens.slice(end + 1));
            if (digits !== '') {
                value = Number(integer + '.' + digits);
            }
        } else if (half) {
            value = integer + 0.5;
        }

        return Number.isFinite(value) && value > 0 ? value : null;
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

            var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!this.options.voiceInput || !this._voiceButton || !SpeechRecognition) {
                return;
            }

            var recognition = new SpeechRecognition();
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
            var result = event.results[0];
            var need = null;
            var transcript = '';

            // Take the first alternative that contains a usable number.
            for (var i = 0; i < result.length && need === null; i++) {
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

            this.$emitter.publish('voiceInput', { transcript: transcript, need: need });
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

            var label = listening ? this.options.txtVoiceStop : this.options.txtVoiceStart;
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
        voiceInput: false,
        voiceLang: '',
        txtVoiceStart: '',
        txtVoiceStop: '',
        txtVoiceListening: '',
        txtVoiceNoNumber: '',
        txtVoiceError: '',
    };

    window.PluginManager.register('QuantityCalculator', QuantityCalculatorPlugin, '[data-quantity-calculator]');
})();
