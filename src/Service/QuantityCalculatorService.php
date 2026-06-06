<?php declare(strict_types=1);

namespace Copi\QuantityCalculator\Service;

use Copi\QuantityCalculator\Struct\QuantityCalculationResult;

/**
 * Pure, side-effect-free quantity calculation. This is the authoritative
 * server-side implementation and mirrors the storefront JS
 * (quantity-calculator.calculation.js) one-to-one.
 *
 * All three modes (area / length / consumption) reduce to:
 *
 *     requiredQuantity = ceil(need / coveragePerSalesUnit)
 *
 * then raised to the minimum, aligned upward to the purchase step and capped at
 * the maximum (to the largest valid step value <= max).
 */
class QuantityCalculatorService
{
    public function calculate(float $need, float $factor, int $min, int $max, int $step): QuantityCalculationResult
    {
        $min = max(1, $min);
        $step = max(1, $step);
        $hasMax = $max > 0;

        if ($factor <= 0.0 || $need <= 0.0) {
            return new QuantityCalculationResult(0, 0.0, false, false, false, false);
        }

        $raw = $need / $factor;
        $quantity = (int) ceil($raw);

        $adjustedToMin = false;
        $adjustedToStep = false;
        $adjustedToMax = false;

        if ($quantity < $min) {
            $quantity = $min;
            $adjustedToMin = true;
        } elseif (($quantity - $min) % $step !== 0) {
            $quantity = $min + (int) ceil(($quantity - $min) / $step) * $step;
            $adjustedToStep = true;
        }

        if ($hasMax && $quantity > $max) {
            $aligned = $min + intdiv($max - $min, $step) * $step;
            $quantity = max($min, $aligned);
            $adjustedToMax = true;
        }

        return new QuantityCalculationResult($quantity, $raw, true, $adjustedToMin, $adjustedToMax, $adjustedToStep);
    }
}
