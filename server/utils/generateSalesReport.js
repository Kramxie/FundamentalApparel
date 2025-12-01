const PDFDocument = require('pdfkit');
const stream = require('stream');
const https = require('https');
const http = require('http');
const fs = require('fs');
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
  // Helper: fetch image buffer from URL or file
  async function fetchImageBuffer(src){
    if (!src) return null;
    try{
      if (/^data:/.test(src)){
        // data URL
        const comma = src.indexOf(',');
        const meta = src.substring(0, comma);
        const isBase64 = /;base64/.test(meta);
        const data = src.substring(comma+1);
        return Buffer.from(data, isBase64 ? 'base64' : 'utf8');
      }
      if (/^https?:\/\//i.test(src)){
        return await new Promise((resolve, reject) => {
          const lib = src.startsWith('https') ? https : http;
          lib.get(src, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
              // follow redirects
              fetchImageBuffer(res.headers.location).then(resolve).catch(reject);
              return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          }).on('error', reject);
        });
      }
      // treat as local path
      return await fs.promises.readFile(src);
    }catch(e){
      return null;
    }
  }

  // Header / Branding with optional logo
  const logoBuf = businessInfo.logoUrl ? await fetchImageBuffer(businessInfo.logoUrl) : null;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const headerYStart = doc.y;
  if (logoBuf){
    try{
      doc.image(logoBuf, doc.x, doc.y, { width: 80, height: 40 });
    }catch(e){ /* ignore image errors */ }
  }
  // Text to the right of logo
  const textX = doc.x + (logoBuf ? 90 : 0);
  const textWidth = pageWidth - (logoBuf ? 90 : 0);
  doc.fontSize(14).text(businessInfo.name || 'Fundamental Apparel', textX, doc.y, { width: textWidth, align: 'left' });
  doc.fontSize(9).text(businessInfo.address || '[Insert Address Here]', { width: textWidth, align: 'left' });
  // generated date on right
  doc.fontSize(9).text(`Generated: ${new Date().toLocaleString()}`, doc.x, headerYStart, { align: 'right', width: pageWidth });
  doc.moveDown(0.6);
  doc.fontSize(12).text('Sales Report', { align: 'center' });
  const rangeText = `${startDate ? (new Date(startDate)).toISOString().split('T')[0] : 'All'} to ${endDate ? (new Date(endDate)).toISOString().split('T')[0] : 'All'}`;
  doc.fontSize(9).text(`Date Range: ${rangeText}`, { align: 'center' });
  doc.moveDown(0.5);
  // Currency formatter (declare early so summary can use it)
  const currency = businessInfo.currency || 'PHP';
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 });

  // --- Summary calculations (for range totals) ---
  let summary = { totalOrders: 0, totalRevenue: 0, totalQuantity: 0 };
  if (filterType === 'product' || filterType === 'predesign'){
    summary.totalQuantity = rows.reduce((s,r)=> s + (r.totalQty||0), 0);
    summary.totalRevenue = rows.reduce((s,r)=> s + (Number(r.revenue)||0), 0);
  } else {
    summary.totalOrders = rows.length;
    summary.totalRevenue = rows.reduce((s,r)=> s + (Number(r.totalPrice)||0), 0);
  }

  // draw small summary box to the right under date range
  const summaryBoxWidth = 200;
  const summaryBoxHeight = 60;
  const summaryBoxX = doc.page.margins.left + (pageWidth - summaryBoxWidth);
  const summaryBoxY = doc.y;
  doc.save();
  doc.rect(summaryBoxX, summaryBoxY, summaryBoxWidth, summaryBoxHeight).fill('#f9fafb');
  doc.fillColor('#000').fontSize(9).text('Summary', summaryBoxX + 8, summaryBoxY + 6);
  if (filterType === 'product' || filterType === 'predesign'){
    doc.fontSize(9).text(`Products: ${rows.length}`, summaryBoxX + 8, summaryBoxY + 22);
    doc.fontSize(9).text(`Revenue: ${formatter.format(summary.totalRevenue)}`, summaryBoxX + 8, summaryBoxY + 36);
  } else {
    doc.fontSize(9).text(`Orders: ${summary.totalOrders}`, summaryBoxX + 8, summaryBoxY + 22);
    doc.fontSize(9).text(`Revenue: ${formatter.format(summary.totalRevenue)}`, summaryBoxX + 8, summaryBoxY + 36);
  }
  doc.lineWidth(0.5).strokeColor('#e5e7eb').rect(summaryBoxX, summaryBoxY, summaryBoxWidth, summaryBoxHeight).stroke();
  doc.restore();
  // ensure we don't overlap the summary box with table header
  if (doc.y < summaryBoxY + summaryBoxHeight + 6) doc.y = summaryBoxY + summaryBoxHeight + 6;

  // (formatter already declared above)

  // Table drawing helpers
  function ensurePageFor(heightNeeded){
    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    if (doc.y + heightNeeded > bottomLimit) { doc.addPage(); return true; }
    return false;
  }

  function truncateText(s, max){ if (!s) return ''; const str = String(s); return str.length > max ? (str.substring(0, max-3) + '...') : str; }

  function drawTableHeader(headers, startX, headerY, headerHeight, colWidths){
    doc.save();
    doc.rect(startX, headerY, pageWidth, headerHeight).fill('#f3f4f6');
    doc.fillColor('#000').fontSize(10);
    let cx = startX;
    for (let i=0;i<headers.length;i++){
      doc.text(headers[i], cx + 4, headerY + 6, { width: colWidths[i]-8, align: 'left' });
      cx += colWidths[i];
    }
    doc.lineWidth(0.5).strokeColor('#d1d5db').rect(startX, headerY, pageWidth, headerHeight).stroke();
    doc.restore();
  }

  // Column widths (fractions of pageWidth)
  const cols = (filterType === 'product' || filterType === 'predesign') ? [0.45,0.20,0.12,0.23] : [0.22,0.18,0.30,0.15,0.15];
  const colWidths = cols.map(f => Math.floor(f * pageWidth));

  if (filterType === 'product' || filterType === 'predesign'){
    // header row (explicit Y-based layout)
    const startX = doc.x;
    const headerHeight = 20;
    const headers = ['Product Name','Category','Quantity','Revenue'];
    // draw header (ensure page space)
    ensurePageFor(headerHeight + 6);
    drawTableHeader(headers, startX, doc.y, headerHeight, colWidths);
    doc.y = doc.y + headerHeight + 6;

    let totalQty = 0; let totalRevenue = 0;
    const rowHeight = 16;
    for (const r of rows){
      const added = ensurePageFor(rowHeight + 6);
      if (added){
        // redraw header on new page
        drawTableHeader(headers, startX, doc.y, headerHeight, colWidths);
        doc.y = doc.y + headerHeight + 6;
      }
      const rowY = doc.y;
      let x = startX;
      const values = [ truncateText(r.productName || (r.productId||''), 40), truncateText(r.category || '', 18), String(r.totalQty||0), formatter.format(Number(r.revenue)||0) ];
      for (let i=0;i<values.length;i++){
        doc.fontSize(9).fillColor('#111').text(values[i], x + 4, rowY + 3, { width: colWidths[i]-8, align: i===2? 'right' : (i===3? 'right' : 'left') });
        x += colWidths[i];
      }
      // row border
      doc.lineWidth(0.3).strokeColor('#e5e7eb').rect(startX, rowY, pageWidth, rowHeight).stroke();
      // advance cursor
      doc.y = doc.y + rowHeight + 4;
      totalQty += (r.totalQty||0);
      totalRevenue += (r.revenue||0);
    }
    doc.moveDown(0.6);
    doc.fontSize(11).fillColor('#000').text('Total Summary', { underline: true });
    doc.moveDown(0.2);
    doc.fontSize(9).text(`Products: ${rows.length}`);
    doc.fontSize(9).text(`Total Quantity: ${totalQty}`);
    doc.fontSize(9).text(`Total Revenue: ${formatter.format(totalRevenue)}`);
  } else {
    // Order level with borders (explicit header placement)
    const startX = doc.x;
    const headerHeight = 20;
    const headers = ['Order ID','Date','Customer','Total','Paid'];
    ensurePageFor(headerHeight + 6);
    drawTableHeader(headers, startX, doc.y, headerHeight, colWidths);
    doc.y = doc.y + headerHeight + 6;

    const rowHeight = 16;
    for (const r of rows){
      const added = ensurePageFor(rowHeight + 6);
      if (added){ drawTableHeader(headers, startX, doc.y, headerHeight, colWidths); doc.y = doc.y + headerHeight + 6; }
      const rowY = doc.y;
      let x = startX;
      const shortOrderId = truncateText(String(r.orderId||''), 18);
      const values = [ shortOrderId, (r.date||'').split('T')[0]||'', truncateText(r.customer||'', 24), formatter.format(Number(r.totalPrice)||0), r.isPaid? 'Yes':'No' ];
      for (let i=0;i<values.length;i++){
        doc.fontSize(9).fillColor('#111').text(values[i], x + 4, rowY + 3, { width: colWidths[i]-8, align: i>=3? 'right' : 'left' });
        x += colWidths[i];
      }
      doc.lineWidth(0.3).strokeColor('#e5e7eb').rect(startX, rowY, pageWidth, rowHeight).stroke();
      doc.y = doc.y + rowHeight + 4;
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
