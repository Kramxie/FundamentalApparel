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
            <li><a href="#" class="hover:text-indigo-600">Returns</a></li>
            <li><a href="#" class="hover:text-indigo-600">Refund</a></li>
            <li><a href="#" class="hover:text-indigo-600">Size Guide</a></li>
          </ul>
        </div>
        <div>
          <h3 class="text-gray-900 font-semibold mb-3">Customer Care</h3>
          <ul class="space-y-2">
            <li><a href="#" class="hover:text-indigo-600">Contact Us</a></li>
            <li><a href="#" class="hover:text-indigo-600">Payment Method</a></li>
            <li><a href="#" class="hover:text-indigo-600">Bonus Point</a></li>
            <li><a href="#" class="hover:text-indigo-600">FAQ</a></li>
          </ul>
        </div>
        <div>
          <h3 class="text-gray-900 font-semibold mb-3">Business Information</h3>
          <ul class="space-y-2">
            <li><span class="text-gray-900 font-medium">Fundamentals</span></li>
            <li><span class="text-gray-500">Address:</span> <span>—</span></li>
            <li><span class="text-gray-500">Email:</span> <span>—</span></li>
          </ul>
        </div>
      </div>

      <div class="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="flex items-center gap-4">
          <span class="text-gray-900 font-semibold">Find us on</span>
          <div class="flex items-center gap-4 text-gray-700">
            <i class="fab fa-facebook text-xl"></i>
            <i class="fab fa-tiktok text-xl"></i>
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
          <p>© <span id="footer-year">${year}</span> Fundamental. All rights reserved.</p>
          <a href="#" class="hover:text-indigo-600">Privacy Policy</a>
          <a href="#" class="hover:text-indigo-600">Terms & Conditions</a>
        </div>
      </div>
    </div>
  </footer>`;
})();
