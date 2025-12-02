// Shared receipt builder used by profile, my-purchases, and admin pages
(function(){
  function escapeHtml(s){ if (s === null || typeof s === 'undefined') return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function formatCurrency(n){ return '₱' + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2}); }

  function generateInvoiceNumber(source){
    // Generate invoice number based on order ID or date
    if (!source) {
      const now = new Date();
      return `INV-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
    }
    if (typeof source === 'string' && source.length >= 8) {
      return `INV-${source.slice(-8).toUpperCase()}`;
    }
    return `INV-${String(source).slice(-8).toUpperCase()}`;
  }

  // Generate a consistent TIN number based on order ID (format: XXX-XXX-XXX-XXX)
  function generateTIN(source) {
    const hash = String(source || Date.now()).split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    const num = Math.abs(hash);
    const p1 = String(num % 1000).padStart(3, '0');
    const p2 = String(Math.floor(num / 1000) % 1000).padStart(3, '0');
    const p3 = String(Math.floor(num / 1000000) % 1000).padStart(3, '0');
    const p4 = String(Math.floor(num / 1000000000) % 1000).padStart(3, '0');
    return `${p1}-${p2}-${p3}-${p4}`;
  }

  function formatDate(dateStr){
    if (!dateStr) return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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

  // Format address object or string into a displayable string
  function formatAddress(addr) {
    if (!addr) return '';
    if (typeof addr === 'string') return addr;
    // If it's an object, build the address string
    const parts = [];
    if (addr.block) parts.push(`Blk ${addr.block}`);
    if (addr.lot) parts.push(`Lot ${addr.lot}`);
    if (addr.street) parts.push(addr.street);
    if (addr.building) parts.push(addr.building);
    if (addr.city) parts.push(addr.city);
    if (addr.province) parts.push(addr.province);
    if (addr.zipCode) parts.push(addr.zipCode);
    return parts.join(', ');
  }

  function buildReceiptHtml(r){
    // Defensive: if no meaningful data present, return a simple placeholder
    const hasItems = Array.isArray(r && r.items) && r.items.length > 0;
    const hasAmounts = (typeof r.subtotal === 'number' && r.subtotal > 0) || (typeof r.total === 'number' && r.total > 0);
    
    // Auto-detect logo path based on current page location
    const isAdminPage = window.location.pathname.includes('/admin/');
    const logoPath = isAdminPage ? '../images/logo.png' : 'images/logo.png';
    
    if (!r || (!hasItems && !hasAmounts && !r._id && !r.createdAt)) {
      return `
      <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; padding: 40px; text-align: center; color: #6b7280;">
        <img src="${logoPath}" alt="Fundamental Apparel" style="height: 60px; margin-bottom: 20px;" onerror="this.style.display='none'">
        <h2 style="font-weight: 600; margin-bottom: 12px; color: #111827;">FUNDAMENTAL APPAREL</h2>
        <p style="margin-bottom: 16px;">Receipt data is not available for this order.</p>
        <p>If you believe this is an error, please contact support.</p>
      </div>`;
    }

    // Generate invoice number and TIN
    const invoiceNo = generateInvoiceNumber(r._id || r.orderId || r.paymentIntentId);
    const tinNumber = generateTIN(r._id || r.orderId || r.paymentIntentId);
    
    // Get customer info
    const customerName = escapeHtml(r.customerName || r.name || (r.user && r.user.name) || 'Customer');
    const customerEmail = escapeHtml(r.customerEmail || r.email || (r.user && r.user.email) || '');
    const customerPhone = escapeHtml(r.customerPhone || r.phone || r.contactNumber || (r.user && r.user.phone) || '');
    const customerAddress = escapeHtml(formatAddress(r.customerAddress || r.shippingAddress || r.address || (r.user && r.user.address)));

    // Get payment date (paidAt, deliveredAt, or createdAt)
    const paymentDate = r.paidAt || r.deliveredAt || r.createdAt;

    // Calculate summary
    const summary = calculateSummary(r);
    const subtotal = summary.subtotal;
    const delivery = summary.delivery;
    const voucherAmt = summary.voucher;
    const vat = summary.vat;
    const total = summary.total;

    // Professional Invoice Template - Clean Minimalist Style with page-break handling
    return `
      <div id="receipt-content" class="receipt-document" style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; background: #ffffff; color: #111827;">
        
        <!-- Top Header Bar -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; page-break-inside: avoid;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${logoPath}" alt="Logo" style="height: 50px; width: 50px; object-fit: contain; border-radius: 8px; background: #f3f4f6; padding: 4px;" onerror="this.style.display='none'">
            <div>
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e40af;">Fundamental Apparel</p>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: #6b7280;">Imus, Philippines • Pasay City, Philippines</p>
              <p style="margin: 2px 0 0 0; font-size: 11px; color: #9ca3af;">TIN: ${tinNumber}</p>
            </div>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">Invoice# <span style="color: #111827; font-weight: 500;">${invoiceNo}</span></p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #6b7280;">Issue date <span style="color: #111827;">${formatDate(r.createdAt)}</span></p>
          </div>
        </div>

        <!-- Business Name Section -->
        <div style="margin-bottom: 32px; page-break-inside: avoid;">
          <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: #111827;">Fundamental Apparel</h1>
          <p style="margin: 0; font-size: 14px; color: #6b7280;">Thank you for your purchase! Here's your official receipt.</p>
        </div>

        <!-- Three Column Info Section -->
        <div style="display: flex; gap: 32px; margin-bottom: 32px; page-break-inside: avoid;">
          <!-- BILL TO -->
          <div style="flex: 1;">
            <h3 style="margin: 0 0 12px 0; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Bill To</h3>
            <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 500; color: #111827;">${customerName}</p>
            ${customerEmail ? `<p style="margin: 0 0 2px 0; font-size: 13px; color: #6b7280;">${customerEmail}</p>` : ''}
            ${customerPhone ? `<p style="margin: 0 0 2px 0; font-size: 13px; color: #6b7280;">${customerPhone}</p>` : ''}
            ${customerAddress ? `<p style="margin: 0; font-size: 13px; color: #6b7280; max-width: 200px; word-wrap: break-word;">${customerAddress}</p>` : ''}
          </div>
          
          <!-- DETAILS -->
          <div style="flex: 1;">
            <h3 style="margin: 0 0 12px 0; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Details</h3>
            <p style="margin: 0 0 2px 0; font-size: 13px; color: #6b7280;">Order ID: <span style="color: #111827;">${escapeHtml(String(r._id || r.orderId || '-').slice(-12))}</span></p>
            <p style="margin: 0 0 2px 0; font-size: 13px; color: #6b7280;">Payment: <span style="color: #111827;">${escapeHtml(r.paymentMethod || 'Online Payment')}</span></p>
            <p style="margin: 0; font-size: 13px; color: #6b7280;">Status: <span style="color: ${r.paymentStatus === 'Received' || r.isPaid ? '#059669' : '#f59e0b'}; font-weight: 500;">${r.paymentStatus === 'Received' || r.isPaid ? 'Paid' : (r.paymentStatus || 'Pending')}</span></p>
          </div>
          
          <!-- PAYMENT -->
          <div style="flex: 1;">
            <h3 style="margin: 0 0 12px 0; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Payment</h3>
            <p style="margin: 0 0 2px 0; font-size: 13px; color: #6b7280;">Date Paid: <span style="color: #111827;">${formatDate(paymentDate)}</span></p>
            <p style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">${formatCurrency(total)}</p>
          </div>
        </div>

        <!-- Items Table -->
        <div style="margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="border-bottom: 2px solid #e5e7eb; page-break-inside: avoid; page-break-after: avoid;">
                <th style="padding: 12px 0; text-align: left; font-weight: 600; color: #111827; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Item</th>
                <th style="padding: 12px 0; text-align: center; font-weight: 600; color: #111827; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; width: 80px;">Qty</th>
                <th style="padding: 12px 0; text-align: right; font-weight: 600; color: #111827; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; width: 100px;">Price</th>
                <th style="padding: 12px 0; text-align: right; font-weight: 600; color: #111827; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; width: 100px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${(r.items||[]).map((it, idx) => {
                const unitPrice = Number(it.price)||0;
                const qty = Number(it.quantity||it.qty||1);
                const itemTotal = unitPrice * qty;
                const itemName = escapeHtml(it.name || it.productName || 'Item');
                const itemSize = it.size ? `Size: ${escapeHtml(it.size)}` : '';
                const itemColor = it.color ? escapeHtml(it.color) : '';
                const itemDesc = [itemSize, itemColor].filter(Boolean).join(' • ');
                
                return `
                <tr style="border-bottom: 1px solid #f3f4f6; page-break-inside: avoid;">
                  <td style="padding: 12px 0;">
                    <p style="margin: 0; font-weight: 500; color: #111827;">${itemName}</p>
                    ${itemDesc ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #9ca3af;">${itemDesc}</p>` : ''}
                  </td>
                  <td style="padding: 12px 0; text-align: center; color: #6b7280;">${qty}</td>
                  <td style="padding: 12px 0; text-align: right; color: #6b7280;">${formatCurrency(unitPrice)}</td>
                  <td style="padding: 12px 0; text-align: right; color: #111827; font-weight: 500;">${formatCurrency(itemTotal)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Totals Section -->
        <div style="display: flex; justify-content: flex-end; page-break-inside: avoid;">
          <div style="width: 280px;">
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="font-size: 14px; color: #6b7280;">Subtotal</span>
              <span style="font-size: 14px; color: #111827;">${formatCurrency(subtotal)}</span>
            </div>
            ${voucherAmt > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="font-size: 14px; color: #059669;">Discount</span>
              <span style="font-size: 14px; color: #059669;">-${formatCurrency(voucherAmt)}</span>
            </div>` : ''}
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="font-size: 14px; color: #6b7280;">Shipping</span>
              <span style="font-size: 14px; color: #111827;">${formatCurrency(delivery)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="font-size: 14px; color: #6b7280;">Tax (12% VAT)</span>
              <span style="font-size: 14px; color: #111827;">${formatCurrency(vat)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 16px 0 0 0;">
              <span style="font-size: 16px; font-weight: 700; color: #111827;">Total Paid</span>
              <span style="font-size: 18px; font-weight: 700; color: #111827;">${formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center; page-break-inside: avoid;">
          <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">Thank you for shopping with Fundamental Apparel!</p>
          <p style="margin: 0 0 8px 0; font-size: 12px; color: #9ca3af;">This is a computer-generated receipt. No signature required.</p>
          <p style="margin: 0; font-size: 11px; color: #d1d5db;">TIN: ${tinNumber}</p>
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
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.onload = () => resolve(window.html2pdf);
      s.onerror = () => reject(new Error('Failed to load html2pdf'));
      document.body.appendChild(s);
    });

    const clone = element.cloneNode(true);
    clone.querySelectorAll && clone.querySelectorAll('.no-print').forEach(n => n.remove());
    const container = document.createElement('div');
    container.style.position = 'fixed'; 
    container.style.left = '-9999px'; 
    container.style.top = '0';
    container.style.width = '800px'; 
    container.appendChild(clone);
    document.body.appendChild(container);
    try {
      await ensure();
      const opt = {
        margin: [10, 10, 10, 10],
        filename: filename || 'receipt.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
      await window.html2pdf().set(opt).from(clone).save();
    } finally {
      container.remove();
    }
  };
})();
