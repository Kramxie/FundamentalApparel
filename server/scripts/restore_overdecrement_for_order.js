const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const orderId = argv.orderId || argv._id || argv.id;

if (!orderId) { console.error('Usage: node restore_overdecrement_for_order.js --orderId <orderId>'); process.exit(2); }

async function main() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(3); }
  await mongoose.connect(process.env.MONGO_URI);
  const Order = require('../models/Order');
  const Inventory = require('../models/Inventory');
  const Product = require('../models/Product');
  const InventoryTransaction = require('../models/InventoryTransaction');

  const order = await Order.findById(orderId).lean();
  if (!order) { console.error('Order not found:', orderId); await mongoose.disconnect(); process.exit(4); }

  console.log('Order found:', order._id.toString(), 'items:', order.orderItems.length);

  for (const it of (order.orderItems || [])) {
    try {
      const qty = Number(it.quantity || 0) || 0;
      if (qty <= 0) continue;
      const productId = it.product || it.productId || null;
      if (!productId) { console.warn('Item has no product id, skipping'); continue; }

      const inv = await Inventory.findOne({ productId: productId });
      if (!inv) { console.warn('No inventory linked for product', productId.toString ? productId.toString() : productId); continue; }

      // Increment inventory quantity by qty (restore)
      inv.quantity = Number(inv.quantity || 0) + qty;
      await inv.save();

      // Update product countInStock to match inv.quantity if linked
      try {
        const prod = await Product.findById(productId);
        if (prod) {
          prod.countInStock = Number(inv.quantity || 0);
          await prod.save();
        }
      } catch (e) { console.warn('Failed to sync product after restore', e && e.message); }

      // Create InventoryTransaction to document the manual restore
      await InventoryTransaction.create({
        inventory: inv._id,
        inventoryName: inv.name,
        orderId: order._id,
        qty: -qty,
        type: 'restore',
        note: `Manual restore: revert potential double-decrement for order ${order._id}`
      });

      console.log(`Restored ${qty} to inventory ${inv.name} (id ${inv._id}). New quantity: ${inv.quantity}`);
    } catch (e) {
      console.error('Error restoring item', e && e.message);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e && e.stack); process.exit(99); });
