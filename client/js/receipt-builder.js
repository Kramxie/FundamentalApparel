// Shared receipt builder used by profile, my-purchases, and admin pages
(function(){
  function escapeHtml(s){ if (s === null || typeof s === 'undefined') return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function formatCurrency(n){ return '₱' + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2}); }

  function generateTIN(source){
    // If a TIN-like value exists, prefer it; otherwise synthesize a short TIN based on id
    if (!source) return '';
    if (typeof source === 'string' && source.trim()) return source.trim();
    try { return `TIN-${String(source).slice(-4).toUpperCase()}${String(source).slice(0,4).toUpperCase()}`; } catch (e) { return `TIN-${String(source).slice(-8)}`; }
  }

  function calculateSummary(r){
    const items = Array.isArray(r.items) ? r.items : [];
    const subtotal = items.reduce((s,it)=> s + ((Number(it.price)||0) * (Number(it.quantity)||Number(it.qty)||1)), 0);
    const delivery = Number(r.deliveryFee || r.shipping || 0);
    const voucher = Number(r.voucherDiscount || r.voucher || 0);
    const taxable = Math.max(subtotal - voucher, 0);
    const vat = Math.round(((taxable) * 0.12) * 100) / 100; // 12% VAT on taxable base
    const total = Math.round((subtotal + delivery + vat - voucher) * 100) / 100;
    return { subtotal, delivery, voucher, vat, total };
  }

  function buildReceiptHtml(r){
    // Defensive: if no meaningful data present, return a simple placeholder
    const hasItems = Array.isArray(r && r.items) && r.items.length > 0;
    const hasAmounts = (typeof r.subtotal === 'number' && r.subtotal > 0) || (typeof r.total === 'number' && r.total > 0);
    if (!r || (!hasItems && !hasAmounts && !r._id && !r.createdAt)) {
      return `
      <div class="p-6 text-center text-sm text-gray-600">
        <h2 class="font-semibold mb-2">FUNDAMENTAL APPAREL</h2>
        <div class="mb-4">Receipt data is not available for this order.</div>
        <div>If you believe this is an error, please contact support.</div>
      </div>`;
    }
    const itemsRows = (r.items||[]).map(it => `\n        <tr class="border-t">\n          <td class="py-2">${escapeHtml(it.name)}</td>\n          <td class="py-2 text-center">${escapeHtml(it.size||'-')}</td>\n          <td class="py-2 text-center">${Number(it.quantity||1)}</td>\n          <td class="py-2 text-right">${formatCurrency((Number(it.price)||0))}</td>\n          <td class="py-2 text-right">${formatCurrency((Number(it.price)||0)*(Number(it.quantity)||1))}</td>\n        </tr>\n      `).join('');
    // Use centralized calculation so user/admin receipts match
    const summary = calculateSummary(r);
    const subtotal = summary.subtotal;
    const delivery = summary.delivery;
    const voucherAmt = summary.voucher;
    const vat = summary.vat;
    const total = summary.total;
    const tinDisplay = (r.tin && String(r.tin).trim()) ? r.tin : generateTIN(r._id || r.paymentIntentId || r.receiptId || r.orderId);

    return `
      <div id="receipt-content" class="receipt-document max-w-full">
        <div class="text-center mb-2">
          <h1 class="text-xl font-bold">FUNDAMENTAL APPAREL</h1>
          <div class="text-sm text-gray-600">Unit 4B, Creative Building • Makati City</div>
        </div>
        <div class="flex justify-center mb-4">
          <div class="text-sm text-left border rounded px-3 py-2 bg-gray-50" style="min-width:260px;">
            <div><strong>Order #:</strong> ${escapeHtml(String(r._id || r.orderId || ''))}</div>
            <div><strong>Date:</strong> ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</div>
            <div><strong>TIN:</strong> ${escapeHtml(tinDisplay)}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div class="text-center">
            <div class="text-sm text-gray-600">Prepared by</div>
            <div class="font-medium">${escapeHtml(r.preparedByName||r.preparedBy||'Fundamental Apparel')}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600">Billed to</div>
            <div class="font-medium">${escapeHtml(r.customerName || r.customerEmail || (r.user && (r.user.name || r.user.email)) || r.email || 'Customer')}</div>
            ${r.customerAddress? `<div class="text-sm text-gray-600">${escapeHtml(r.customerAddress)}</div>` : ''}
          </div>
        </div>

        <div class="overflow-auto">
          <table class="w-full text-sm border-collapse">
            <thead class="bg-gray-100">
              <tr>
                <th class="text-left p-2">Product</th>
                <th class="text-center p-2">Size</th>
                <th class="text-center p-2">QTY</th>
                <th class="text-right p-2">Unit</th>
                <th class="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
        </div>

        <div class="mt-4 text-sm">
          <div class="flex justify-end"><div class="w-full md:w-1/3">
            <div class="flex justify-between"><span>Subtotal</span><span class="font-medium">${formatCurrency(subtotal)}</span></div>
            <div class="flex justify-between"><span>Voucher</span><span class="font-medium">${voucherAmt>0?formatCurrency(voucherAmt):'(N/A)'}</span></div>
            <div class="flex justify-between"><span>Delivery Fee</span><span class="font-medium">${formatCurrency(delivery)}</span></div>
            <div class="flex justify-between"><span>VAT (12%)</span><span class="font-medium">${formatCurrency(vat)}</span></div>
            <div class="flex justify-between font-semibold"><span>Total</span><span class="font-medium">${formatCurrency(total)}</span></div>
          </div></div>
        </div>
      </div>
    `;
  }

  // expose
  window.escapeHtml = escapeHtml;
  window.formatCurrency = formatCurrency;
  window.buildReceiptHtml = buildReceiptHtml;
  // Generate a clean PDF from an element by cloning and stripping UI controls.
  window.generatePdfFromElement = async function(element, filename) {
    if (!element) throw new Error('No element provided for PDF generation');
    const ensure = () => new Promise((resolve, reject) => {
      if (window.html2pdf) return resolve(window.html2pdf);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js';
      s.onload = () => resolve(window.html2pdf);
      s.onerror = () => reject(new Error('Failed to load html2pdf'));
      document.body.appendChild(s);
    });

    const clone = element.cloneNode(true);
    clone.querySelectorAll && clone.querySelectorAll('.no-print').forEach(n => n.remove());
    const container = document.createElement('div');
    container.style.position = 'fixed'; container.style.left = '-9999px'; container.style.top = '0';
    container.style.width = '800px'; container.appendChild(clone);
    document.body.appendChild(container);
    try {
      await ensure();
      const opt = {
        margin: 8,
        filename: filename || 'receipt.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: Math.min(2, (window.devicePixelRatio || 1) * 1.2) },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };
      await window.html2pdf().set(opt).from(clone).save();
    } finally {
      container.remove();
    }
  };
})();
