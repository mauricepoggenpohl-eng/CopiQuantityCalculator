/**
 * Pure, framework-free parser that turns a speech transcript into a number.
 *
 * Kept free of any Shopware/DOM dependency so it can be unit tested with plain
 * Node (`node --test`), like `quantity-calculator.calculation.mjs`.
 *
 * Speech recognition engines usually return digits ("30 Quadratmeter",
 * "12,5 m"), but short or spelled-out values often come back as words
 * ("dreißig", "zwölf komma fünf", "twenty five point five"). Both are handled
 * for German and English.
 *
 * The same logic is inlined in the pre-built no-build artifact
 * `dist/storefront/js/quantity-calculator/quantity-calculator.js` — keep the two
 * in sync when changing the parser.
 */

const UNITS = {
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

const TENS = {
    zwanzig: 20, twenty: 20,
    dreissig: 30, thirty: 30,
    vierzig: 40, forty: 40,
    fuenfzig: 50, fifty: 50,
    sechzig: 60, sixty: 60,
    siebzig: 70, seventy: 70,
    achtzig: 80, eighty: 80,
    neunzig: 90, ninety: 90,
};

const SCALES = {
    hundert: 100, hundred: 100,
    tausend: 1000, thousand: 1000,
};

const HALF = ['halb', 'halbe', 'halben', 'half'];
const DECIMAL_WORDS = ['komma', 'point', 'dot', 'punkt'];

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
    for (const [scaleWord, scale] of [['tausend', 1000], ['hundert', 100]]) {
        const idx = word.indexOf(scaleWord);
        if (idx !== -1) {
            const head = word.slice(0, idx);
            const tail = word.slice(idx + scaleWord.length);
            const multiplier = head === '' ? 1 : parseWord(head);
            const rest = tail === '' ? 0 : parseWord(tail.replace(/^und/, ''));
            if (multiplier === null || rest === null) {
                return null;
            }
            return multiplier * scale + rest;
        }
    }

    const und = word.indexOf('und');
    if (und > 0) {
        const unit = parseWord(word.slice(0, und));
        const tens = TENS[word.slice(und + 3)];
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

    let total = 0;
    let current = 0;
    for (const token of tokens) {
        if (token === 'and' || token === 'und') {
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(SCALES, token)) {
            const scale = SCALES[token];
            current = (current === 0 ? 1 : current) * scale;
            if (scale >= 1000) {
                total += current;
                current = 0;
            }
            continue;
        }
        const value = parseWord(token);
        if (value === null) {
            return null;
        }
        current += value;
    }

    return total + current;
}

/** Fractional digits spoken one by one: ["fuenf"] -> "5", ["zwei", "fuenf"] -> "25". */
function parseDecimalTokens(tokens) {
    let digits = '';
    for (const token of tokens) {
        if (/^\d+$/.test(token)) {
            digits += token;
            continue;
        }
        const value = parseWord(token);
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
export function parseSpokenNumber(transcript) {
    const text = normalize(transcript);

    // 1) Digits are the common case: "30", "12,5", "12.5", "1.250,5", "1 250".
    const digitMatch = text.match(/\d[\d\s.,]*/);
    if (digitMatch) {
        let raw = digitMatch[0].replace(/\s+/g, '').replace(/[.,]+$/, '');
        const lastComma = raw.lastIndexOf(',');
        const lastDot = raw.lastIndexOf('.');
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

        let value = Number(raw);
        // "12 komma 5" -> digits on both sides of a spoken separator.
        const after = text.slice(digitMatch.index + digitMatch[0].length).trim().split(/\s+/);
        if (Number.isInteger(value) && DECIMAL_WORDS.includes(after[0]) && /^\d+$/.test(after[1] || '')) {
            value = Number(`${value}.${after[1]}`);
        } else if (Number.isInteger(value) && after[0] === 'einhalb') {
            value += 0.5;
        }

        return Number.isFinite(value) && value > 0 ? value : null;
    }

    // 2) Number words: find the first run of number tokens.
    const tokens = text.split(/[^a-z]+/).filter(Boolean);
    const isHalfCompound = (t) => t.endsWith('einhalb')
        && (t === 'einhalb' || parseWord(t.slice(0, -'einhalb'.length)) !== null);
    const isNumberToken = (t) => t === 'und' || t === 'and'
        || Object.prototype.hasOwnProperty.call(SCALES, t) || parseWord(t) !== null;

    const start = tokens.findIndex((t) => t !== 'und' && t !== 'and' && (isNumberToken(t) || isHalfCompound(t)));
    if (start === -1) {
        return null;
    }

    let end = start;
    while (end < tokens.length && isNumberToken(tokens[end])) {
        end += 1;
    }

    // "zweieinhalb" / "einhalb" -> integer part + 0.5.
    let intTokens = tokens.slice(start, end);
    let half = false;
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

    let integer = intTokens[0] === '' ? 0 : parseIntegerTokens(intTokens);
    if (integer === null) {
        return null;
    }

    let value = integer;
    if (DECIMAL_WORDS.includes(tokens[end])) {
        const digits = parseDecimalTokens(tokens.slice(end + 1));
        if (digits !== '') {
            value = Number(`${integer}.${digits}`);
        }
    } else if (half) {
        value = integer + 0.5;
    }

    return Number.isFinite(value) && value > 0 ? value : null;
}
