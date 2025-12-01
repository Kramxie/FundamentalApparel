const Order = require('../models/Order');
const CustomOrder = require('../models/CustomOrder');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const User = require('../models/User');
const RefundRequest = require('../models/RefundRequest');
const PDFDocument = (() => {
  try { return require('pdfkit'); } catch (e) { return null; }
})();
const stream = require('stream');

// Clean helper: build CSV from array of objects with consistent columns
function jsonToCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
    if (s.includes(',') || s.includes('\n') || s.includes('\r')) return '"' + s + '"';
    return s;
  };
  const header = columns.join(',') + '\n';
  const body = rows.map(r => columns.map(c => esc(r[c])).join(',')).join('\n');
  return header + body;
}

// New: getSalesReport returns rows suitable for CSV/PDF export
// Fields per requirement: order_id, order_date, customer_name, product_name, quantity,
// unit_price, vat, discount, delivery_fee, payment_method, payment_status, order_status,
// downpayment_amount, balance_amount, total_revenue
async function getSalesReport(startDate, endDate, options={}){
  // options: includeCustom (boolean)
  const match = { status: { $ne: 'Cancelled' } };
  if (startDate) { match.createdAt = Object.assign({}, match.createdAt || {}, { $gte: startDate }); }
  if (endDate) { match.createdAt = Object.assign({}, match.createdAt || {}, { $lte: endDate }); }

  // Fetch Orders with user and product info
  const orders = await Order.find(match).populate('user', 'name').lean();

  const rows = [];
  for (const o of orders) {
    const orderId = String(o._id);
    const orderDate = o.createdAt ? o.createdAt.toISOString() : '';
    const customerName = o.user ? (o.user.name || '') : '';
    const deliveryFee = Number(o.deliveryFee || 0);
    const vat = Number(o.vat || 0);
    const discount = Number(o.discount || 0) || 0; // if discount stored on order
    const paymentMethod = o.paymentMethod || '';
    const paymentStatus = o.paymentStatus || '';
    const orderStatus = o.status || '';
    const orderTotal = Number(o.totalPrice || 0);

    // For each orderItem, create a row. Distribute VAT & discount proportionally by item price
    const items = o.orderItems || [];
    const subtotal = items.reduce((s,it)=> s + ((it.price||0) * (it.quantity||0)), 0);
    for (const it of items) {
      const productName = it.name || '';
      const quantity = Number(it.quantity || 0);
      const unitPrice = Number(it.price || 0);
      const lineTotal = unitPrice * quantity;
      const vatShare = subtotal ? (vat * (lineTotal / subtotal)) : 0;
      const discountShare = subtotal ? (discount * (lineTotal / subtotal)) : 0;
      const downpayment_amount = Number(o.downPaymentAmount || 0) || 0;
      const balance_amount = Math.max(0, (orderTotal - downpayment_amount));

      rows.push({
        order_id: orderId,
        order_date: orderDate,
        customer_name: customerName,
        product_name: productName,
        quantity,
        unit_price: unitPrice.toFixed(2),
        vat: vatShare.toFixed(2),
        discount: discountShare.toFixed(2),
        delivery_fee: deliveryFee.toFixed(2),
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        order_status: orderStatus,
        downpayment_amount: downpayment_amount.toFixed(2),
        balance_amount: balance_amount.toFixed(2),
        total_revenue: (lineTotal - discountShare + vatShare + deliveryFee * (lineTotal / subtotal || 0)).toFixed(2)
      });
    }
  }

  // Optionally include CustomOrder entries (service-type orders) if requested
  if (options.includeCustom) {
    const cMatch = Object.assign({}, match);
    const customOrders = await CustomOrder.find(cMatch).lean();
    for (const c of customOrders) {
      const orderId = String(c._id);
      const orderDate = c.createdAt ? c.createdAt.toISOString() : '';
      const customerName = c.userName || '';
      const productName = c.productName || '';
      const quantity = Number(c.quantity || 0);
      const unitPrice = Number(c.price || c.unitPrice || 0);
      const vatShare = Number(c.vat || 0);
      const discount = Number(c.discount || 0) || 0;
      const deliveryFee = Number(c.deliveryFee || 0) || 0;
      const paymentMethod = c.paymentMethod || '';
      const paymentStatus = c.paymentStatus || '';
      const orderStatus = c.status || '';
      const downpayment_amount = Number(c.downPaymentPaid ? (c.paymentAmount || 0) : 0);
      const balance_amount = Math.max(0, (Number(c.totalPrice || 0) - downpayment_amount));

      rows.push({
        order_id: orderId,
        order_date: orderDate,
        customer_name: customerName,
        product_name: productName,
        quantity,
        unit_price: unitPrice.toFixed(2),
        vat: vatShare.toFixed(2),
        discount: discount.toFixed(2),
        delivery_fee: deliveryFee.toFixed(2),
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        order_status: orderStatus,
        downpayment_amount: downpayment_amount.toFixed(2),
        balance_amount: balance_amount.toFixed(2),
        total_revenue: (Number(c.totalPrice || 0)).toFixed(2)
      });
    }
  }

  return rows;
}

// Export handlers
exports.exportSalesCsv = async (req, res) => {
  try {
    const q = req.query;
    const start = q.startDate ? new Date(q.startDate) : null;
    const end = q.endDate ? new Date(q.endDate) : null;
    if (start) start.setHours(0,0,0,0);
    if (end) end.setHours(23,59,59,999);
    const includeCustom = q.includeCustom === 'true' || q.includeCustom === true;

    const rows = await getSalesReport(start, end, { includeCustom });
    const columns = ['order_id','order_date','customer_name','product_name','quantity','unit_price','vat','discount','delivery_fee','payment_method','payment_status','order_status','downpayment_amount','balance_amount','total_revenue'];
    const csv = jsonToCsv(rows, columns);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sales_export_${Date.now()}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('exportSalesCsv error', err);
    return res.status(500).json({ success: false, msg: 'Failed to generate CSV' });
  }
};

exports.exportSalesPdf = async (req, res) => {
  try {
    // Use the new reusable generateSalesReport util for consistent, data-driven PDFs
    const { generateSalesReport } = require('../utils/generateSalesReport');
    const Setting = require('../models/Setting');

    const q = req.query;
    const startDate = q.startDate || null;
    const endDate = q.endDate || null;
    const filterType = (q.type || 'product').toString();
    const includeCustom = q.includeCustom === 'true' || q.includeCustom === true;

    // Fetch store branding info if available
    let businessInfo = { name: 'Fundamental Apparel', address: '[Insert Address Here]' };
    try {
      const s = await Setting.findOne().lean();
      if (s && s.store) {
        businessInfo.name = s.store.name || businessInfo.name;
        businessInfo.address = s.store.address || businessInfo.address;
        // include logo and currency if set in settings
        if (s.store.logoUrl) businessInfo.logoUrl = s.store.logoUrl;
        if (s.store.currency) businessInfo.currency = s.store.currency;
      }
    } catch (e) { /* ignore */ }

    const report = await generateSalesReport({ startDate, endDate, reportType: 'sales_summary', filterType, includeCustom, businessInfo });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sales_export_${Date.now()}.pdf"`);
    return res.send(report.pdfBuffer);
  } catch (err) {
    console.error('exportSalesPdf error', err);
    return res.status(500).json({ success: false, msg: 'Failed to generate PDF' });
  }
};

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

    // --- CustomOrder aggregates (include custom orders such as pre-design, printing-only, etc.) ---
    const customMatch = Object.assign({}, match);
    // exclude cancelled custom orders
    customMatch.status = { $ne: 'Cancelled' };

    // totals for custom orders
    const customTotals = await CustomOrder.aggregate([
      { $match: customMatch },
      { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' }, totalOrders: { $sum: 1 }, avgOrderValue: { $avg: '$totalPrice' } } }
    ]);

    // sales by day for custom orders
    const salesByDayCustom = await CustomOrder.aggregate([
      { $match: customMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$totalPrice' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // top products from custom orders (by productName)
    const topCustomProducts = await CustomOrder.aggregate([
      { $match: customMatch },
      { $group: { _id: '$productName', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$totalPrice' } } },
      { $sort: { totalSold: -1 } },
      { $limit: 20 }
    ]);

    // top pre-designs (explicit serviceType == 'predesign-product')
    const topPreDesigns = await CustomOrder.aggregate([
      { $match: Object.assign({}, customMatch, { serviceType: 'predesign-product' }) },
      { $group: { _id: '$productName', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$totalPrice' } } },
      { $sort: { totalSold: -1 } },
      { $limit: 20 }
    ]);

    // top fabrics/garments from custom orders (by fabricType / garmentType)
    const topFabricsCustom = await CustomOrder.aggregate([
      { $match: customMatch },
      { $group: { _id: '$fabricType', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$totalPrice' } } },
      { $sort: { totalSold: -1 } },
      { $limit: 20 }
    ]);

    // Determine requested report type (per-type filter from frontend)
    const reportType = (q.type || 'all').toString().toLowerCase();

    // merge totals with custom orders (used for 'all')
    const ordersTotalRevenue = totals.length ? totals[0].totalRevenue : 0;
    const ordersTotalCount = totals.length ? totals[0].totalOrders : 0;
    const customTotalRevenue = customTotals.length ? customTotals[0].totalRevenue : 0;
    const customTotalCount = customTotals.length ? customTotals[0].totalOrders : 0;

    // merge salesByDay arrays (sum totals and counts by date)
    const byDateMap = {};
    (salesByDay || []).forEach(d => { byDateMap[d._id] = { total: (byDateMap[d._id]?.total||0) + (d.total||0), count: (byDateMap[d._id]?.count||0) + (d.count||0) }; });
    (salesByDayCustom || []).forEach(d => { byDateMap[d._id] = { total: (byDateMap[d._id]?.total||0) + (d.total||0), count: (byDateMap[d._id]?.count||0) + (d.count||0) }; });
    const mergedSalesByDay = Object.keys(byDateMap).sort().map(k => ({ _id: k, total: byDateMap[k].total, count: byDateMap[k].count }));

    // merge topProducts (orders) with custom top products (by name)
    const productMap = {};
    (topProducts || []).forEach(p => {
      const key = (p.productInfo && p.productInfo.name) ? p.productInfo.name : String(p._id);
      productMap[key] = { name: key, totalSold: (productMap[key]?.totalSold||0) + (p.totalSold||0), revenue: (productMap[key]?.revenue||0) + (p.revenue||0) };
    });
    (topCustomProducts || []).forEach(p => {
      const key = p._id || 'Custom:' + String(p._id);
      productMap[key] = { name: key, totalSold: (productMap[key]?.totalSold||0) + (p.totalSold||0), revenue: (productMap[key]?.revenue||0) + (p.revenue||0) };
    });
    const mergedTopProducts = Object.values(productMap).sort((a,b) => (b.totalSold||0) - (a.totalSold||0)).slice(0,20).map(x=>({ _id: x.name, totalSold: x.totalSold, revenue: x.revenue }));

    let result = {};

    if (reportType === 'product') {
      // product-only: use Order aggregates only
      result = {
        totalRevenue: ordersTotalRevenue,
        totalOrders: ordersTotalCount,
        avgOrderValue: (ordersTotalCount ? (ordersTotalRevenue / ordersTotalCount) : 0),
        salesByDay,
        topProducts
      };
    } else if (reportType === 'predesign') {
      // pre-design apparel only: use CustomOrder pre-design aggregates
      const customRev = customTotals.length ? customTotals[0].totalRevenue : 0;
      const customCount = customTotals.length ? customTotals[0].totalOrders : 0;
      result = {
        totalRevenue: customRev,
        totalOrders: customCount,
        avgOrderValue: (customCount ? (customRev / customCount) : 0),
        salesByDay: salesByDayCustom,
        // use topPreDesigns as topProducts for UI compatibility
        topProducts: (topPreDesigns || []).map(x => ({ _id: x._id, totalSold: x.totalSold, revenue: x.revenue })),
        topPreDesigns: topPreDesigns,
        topFabrics: []
      };
    } else if (reportType === 'fabric') {
      // fabric & garment only: use CustomOrder fabricType aggregates
      const customRev = customTotals.length ? customTotals[0].totalRevenue : 0;
      const customCount = customTotals.length ? customTotals[0].totalOrders : 0;
      result = {
        totalRevenue: customRev,
        totalOrders: customCount,
        avgOrderValue: (customCount ? (customRev / customCount) : 0),
        salesByDay: salesByDayCustom,
        topProducts: (topFabricsCustom || []).map(x => ({ _id: x._id, totalSold: x.totalSold, revenue: x.revenue })),
        topPreDesigns: [],
        topFabrics: topFabricsCustom
      };
    } else {
      // default/all: merged Orders + CustomOrders (previous behavior)
      result = {
        totalRevenue: ordersTotalRevenue + customTotalRevenue,
        totalOrders: ordersTotalCount + customTotalCount,
        avgOrderValue: ((ordersTotalRevenue + customTotalRevenue) / Math.max(1, (ordersTotalCount + customTotalCount))) || 0,
        salesByDay: mergedSalesByDay,
        topProducts: mergedTopProducts,
        topPreDesigns: topPreDesigns,
        topFabrics: topFabricsCustom
      };
    }

    // If download CSV requested
    if (req.query.download === 'csv' || req.query.format === 'csv' || q.download === 'csv') {
      if (reportType === 'product') {
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
      } else if (reportType === 'predesign' || reportType === 'fabric') {
        // Export CustomOrder rows
        const customDocs = await CustomOrder.find(Object.assign({}, (reportType === 'predesign' ? { serviceType: 'predesign-product' } : {}), customMatch)).lean().limit(10000);
        const rows = customDocs.map(o => ({
          orderId: String(o._id),
          date: o.createdAt ? o.createdAt.toISOString() : '',
          customer: o.user ? String(o.user) : '',
          productName: o.productName || '',
          serviceType: o.serviceType || '',
          fabricType: o.fabricType || '',
          quantity: o.quantity || 0,
          totalPrice: o.totalPrice || 0,
          status: o.status || ''
        }));
        const csv = toCSV(rows, ['orderId','date','customer','productName','serviceType','fabricType','quantity','totalPrice','status']);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="custom_orders_report_${Date.now()}.csv"`);
        return res.send(csv);
      } else {
        // merged: export combined orders (Orders collection)
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
