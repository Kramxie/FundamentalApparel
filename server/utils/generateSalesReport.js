const PDFDocument = require('pdfkit');
const stream = require('stream');
const Order = require('../models/Order');
const CustomOrder = require('../models/CustomOrder');
const mongoose = require('mongoose');

function _escapeCsvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function _aggregateProductSales(match) {
  const agg = [
    { $match: match },
    { $unwind: '$orderItems' },
    { $group: { _id: '$orderItems.product', productName: { $first: '$orderItems.name' }, totalQty: { $sum: '$orderItems.quantity' }, revenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $project: { productId: '$_id', productName: { $ifNull: ['$product.name', '$productName'] }, category: '$product.category', totalQty: 1, revenue: 1 } },
    { $sort: { revenue: -1 } }
  ];
  return Order.aggregate(agg);
}

async function generateSalesReport({ startDate=null, endDate=null, reportType='sales_summary', filterType='product', includeCustom=false, businessInfo={ name: 'Fundamental Apparel', address: '[Insert Address Here]' } } = {}){
  // Normalize dates
  const match = { status: { $ne: 'Cancelled' } };
  if (startDate) {
    const s = new Date(startDate);
    s.setHours(0,0,0,0);
    match.createdAt = Object.assign({}, match.createdAt || {}, { $gte: s });
  }
  if (endDate) {
    const e = new Date(endDate);
    e.setHours(23,59,59,999);
    match.createdAt = Object.assign({}, match.createdAt || {}, { $lte: e });
  }

  // Currently support 'sales_summary' grouped by product when filterType === 'product'
  let rows = [];
  if (filterType === 'product'){
    rows = await _aggregateProductSales(match);
  } else if (filterType === 'predesign'){
    // For predesign/custom orders, aggregate from CustomOrder
    const customMatch = Object.assign({}, match);
    // If start/end applied, they already exist on 'createdAt'
    const agg = [
      { $match: Object.assign({}, customMatch, { serviceType: 'predesign-product' }) },
      { $group: { _id: '$productName', productName: { $first: '$productName' }, totalQty: { $sum: '$quantity' }, revenue: { $sum: '$totalPrice' } } },
      { $sort: { revenue: -1 } }
    ];
    const res = await CustomOrder.aggregate(agg);
    rows = res.map(r => ({ productId: r._id, productName: r.productName, category: 'predesign', totalQty: r.totalQty, revenue: r.revenue }));
  } else {
    // default: return order-level rows
    const docs = await Order.find(match).populate('user', 'name').lean().limit(10000);
    rows = docs.map(o => ({ orderId: String(o._id), date: o.createdAt ? o.createdAt.toISOString() : '', customer: o.user ? o.user.name : '', totalPrice: o.totalPrice || 0, isPaid: !!o.isPaid }));
  }

  // Build CSV string depending on filterType
  let csv = '';
  if (filterType === 'product'){
    const cols = ['Product ID','Product Name','Category','Quantity Sold','Total Revenue'];
    const lines = [cols.join(',')];
    let totalQty = 0;
    let totalRevenue = 0;
    for (const r of rows){
      totalQty += (r.totalQty || 0);
      totalRevenue += (r.revenue || 0);
      const line = [r.productId || '', r.productName || '', r.category || '', r.totalQty || 0, (Number(r.revenue)||0).toFixed(2)].map(_escapeCsvCell).join(',');
      lines.push(line);
    }
    // summary row
    lines.push(['TOTAL','','', String(totalQty), totalRevenue.toFixed(2)].map(_escapeCsvCell).join(','));
    csv = lines.join('\n');
  } else if (filterType === 'predesign'){
    const cols = ['Product Name','Category','Quantity Sold','Total Revenue'];
    const lines = [cols.join(',')];
    let totalQty = 0, totalRevenue = 0;
    for (const r of rows){
      totalQty += (r.totalQty||0); totalRevenue += (r.revenue||0);
      lines.push([r.productName||'', r.category||'', r.totalQty||0, (Number(r.revenue)||0).toFixed(2)].map(_escapeCsvCell).join(','));
    }
    lines.push(['TOTAL','', String(totalQty), totalRevenue.toFixed(2)].map(_escapeCsvCell).join(','));
    csv = lines.join('\n');
  } else {
    // order-level CSV
    const cols = ['Order ID','Date','Customer','Total Price','Paid'];
    const lines = [cols.join(',')];
    for (const r of rows){
      lines.push([r.orderId||'', r.date||'', r.customer||'', (Number(r.totalPrice)||0).toFixed(2), r.isPaid ? 'yes' : 'no'].map(_escapeCsvCell).join(','));
    }
    csv = lines.join('\n');
  }

  // Generate PDF buffer
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const passthrough = new stream.PassThrough();
  doc.pipe(passthrough);

  // Header / Branding
  doc.fontSize(14).text(businessInfo.name || 'Fundamental Apparel', { align: 'left' });
  doc.fontSize(9).text(businessInfo.address || '[Insert Address Here]', { align: 'left' });
  doc.moveDown(0.2);
  doc.fontSize(9).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
  doc.moveDown(0.5);
  doc.fontSize(12).text('Sales Report', { align: 'center' });
  const rangeText = `${startDate ? (new Date(startDate)).toISOString().split('T')[0] : 'All'} to ${endDate ? (new Date(endDate)).toISOString().split('T')[0] : 'All'}`;
  doc.fontSize(9).text(`Date Range: ${rangeText}`, { align: 'center' });
  doc.moveDown(0.5);

  // Table header depending on mode
  if (filterType === 'product' || filterType === 'predesign'){
    const headers = filterType === 'product' ? ['Product Name','Category','Quantity','Revenue'] : ['Product Name','Category','Quantity','Revenue'];
    // print headers
    doc.fontSize(10).fillColor('#000').text(headers.join('    '));
    doc.moveDown(0.2);
    let totalQty = 0; let totalRevenue = 0;
    for (const r of rows){
      totalQty += (r.totalQty||0);
      totalRevenue += (r.revenue||0);
      const line = `${r.productName || (r.productId||'')}    ${r.category||''}    ${r.totalQty||0}    ${ (Number(r.revenue)||0).toFixed(2) }`;
      doc.fontSize(9).fillColor('#111').text(line, { continued: false, ellipsis: true });
      doc.moveDown(0.1);
      if (doc.y > doc.page.height - 80) doc.addPage();
    }
    doc.moveDown(0.5);
    doc.fontSize(10).text('Total Summary', { underline: true });
    doc.fontSize(9).text(`Products: ${rows.length}`);
    doc.fontSize(9).text(`Total Quantity: ${totalQty}`);
    doc.fontSize(9).text(`Total Revenue: ${totalRevenue.toFixed(2)}`);
  } else {
    // Order level
    const headers = ['Order ID','Date','Customer','Total','Paid'];
    doc.fontSize(10).text(headers.join('    '));
    doc.moveDown(0.2);
    for (const r of rows){
      const line = `${r.orderId}    ${(r.date||'').split('T')[0]}    ${r.customer||''}    ${(Number(r.totalPrice)||0).toFixed(2)}    ${r.isPaid? 'yes':'no'}`;
      doc.fontSize(9).text(line);
      doc.moveDown(0.1);
      if (doc.y > doc.page.height - 80) doc.addPage();
    }
  }

  doc.end();

  // collect buffer
  const chunks = [];
  const pdfBuffer = await new Promise((resolve, reject) => {
    passthrough.on('data', c => chunks.push(c));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);
  });

  return {
    csv,
    pdfBuffer,
    meta: {
      generatedAt: new Date(),
      rows: rows.length,
      filterType,
      reportType
    }
  };
}

module.exports = { generateSalesReport };
