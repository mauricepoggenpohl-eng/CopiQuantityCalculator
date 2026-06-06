<?php declare(strict_types=1);

namespace Copi\QuantityCalculator\SalesChannel;

use Copi\QuantityCalculator\Struct\QuantityCalculationResult;
use Shopware\Core\System\SalesChannel\StoreApiResponse;

/**
 * @property QuantityCalculationResult $object
 */
class CalculateQuantityRouteResponse extends StoreApiResponse
{
    public function __construct(QuantityCalculationResult $result)
    {
        parent::__construct($result);
    }

    public function getResult(): QuantityCalculationResult
    {
        return $this->object;
    }
}
