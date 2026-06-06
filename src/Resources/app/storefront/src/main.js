import QuantityCalculatorPlugin from './plugin/quantity-calculator/quantity-calculator.plugin';

/*
 * Register the quantity calculator with the storefront plugin manager.
 * This file is the webpack entry point picked up by `bin/build-storefront.sh`.
 */
const PluginManager = window.PluginManager;

PluginManager.register(
    'QuantityCalculator',
    QuantityCalculatorPlugin,
    '[data-quantity-calculator]'
);
