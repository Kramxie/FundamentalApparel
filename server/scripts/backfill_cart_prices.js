/*
  Backfill script to populate Cart.items.price for existing carts.
  Usage:
    node server/scripts/backfill_cart_prices.js

  It uses the same MONGO_URI from the project's .env to connect.
*/
require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');

const Cart = require('../models/Cart');
const Product = require('../models/Product');

async function computePriceForItem(product, size) {
    // Default to product.price
    let priceToUse = Number(product.price) || 0;
    try {
        const InventoryModel = require('../models/Inventory');
        const inventoryItem = await InventoryModel.findOne({ productId: product._id }).lean();
        if (inventoryItem) {
            if (size) {
                const sp = inventoryItem.sizesPrice || {};
                const perSizeVal = sp && (sp.get ? sp.get(size) : sp[size]);
                if (perSizeVal != null && !isNaN(Number(perSizeVal))) {
                    priceToUse = Number(perSizeVal);
                }
            }
            if ((!priceToUse || priceToUse === 0) && inventoryItem.sizesPrice) {
                try {
                    const spObj = inventoryItem.sizesPrice.get ? Object.fromEntries(inventoryItem.sizesPrice) : (inventoryItem.sizesPrice || {});
                    const vals = Object.keys(spObj).map(k => Number(spObj[k])).filter(v => !isNaN(v));
                    if (vals.length > 0) priceToUse = Math.min(...vals);
                } catch (e) { /* ignore */ }
            }
        }
    } catch (e) {
        console.warn('[Backfill] Inventory lookup failed for product', product && product._id, e && e.message);
    }
    return priceToUse;
}

async function run() {
    await connectDB();
    console.log('[Backfill] Starting cart price backfill...');
    try {
        const carts = await Cart.find({}).populate('items.product').exec();
        let updatedCount = 0;
        for (const cart of carts) {
            let changed = false;
            for (const item of cart.items) {
                // If price is not set or falsy (0), compute and set
                if (!item.price || Number(item.price) === 0) {
                    const product = item.product;
                    if (!product) {
                        console.warn('[Backfill] Cart item missing product ref, skipping', item._id);
                        continue;
                    }
                    const newPrice = await computePriceForItem(product, item.size || null);
                    if (newPrice && Number(newPrice) > 0) {
                        item.price = Number(newPrice);
                        changed = true;
                        console.log(`[Backfill] Updated cart ${cart._id} item ${item._id} -> price ${item.price}`);
                    } else {
                        // As a fallback, use product.price if available
                        if (product.price && Number(product.price) > 0) {
                            item.price = Number(product.price);
                            changed = true;
                            console.log(`[Backfill] Fallback updated cart ${cart._id} item ${item._id} -> product.price ${item.price}`);
                        } else {
                            // leave as-is (0) if no reliable price available
                            console.warn(`[Backfill] No price found for cart ${cart._id} item ${item._id}; left as ${item.price}`);
                        }
                    }
                }
            }
            if (changed) {
                await cart.save();
                updatedCount++;
            }
        }
        console.log(`[Backfill] Completed. Carts updated: ${updatedCount} / ${carts.length}`);
    } catch (err) {
        console.error('[Backfill] Error', err && err.stack ? err.stack : err);
    } finally {
        mongoose.disconnect().then(() => process.exit(0));
    }
}

run();
