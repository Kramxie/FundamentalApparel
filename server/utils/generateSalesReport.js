const PDFDocument = require('pdfkit');
const stream = require('stream');
const https = require('https');
const http = require('http');
const fs = require('fs');
const Order = require('../models/Order');
const CustomOrder = require('../models/CustomOrder');

// --- Helper Functions ---
function _escapeCsvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Truncate text to avoid layout breakage
function truncate(str, len) {
    if (!str) return '';
    str = String(str);
    return str.length > len ? str.substring(0, len) + '...' : str;
}

async function _aggregateProductSales(match) {
  const agg = [
    { $match: match },
    { $unwind: '$orderItems' },
    { $group: { 
        _id: '$orderItems.product', 
        productName: { $first: '$orderItems.name' }, 
        totalQty: { $sum: '$orderItems.quantity' }, 
        revenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } } 
    }},
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $project: { 
        productId: '$_id', 
        productName: { $ifNull: ['$product.name', '$productName'] }, 
        category: '$product.category', 
        totalQty: 1, 
        revenue: 1 
    }},
    { $sort: { revenue: -1 } }
  ];
  return Order.aggregate(agg);
}

// --- Main Generator Function ---
async function generateSalesReport({ startDate=null, endDate=null, reportType='sales_summary', filterType='product', includeCustom=false, businessInfo={ name: 'Fundamental Apparel', address: '123 Fashion St., Metro Manila' } } = {}){
  
  // 1. DATA FETCHING LOGIC
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

  let rows = [];
  if (filterType === 'product'){
    rows = await _aggregateProductSales(match);
  } else if (filterType === 'predesign'){
    const customMatch = Object.assign({}, match);
    const agg = [
      { $match: Object.assign({}, customMatch, { serviceType: 'predesign-product' }) },
      { $group: { _id: '$productName', productName: { $first: '$productName' }, totalQty: { $sum: '$quantity' }, revenue: { $sum: '$totalPrice' } } },
      { $sort: { revenue: -1 } }
    ];
    const res = await CustomOrder.aggregate(agg);
    rows = res.map(r => ({ productId: r._id, productName: r.productName, category: 'predesign', totalQty: r.totalQty, revenue: r.revenue }));
  } else {
    // Order Level
    const docs = await Order.find(match).populate('user', 'name').lean().limit(10000);
    rows = docs.map(o => ({ 
        orderId: String(o._id), 
        date: o.createdAt ? o.createdAt.toISOString() : '', 
        customer: o.user ? o.user.name : 'Guest', 
        totalPrice: o.totalPrice || 0, 
        isPaid: !!o.isPaid 
    }));
  }

  // 2. CSV GENERATION (Kept existing logic)
  let csv = '';
  // ... (Your existing CSV logic is fine, keeping it brief here to focus on PDF fix)
  if (filterType === 'product' || filterType === 'predesign'){
    const lines = [['Product ID','Name','Category','Qty','Revenue'].join(',')];
    rows.forEach(r => lines.push([r.productId, _escapeCsvCell(r.productName), r.category, r.totalQty, r.revenue].join(',')));
    csv = lines.join('\n');
  } else {
    const lines = [['Order ID','Date','Customer','Total','Paid'].join(',')];
    rows.forEach(r => lines.push([r.orderId, r.date, _escapeCsvCell(r.customer), r.totalPrice, r.isPaid?'Yes':'No'].join(',')));
    csv = lines.join('\n');
  }

  // 3. PDF GENERATION (REFACTORED LAYOUT)
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const passthrough = new stream.PassThrough();
  doc.pipe(passthrough);

  // Layout Constants
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;
  
  // -- Branding Header --
  doc.fontSize(18).font('Helvetica-Bold').text(businessInfo.name, startX, 40);
  doc.fontSize(10).font('Helvetica').fillColor('#666666').text(businessInfo.address, startX, 65);
  doc.moveDown();

  // -- Report Info (Right Side) --
  const reportTitleY = 40;
  doc.fontSize(10).fillColor('#000000').text('SALES REPORT', startX, reportTitleY, { align: 'right', width: pageWidth });
  doc.fontSize(8).text(`Generated: ${new Date().toLocaleString()}`, startX, reportTitleY + 14, { align: 'right', width: pageWidth });
  
  const rangeText = `${startDate ? new Date(startDate).toLocaleDateString() : 'Start'} - ${endDate ? new Date(endDate).toLocaleDateString() : 'End'}`;
  doc.text(`Period: ${rangeText}`, startX, reportTitleY + 26, { align: 'right', width: pageWidth });

  // -- Calculate Summary --
  const formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
  let totalRev = 0;
  let totalCount = 0;
  
  if(filterType === 'product' || filterType === 'predesign') {
      totalRev = rows.reduce((acc, r) => acc + (r.revenue || 0), 0);
      totalCount = rows.reduce((acc, r) => acc + (r.totalQty || 0), 0);
  } else {
      totalRev = rows.reduce((acc, r) => acc + (r.totalPrice || 0), 0);
      totalCount = rows.length;
  }

  // -- Summary Box (KPI) --
  const summaryY = 100;
  doc.rect(startX, summaryY, pageWidth, 45).fill('#f8f9fa'); // Light gray background
  doc.fillColor('#000000');
  
  // Draw KPIs columns
  const kpiY = summaryY + 15;
  doc.fontSize(8).fillColor('#666666');
  doc.text('TOTAL REVENUE', startX + 20, kpiY);
  doc.text(filterType === 'product' ? 'TOTAL PRODUCTS SOLD' : 'TOTAL ORDERS', startX + 200, kpiY);
  
  doc.fontSize(14).fillColor('#000000').font('Helvetica-Bold');
  doc.text(formatter.format(totalRev), startX + 20, kpiY + 12);
  doc.text(String(totalCount), startX + 200, kpiY + 12);

  // -- Table Setup --
  const tableTop = summaryY + 60;
  let currentY = tableTop;
  
  // Define Columns based on type
  let columns = [];
  if (filterType === 'product' || filterType === 'predesign') {
      columns = [
          { label: 'Product Name', width: 0.40, align: 'left' },
          { label: 'Category', width: 0.20, align: 'left' },
          { label: 'Qty', width: 0.15, align: 'right' },
          { label: 'Revenue', width: 0.25, align: 'right' }
      ];
  } else {
      columns = [
          { label: 'Order ID', width: 0.25, align: 'left' },
          { label: 'Date', width: 0.15, align: 'left' },
          { label: 'Customer', width: 0.25, align: 'left' },
          { label: 'Status', width: 0.10, align: 'center' },
          { label: 'Total', width: 0.25, align: 'right' }
      ];
  }

  // Draw Header Function
  const drawHeader = (y) => {
      doc.rect(startX, y, pageWidth, 20).fill('#333333'); // Dark Header
      let cx = startX;
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      columns.forEach(col => {
          const w = col.width * pageWidth;
          // Add padding
          doc.text(col.label.toUpperCase(), cx + 5, y + 6, { width: w - 10, align: col.align });
          cx += w;
      });
  };

  // Draw Initial Header
  drawHeader(currentY);
  currentY += 20;

  // -- Draw Rows --
  doc.font('Helvetica').fontSize(9).fillColor('#000000');
  
  rows.forEach((row, i) => {
      // Check page overflow
      if (currentY > doc.page.height - 50) {
          doc.addPage();
          currentY = 50;
          drawHeader(currentY);
          currentY += 20;
          doc.font('Helvetica').fontSize(9).fillColor('#000000');
      }

      // Zebra Striping
      if (i % 2 === 0) {
          doc.rect(startX, currentY, pageWidth, 18).fill('#f9f9f9');
          doc.fillColor('#000000'); // Reset fill color after rect
      }

      let cx = startX;
      
      // Prepare Data
      let rowData = [];
      if (filterType === 'product' || filterType === 'predesign') {
          rowData = [
              truncate(row.productName || 'Unknown', 45),
              truncate(row.category || '-', 15),
              String(row.totalQty),
              formatter.format(row.revenue)
          ];
      } else {
          rowData = [
              truncate(row.orderId, 15), // Shorten ID
              new Date(row.date).toLocaleDateString(),
              truncate(row.customer, 20),
              row.isPaid ? 'Paid' : 'Unpaid',
              formatter.format(row.totalPrice)
          ];
      }

      // Render Cells
      rowData.forEach((text, idx) => {
          const col = columns[idx];
          const w = col.width * pageWidth;
          doc.text(text, cx + 5, currentY + 5, { width: w - 10, align: col.align });
          cx += w;
      });

      currentY += 18; // Row height
  });

  doc.end();

  // Buffer collection logic...
  const chunks = [];
  const pdfBuffer = await new Promise((resolve, reject) => {
    passthrough.on('data', c => chunks.push(c));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);
  });

  return {
    csv,
    pdfBuffer,
    meta: { generatedAt: new Date(), rows: rows.length }
  };
}

module.exports = { generateSalesReport };