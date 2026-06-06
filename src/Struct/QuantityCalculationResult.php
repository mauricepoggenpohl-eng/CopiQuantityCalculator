<?php declare(strict_types=1);

namespace Copi\QuantityCalculator\Struct;

use Shopware\Core\Framework\Struct\Struct;

/**
 * Result of a quantity calculation. Serialized directly to JSON by the Store API
 * and the storefront route (it is the payload of {@see \Copi\QuantityCalculator\SalesChannel\CalculateQuantityRouteResponse}).
 */
class QuantityCalculationResult extends Struct
{
    protected int $quantity;

    protected float $raw;

    protected bool $valid;

    protected bool $adjustedToMin;

    protected bool $adjustedToMax;

    protected bool $adjustedToStep;

    protected string $unit = '';

    protected string $mode = '';

    public function __construct(
        int $quantity,
        float $raw,
        bool $valid,
        bool $adjustedToMin,
        bool $adjustedToMax,
        bool $adjustedToStep
    ) {
        $this->quantity = $quantity;
        $this->raw = $raw;
        $this->valid = $valid;
        $this->adjustedToMin = $adjustedToMin;
        $this->adjustedToMax = $adjustedToMax;
        $this->adjustedToStep = $adjustedToStep;
    }

    public function getQuantity(): int
    {
        return $this->quantity;
    }

    public function getRaw(): float
    {
        return $this->raw;
    }

    public function isValid(): bool
    {
        return $this->valid;
    }

    public function isAdjustedToMin(): bool
    {
        return $this->adjustedToMin;
    }

    public function isAdjustedToMax(): bool
    {
        return $this->adjustedToMax;
    }

    public function isAdjustedToStep(): bool
    {
        return $this->adjustedToStep;
    }

    public function getUnit(): string
    {
        return $this->unit;
    }

    public function setUnit(string $unit): void
    {
        $this->unit = $unit;
    }

    public function getMode(): string
    {
        return $this->mode;
    }

    public function setMode(string $mode): void
    {
        $this->mode = $mode;
    }

    public function getApiAlias(): string
    {
        return 'quantity_calculator_result';
    }
}
