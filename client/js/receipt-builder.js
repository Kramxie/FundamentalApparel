// Shared receipt builder used by profile, my-purchases, and admin pages
(function(){
  function escapeHtml(s){ if (s === null || typeof s === 'undefined') return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function formatCurrency(n){ return '₱' + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2}); }

  function buildReceiptHtml(r){
    const itemsRows = (r.items||[]).map(it => `\n        <tr class="border-t">\n          <td class="py-2">${escapeHtml(it.name)}</td>\n          <td class="py-2 text-center">${escapeHtml(it.size||'-')}</td>\n          <td class="py-2 text-center">${Number(it.quantity||1)}</td>\n          <td class="py-2 text-right">${formatCurrency((Number(it.price)||0))}</td>\n          <td class="py-2 text-right">${formatCurrency((Number(it.price)||0)*(Number(it.quantity)||1))}</td>\n        </tr>\n      `).join('');
    const subtotal = Number(r.subtotal || 0) || (r.items||[]).reduce((s,it)=>s+((Number(it.price)||0)*(Number(it.quantity)||1)),0);
    const delivery = Number(r.deliveryFee||0);
    const voucherAmt = Math.round((Number(r.voucherDiscount || 0) || 0) * 100) / 100;
    const taxable = Math.max(subtotal - voucherAmt, 0);
    const vat = Math.round(taxable * 0.12 * 100) / 100;
    const total = Math.round((subtotal - voucherAmt + delivery + vat) * 100) / 100;

    return `
      <div class="max-w-full">
        <div class="text-center mb-2">
          <h1 class="text-xl font-bold">FUNDAMENTAL APPAREL</h1>
          <div class="text-sm text-gray-600">Unit 4B, Creative Building • Makati City</div>
        </div>
        <div class="flex justify-center mb-4">
          <div class="text-sm text-left border rounded px-3 py-2 bg-gray-50" style="min-width:260px;">
            <div><strong>OR No.:</strong> ${escapeHtml(String(r._id || ''))}</div>
            <div><strong>Date:</strong> ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</div>
            <div><strong>TIN:</strong> ${escapeHtml((r.tin && String(r.tin).trim()) ? r.tin : `AUTOGEN-${(r._id||'').toString().slice(-8).toUpperCase()}`)}</div>
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
})();
