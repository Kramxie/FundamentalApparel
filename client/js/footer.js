(function(){
  const container = document.getElementById('site-footer');
  if (!container) return;

  const year = new Date().getFullYear();
  container.innerHTML = `
  <footer class="bg-white border-t mt-16">
    <div class="container mx-auto px-6 py-12">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm text-gray-700">
        <div>
          <h3 class="text-gray-900 font-semibold mb-3">Company Info</h3>
          <ul class="space-y-2">
            <li><a href="about-us.html" class="hover:text-indigo-600">About Fundamentals</a></li>
          </ul>
        </div>
        <div>
          <h3 class="text-gray-900 font-semibold mb-3">Help & Support</h3>
          <ul class="space-y-2">
            <li><a href="#" class="hover:text-indigo-600">Shipping Info</a></li>
            <li><a href="returns.html" class="hover:text-indigo-600">Returns</a></li>
            <li><a href="returns.html" class="hover:text-indigo-600">Refund</a></li>
            <li><a href="size-guide.html" class="hover:text-indigo-600">Size Guide</a></li>
          </ul>
        </div>
        <div>
          <h3 class="text-gray-900 font-semibold mb-3">Customer Care</h3>
          <ul class="space-y-2">
            <li><a href="contact.html" class="hover:text-indigo-600">Contact Us</a></li>
            <li><a href="#" class="hover:text-indigo-600">Payment Method</a></li>
            <li><a href="#" class="hover:text-indigo-600">Bonus Point</a></li>
            <li><a href="faqs.html" class="hover:text-indigo-600">FAQ</a></li>
          </ul>
        </div>
        <div>
          <h3 class="text-gray-900 font-semibold mb-3">Business Information</h3>
          <ul class="space-y-2">
            <li><span class="text-gray-900 font-medium">Fundamental Apparel</span></li>
            <li><span class="text-gray-500">Address:</span> <span>Imus, Philippines · Pasay City, Philippines</span></li>
            <li><span class="text-gray-500">Email:</span> <span>fundamentalapparel7@gmail.com</span></li>
          </ul>
        </div>
      </div>

      <div class="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="flex items-center gap-4">
          <span class="text-gray-900 font-semibold">Find us on</span>
          <div class="flex items-center gap-4 text-gray-700">
            <a href="https://www.facebook.com/fundamentalapparel" target="_blank" rel="noopener noreferrer" class="hover:text-blue-600 transition">
              <i class="fab fa-facebook text-xl"></i>
            </a>
            <a href="https://www.tiktok.com/@fundamental.apparel?is_from_webapp=1&sender_device=pc" target="_blank" rel="noopener noreferrer" class="hover:text-gray-900 transition">
              <i class="fab fa-tiktok text-xl"></i>
            </a>
          </div>
        </div>
        <div class="md:text-right">
          <span class="text-gray-900 font-semibold">We Accept</span>
          <div class="mt-3 flex md:justify-end gap-3">
            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
              <i class="fas fa-wallet"></i> GCash
            </span>
            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200 text-xs font-semibold">
              <i class="fas fa-landmark"></i> Credit Cards
            </span>
          </div>
        </div>
      </div>

      <hr class="my-8">
      <div class="text-xs text-gray-500">
        <div class="flex flex-col items-center justify-center gap-1 text-center">
          <p>© <span id="footer-year">${year}</span> Fundamental Apparel. All rights reserved.</p>
          <a href="#" id="footer-privacy" class="hover:text-indigo-600">Privacy Policy</a>
          <a href="#" id="footer-terms" class="hover:text-indigo-600">Terms & Conditions</a>
        </div>
      </div>
    </div>
  </footer>`;
  // Wire footer policy links to open the shared policy modal.
  function closePolicyModal(){
    const modal = document.getElementById('policyModal');
    if(!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function ensurePolicyModal(){
    let modal = document.getElementById('policyModal');
    if(modal) return modal;

    // Insert the same modal markup used on login/register pages so footer can open it on any page.
    const modalHtml = `
    <div id="policyModal" class="hidden fixed inset-0 bg-black/60 z-50 items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="policyTitle" tabindex="-1">
      <div class="bg-white max-w-4xl w-[90%] max-h-[85vh] overflow-y-auto rounded-lg p-6 mx-auto shadow-lg ring-1 ring-black/5">
        <div class="flex items-center justify-between gap-4 mb-4">
          <h2 id="policyTitle" class="text-2xl font-semibold text-gray-900">Privacy Policy &amp; Terms &amp; Conditions</h2>
          <button id="policyClose" class="text-gray-600 hover:text-gray-900 bg-gray-100 px-3 py-1 rounded-md">Close ✕</button>
        </div>
        <div class="prose text-sm text-gray-700">
          <section class="space-y-3">
            <h3 class="text-lg font-semibold text-gray-900">Privacy Policy</h3>
            <p class="leading-relaxed">Fundamental Apparel collects and processes personal information necessary to provide our services, manage orders, and communicate with customers. We collect contact information (name, email, phone), shipping addresses, order history, and any files you upload when using our Custom Upload services. Images and files uploaded as part of reviews or custom orders are stored securely and are accessible to staff for fulfillment and moderation purposes.</p>
            <p class="leading-relaxed">We use this information to fulfill orders, provide customer support, send transactional emails (order confirmations, shipping updates), and for fraud prevention. We do not sell personal data to third parties. For payment processing we share only necessary data with payment providers. You may request data access or deletion by contacting support.</p>
          </section>

          <section class="space-y-3 mt-4">
            <h3 class="text-lg font-semibold text-gray-900">Data and Image Usage</h3>
            <p class="leading-relaxed">By uploading images (reviews or custom designs), you grant Fundamental Apparel a non-exclusive license to store and process those images for the purpose of order fulfillment, displaying reviews (if allowed), and customer service. If an uploaded image contains sensitive content, please contact support to request removal.</p>
          </section>

          <section class="space-y-3 mt-4">
            <h3 class="text-lg font-semibold text-gray-900">Terms &amp; Conditions</h3>
            <p class="leading-relaxed">Orders are subject to stock availability and our inventory checks. Custom orders submitted via the Custom Upload flow are quotes and require confirmation. Payments, refunds, and returns are handled according to our Returns &amp; Refunds policy. Service orders may be excluded from loyalty rewards; admin controls apply.</p>
            <p class="leading-relaxed">Customers must provide accurate contact and shipping information. We reserve the right to cancel or modify orders in case of inventory errors, pricing mistakes, or suspected fraud. By creating an account and placing orders you agree to pay applicable fees and follow our usage guidelines.</p>
          </section>

          <section class="space-y-2 mt-4">
            <h3 class="text-lg font-semibold text-gray-900">Contact</h3>
            <p class="leading-relaxed">If you have questions about privacy or these terms, contact us at <a href="mailto:support@fundamental.example" class="text-indigo-600 hover:underline">support@fundamental.example</a> (replace with your operational support email) or through the admin contact channels.</p>
          </section>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modal = document.getElementById('policyModal');

    // hook up close handlers
    const closeBtn = document.getElementById('policyClose');
    if(closeBtn) closeBtn.addEventListener('click', closePolicyModal);
    // close when clicking overlay
    modal.addEventListener('click', (ev)=>{ if(ev.target === modal) closePolicyModal(); });
    // close on Escape
    window.addEventListener('keydown', (ev)=>{ if(ev.key === 'Escape') closePolicyModal(); });

    return modal;
  }

  function openPolicyModal(){
    const modal = ensurePolicyModal();
    if(!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  const pLink = document.getElementById('footer-privacy');
  const tLink = document.getElementById('footer-terms');
  [pLink, tLink].forEach(el=>{
    if(!el) return;
    el.addEventListener('click', (e)=>{
      e.preventDefault();
      openPolicyModal();
    });
  });

})();
