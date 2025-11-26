const Order = require('../models/Order');
const CustomOrder = require('../models/CustomOrder');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const User = require('../models/User');
const RefundRequest = require('../models/RefundRequest');

// Helper: build CSV from array of objects (simple, escapes commas)
function toCSV(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('\n') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header = columns.join(',') + '\n';
  const body = rows.map(r => columns.map(c => esc(r[c])).join(',')).join('\n');
  return header + body;
}

// Parse date filters
function parseDateRange(q) {
  let start = q.startDate ? new Date(q.startDate) : null;
  let end = q.endDate ? new Date(q.endDate) : null;
  if (start && !isNaN(start)) start.setHours(0,0,0,0);
  if (end && !isNaN(end)) { end.setHours(23,59,59,999); }
  return { start, end };
}

// @route GET /api/admin/reports/sales
// supports query params or JSON body filters. If ?download=csv returns CSV file
exports.salesReport = async (req, res) => {
  try {
    const q = Object.assign({}, req.query, req.body || {});
    const { start, end } = parseDateRange(q);
    const match = { };
    if (start || end) match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;
    if (q.status) match.status = q.status;

    // If product filter provided, match orderItems.product
    const productId = q.productId;

    // Aggregate overall metrics
    const baseMatch = Object.assign({}, match);
    const ordersMatchPipeline = [ { $match: baseMatch } ];

    // total revenue and orders
    const totals = await Order.aggregate([
      ...ordersMatchPipeline,
      { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' }, totalOrders: { $sum: 1 }, avgOrderValue: { $avg: '$totalPrice' } } }
    ]);

    // sales by day (group)
    const salesByDay = await Order.aggregate([
      ...ordersMatchPipeline,
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$totalPrice' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // top products
    const productMatch = Object.assign({}, baseMatch);
    const prodAgg = [
      { $match: productMatch },
      { $unwind: '$orderItems' }
    ];
    if (productId) {
      prodAgg.push({ $match: { 'orderItems.product': require('mongoose').Types.ObjectId(productId) } });
    }
    prodAgg.push({ $group: { _id: '$orderItems.product', totalSold: { $sum: '$orderItems.quantity' }, revenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } } } });
    prodAgg.push({ $sort: { totalSold: -1 } });
    prodAgg.push({ $limit: 20 });
    prodAgg.push({ $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'productInfo' } });
    prodAgg.push({ $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } });

    const topProducts = await Order.aggregate(prodAgg);

    const result = {
      totalRevenue: totals.length ? totals[0].totalRevenue : 0,
      totalOrders: totals.length ? totals[0].totalOrders : 0,
      avgOrderValue: totals.length ? totals[0].avgOrderValue : 0,
      salesByDay,
      topProducts
    };

    // If download CSV requested
    if (req.query.download === 'csv' || req.query.format === 'csv' || q.download === 'csv') {
      // Flatten orders list to CSV rows (fetch matching orders)
      const orderDocs = await Order.find(baseMatch).populate('user', 'name email').lean().limit(10000);
      const rows = orderDocs.map(o => ({
        orderId: String(o._id),
        date: o.createdAt ? o.createdAt.toISOString() : '',
        customer: o.user ? o.user.name : '',
        email: o.user ? o.user.email : '',
        status: o.status,
        totalPrice: o.totalPrice || 0,
        isPaid: o.isPaid ? 'yes' : 'no'
      }));
      const csv = toCSV(rows, ['orderId','date','customer','email','status','totalPrice','isPaid']);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sales_report_${Date.now()}.csv"`);
      return res.send(csv);
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('salesReport error', err);
    return res.status(500).json({ success: false, msg: 'Server error generating sales report' });
  }
};

// @route GET /api/admin/reports/orders
// Returns order list with filters; supports download=csv
exports.orderListReport = async (req, res) => {
  try {
    const q = req.query;
    const { start, end } = parseDateRange(q);
    const match = {};
    if (start || end) match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;
    if (q.status) match.status = q.status;
    if (q.userId) match.user = require('mongoose').Types.ObjectId(q.userId);

    const orders = await Order.find(match).populate('user', 'name email').lean();

    if (q.download === 'csv') {
      const rows = orders.map(o => ({
        orderId: String(o._id), date: o.createdAt ? o.createdAt.toISOString() : '',
        customer: o.user ? o.user.name : '', email: o.user ? o.user.email : '',
        status: o.status, totalPrice: o.totalPrice || 0, isPaid: o.isPaid ? 'yes' : 'no'
      }));
      const csv = toCSV(rows, ['orderId','date','customer','email','status','totalPrice','isPaid']);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="orders_report_${Date.now()}.csv"`);
      return res.send(csv);
    }

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error('orderListReport', err);
    return res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @route GET /api/admin/reports/inventory
exports.inventoryReport = async (req, res) => {
  try {
    const q = req.query;
    const match = {};
    if (q.lowOnly === 'true' || q.lowOnly === true) {
      match.$or = [ { status: 'low_stock' }, { status: 'out_of_stock' } ];
    }

    const items = await Inventory.find(match).lean();

    if (q.download === 'csv') {
      const rows = items.map(i => ({
        inventoryId: String(i._id), name: i.name, type: i.type, sku: i.sku || '', quantity: i.quantity || 0, status: i.status || ''
      }));
      const csv = toCSV(rows, ['inventoryId','name','type','sku','quantity','status']);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="inventory_report_${Date.now()}.csv"`);
      return res.send(csv);
    }

    return res.json({ success: true, data: items });
  } catch (err) {
    console.error('inventoryReport', err);
    return res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @route GET /api/admin/reports/top-products
exports.topProducts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit||10, 10);
    const agg = [
      { $match: { status: { $ne: 'Cancelled' } } },
      { $unwind: '$orderItems' },
      { $group: { _id: '$orderItems.product', totalSold: { $sum: '$orderItems.quantity' }, revenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } } } },
      { $sort: { totalSold: -1 } },
      { $limit: limit },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'productInfo' } },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } }
    ];
    const top = await Order.aggregate(agg);
    return res.json({ success: true, data: top });
  } catch (err) {
    console.error('topProducts', err);
    return res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @route GET /api/admin/reports/revenue-by-category
// Returns revenue grouped by product category
exports.revenueByCategory = async (req, res) => {
  try {
    const q = req.query;
    const { start, end } = parseDateRange(q);
    const match = { status: { $ne: 'Cancelled' } };
    if (start || end) match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;

    const agg = [
      { $match: match },
      { $unwind: '$orderItems' },
      { $lookup: { from: 'products', localField: 'orderItems.product', foreignField: '_id', as: 'productInfo' } },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$productInfo.category', totalRevenue: { $sum: { $multiply: [ '$orderItems.quantity', '$orderItems.price' ] } }, totalQty: { $sum: '$orderItems.quantity' } } },
      { $sort: { totalRevenue: -1 } }
    ];

    const categories = await Order.aggregate(agg);
    return res.json({ success: true, data: categories });
  } catch (err) {
    console.error('revenueByCategory', err);
    return res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @route GET /api/admin/reports/refunds
// Returns refund requests; supports CSV via ?download=csv
exports.refundsReport = async (req, res) => {
  try {
    const q = req.query;
    const { start, end } = parseDateRange(q);
    const match = {};
    if (start || end) match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;
    if (q.status) match.status = q.status;

    const refunds = await RefundRequest.find(match).populate('user', 'name email').populate('order').lean();

    if (q.download === 'csv') {
      const rows = refunds.map(r => ({
        refundId: String(r._id), createdAt: r.createdAt ? r.createdAt.toISOString() : '',
        orderId: r.order ? String(r.order._id) : '', user: r.user ? r.user.name : '', email: r.user ? r.user.email : '',
        amount: r.amount || '', status: r.status, reason: r.reason || ''
      }));
      const csv = toCSV(rows, ['refundId','createdAt','orderId','user','email','amount','status','reason']);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="refunds_report_${Date.now()}.csv"`);
      return res.send(csv);
    }

    return res.json({ success: true, data: refunds });
  } catch (err) {
    console.error('refundsReport', err);
    return res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @route GET /api/admin/reports/sales-by-cohort
// Cohorts defined by user signup month (YYYY-MM). Returns revenue, orders, customers per cohort
exports.salesByCohort = async (req, res) => {
  try {
    const q = req.query;
    const { start, end } = parseDateRange(q);

    const match = { 'status': { $ne: 'Cancelled' } };
    if (start || end) match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;

    const agg = [
      { $match: match },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      { $addFields: { cohort: { $dateToString: { format: '%Y-%m', date: '$userInfo.createdAt' } } } },
      { $group: { _id: '$cohort', revenue: { $sum: '$totalPrice' }, orders: { $sum: 1 }, customers: { $addToSet: '$user' } } },
      { $project: { cohort: '$_id', revenue: 1, orders: 1, customerCount: { $size: '$customers' } } },
      { $sort: { cohort: 1 } }
    ];

    const cohorts = await Order.aggregate(agg);
    return res.json({ success: true, data: cohorts });
  } catch (err) {
    console.error('salesByCohort', err);
    return res.status(500).json({ success: false, msg: 'Server error' });
  }
};

module.exports = exports;
