/**
 * Pure, framework-free quantity calculation.
 *
 * Kept free of any Shopware/DOM dependency so it can be unit tested with plain
 * Node (`node --test`). It is an `.mjs` module so Node loads it as ESM without the
 * storefront sources needing `"type": "module"` (which would force webpack into
 * fully-specified ESM resolution and break the Shopware build). The Shopware swc
 * rule (`/\.m?(t|j)s$/`) transpiles `.mjs` exactly like `.js`.
 *
 * The same logic is inlined in the pre-built no-build artifact
 * `dist/storefront/js/quantity-calculator/quantity-calculator.js` — keep the two
 * in sync when changing the formula.
 *
 * All three modes (area / length / consumption) reduce to the same formula:
 *
 *     requiredQuantity = ceil(need / coveragePerSalesUnit)
 *
 * then clamped to the product's min/max and aligned upwards to the purchase step.
 *
 * @typedef {Object} CalculationOptions
 * @property {number} factor coverage of the customer input per one sales unit (> 0)
 * @property {number} [min]  minimum purchase (sales units, default 1)
 * @property {number} [max]  maximum purchase (sales units, 0/undefined = no limit)
 * @property {number} [step] purchase step (sales units, default 1)
 *
 * @typedef {Object} CalculationResult
 * @property {number|null} quantity  the required quantity, or null when input is invalid
 * @property {number}      raw        the unrounded quantity (need / factor)
 * @property {boolean}     adjustedToMin
 * @property {boolean}     adjustedToMax
 * @property {boolean}     adjustedToStep
 *
 * @param {number|string} need
 * @param {CalculationOptions} options
 * @returns {CalculationResult}
 */
export function calculateRequiredQuantity(need, options) {
    const factor = Number(options.factor);
    const value = Number(need);

    const min = Math.max(1, Math.floor(Number(options.min) || 1));
    const step = Math.max(1, Math.floor(Number(options.step) || 1));
    const hasMax = Number(options.max) > 0;
    const max = hasMax ? Math.floor(Number(options.max)) : Number.POSITIVE_INFINITY;

    const invalid = {
        quantity: null,
        raw: 0,
        adjustedToMin: false,
        adjustedToMax: false,
        adjustedToStep: false,
    };

    if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(value) || value <= 0) {
        return invalid;
    }

    const raw = value / factor;
    let quantity = Math.ceil(raw);

    let adjustedToMin = false;
    let adjustedToStep = false;
    let adjustedToMax = false;

    if (quantity < min) {
        quantity = min;
        adjustedToMin = true;
    } else if ((quantity - min) % step !== 0) {
        quantity = min + Math.ceil((quantity - min) / step) * step;
        adjustedToStep = true;
    }

    if (quantity > max) {
        const aligned = min + Math.floor((max - min) / step) * step;
        quantity = Math.max(min, aligned);
        adjustedToMax = true;
    }

    return { quantity, raw, adjustedToMin, adjustedToStep, adjustedToMax };
}

export default calculateRequiredQuantity;
