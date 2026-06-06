<?php declare(strict_types=1);

namespace Copi\QuantityCalculator\SalesChannel;

use Shopware\Core\System\SalesChannel\SalesChannelContext;
use Symfony\Component\HttpFoundation\Request;

/**
 * Store API route that calculates the required order quantity for a product
 * from a customer need. Abstract base to allow decoration by other plugins.
 */
abstract class AbstractCalculateQuantityRoute
{
    abstract public function getDecorated(): AbstractCalculateQuantityRoute;

    abstract public function calculate(Request $request, SalesChannelContext $context): CalculateQuantityRouteResponse;
}
