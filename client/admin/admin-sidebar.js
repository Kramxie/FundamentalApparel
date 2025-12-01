/**
 * Admin Sidebar Component
 * This script injects a consistent sidebar across all admin pages
 */

(function() {
  // Get current page to set active state
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  
  // Sidebar CSS styles
  const sidebarStyles = `
    /* Fixed Sidebar Styles */
    .admin-sidebar {
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      width: 260px;
      background: linear-gradient(180deg, #1e1b4b 0%, #312e81 100%);
      overflow-y: auto;
      overflow-x: hidden;
      z-index: 40;
    }
    .admin-sidebar::-webkit-scrollbar { width: 6px; }
    .admin-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
    
    .admin-main {
      margin-left: 260px;
      min-height: 100vh;
    }
    
    /* Nav Link Styles */
    .nav-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      color: rgba(255,255,255,0.7);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      margin-bottom: 2px;
    }
    .nav-link:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }
    .nav-link.active {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    }
    .nav-link i { width: 20px; text-align: center; }
    
    /* Section Title */
    .nav-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(255,255,255,0.4);
      padding: 0 16px;
      margin-bottom: 8px;
      margin-top: 16px;
    }
    
    /* Mobile Responsive */
    @media (max-width: 1024px) {
      .admin-sidebar {
        transform: translateX(-100%);
        transition: transform 0.3s ease;
      }
      .admin-sidebar.open {
        transform: translateX(0);
      }
      .admin-main {
        margin-left: 0;
      }
    }
  `;
  
  // Helper to check if link is active
  function isActive(page) {
    return currentPage === page ? 'active' : '';
  }
  
  // Generate sidebar HTML
  function getSidebarHTML(isMobile = false) {
    const id = isMobile ? 'mobile-sidebar' : 'admin-sidebar';
    const hideClass = isMobile ? 'md:hidden' : 'hidden md:flex flex-col';
    
    return `
    <aside id="${id}" class="admin-sidebar ${hideClass}">
      ${isMobile ? `
      <div class="p-4 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center">
            <i class="fas fa-tshirt text-white"></i>
          </div>
          <span class="text-white font-bold">Admin Panel</span>
        </div>
        <button id="mobile-sidebar-close" class="text-white/70 hover:text-white p-2">
          <i class="fas fa-times text-lg"></i>
        </button>
      </div>
      ` : `
      <div class="p-5 border-b border-white/10">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center">
            <i class="fas fa-tshirt text-white text-lg"></i>
          </div>
          <div>
            <span class="text-white font-bold text-lg">Fundamental</span>
            <span class="block text-xs text-indigo-300">Admin Panel</span>
          </div>
        </div>
      </div>
      `}
      
      <nav class="flex-1 p-3">
        <div class="nav-section-title">Main</div>
        <a href="index.html" class="nav-link ${isActive('index.html')}">
          <i class="fas fa-th-large"></i><span>Dashboard</span>
        </a>
        <a href="orders.html" class="nav-link ${isActive('orders.html')}">
          <i class="fas fa-shopping-bag"></i><span>Orders</span>
        </a>
        <a href="returns.html" class="nav-link ${isActive('returns.html')}">
          <i class="fas fa-undo"></i><span>Returns & Refunds</span>
        </a>
        <a href="messages.html" class="nav-link ${isActive('messages.html')}">
          <i class="fas fa-comments"></i><span>Messages</span>
        </a>
        
        <div class="nav-section-title">Products</div>
        <a href="add-product.html" class="nav-link ${isActive('add-product.html')}">
          <i class="fas fa-plus-circle"></i><span>Add Product</span>
        </a>
        <a href="add-predisign-product.html" class="nav-link ${isActive('add-predisign-product.html')}">
          <i class="fas fa-tshirt"></i><span>Add Pre-Design</span>
        </a>
        <a href="inventory.html" class="nav-link ${isActive('inventory.html')}">
          <i class="fas fa-boxes"></i><span>Inventory</span>
        </a>
        <a href="manage-categories.html" class="nav-link ${isActive('manage-categories.html')}">
          <i class="fas fa-folder"></i><span>Categories</span>
        </a>
        <a href="featured-products.html" class="nav-link ${isActive('featured-products.html')}">
          <i class="fas fa-star"></i><span>Featured Products</span>
        </a>
        
        <div class="nav-section-title">Analytics</div>
        <a href="reports.html" class="nav-link ${isActive('reports.html')}">
          <i class="fas fa-chart-bar"></i><span>Reports & Sales</span>
        </a>
        <a href="vouchers.html" class="nav-link ${isActive('vouchers.html')}">
          <i class="fas fa-ticket-alt"></i><span>Vouchers</span>
        </a>
        
        <div class="nav-section-title">Admin</div>
        <a href="employees.html" class="nav-link ${isActive('employees.html')}">
          <i class="fas fa-users"></i><span>Employees</span>
        </a>
      </nav>
      
      <div class="p-3 border-t border-white/10 mt-auto">
        <a href="settings.html" class="nav-link ${isActive('settings.html')}">
          <i class="fas fa-cog"></i><span>Settings</span>
        </a>
        <a href="profile.html" class="nav-link ${isActive('profile.html')}">
          <i class="fas fa-user-circle"></i><span>Profile</span>
        </a>
      </div>
    </aside>
    `;
  }
  
  // Inject styles
  function injectStyles() {
    const existingStyle = document.getElementById('admin-sidebar-styles');
    if (existingStyle) return;
    
    const style = document.createElement('style');
    style.id = 'admin-sidebar-styles';
    style.textContent = sidebarStyles;
    document.head.appendChild(style);
  }
  
  // Initialize sidebar
  function initSidebar() {
    // Inject styles first
    injectStyles();
    
    // Check if sidebar already exists (from static HTML)
    const existingSidebar = document.querySelector('.admin-sidebar');
    const existingOverlay = document.getElementById('sidebar-overlay');
    
    // Only inject if no sidebar exists
    if (!existingSidebar) {
      // Create overlay
      if (!existingOverlay) {
        const overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'hidden fixed inset-0 bg-black/50 z-30 md:hidden';
        document.body.insertBefore(overlay, document.body.firstChild);
      }
      
      // Create desktop sidebar
      const desktopSidebar = document.createElement('div');
      desktopSidebar.innerHTML = getSidebarHTML(false);
      document.body.insertBefore(desktopSidebar.firstElementChild, document.body.firstChild);
      
      // Create mobile sidebar
      const mobileSidebar = document.createElement('div');
      mobileSidebar.innerHTML = getSidebarHTML(true);
      document.body.insertBefore(mobileSidebar.firstElementChild, document.querySelector('.admin-sidebar').nextSibling);
    }
    
    // Setup mobile sidebar toggle
    setupMobileSidebar();
  }
  
  // Setup mobile sidebar functionality
  function setupMobileSidebar() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileSidebar = document.getElementById('mobile-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileClose = document.getElementById('mobile-sidebar-close');
    
    function openSidebar() {
      if (mobileSidebar) {
        mobileSidebar.classList.add('open');
      }
      if (sidebarOverlay) {
        sidebarOverlay.classList.remove('hidden');
      }
      document.body.classList.add('overflow-hidden');
    }
    
    function closeSidebar() {
      if (mobileSidebar) {
        mobileSidebar.classList.remove('open');
      }
      if (sidebarOverlay) {
        sidebarOverlay.classList.add('hidden');
      }
      document.body.classList.remove('overflow-hidden');
    }
    
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', openSidebar);
    }
    
    if (mobileClose) {
      mobileClose.addEventListener('click', closeSidebar);
    }
    
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', closeSidebar);
    }
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSidebar();
    });
    
    // Close when clicking a link in mobile sidebar
    if (mobileSidebar) {
      mobileSidebar.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeSidebar);
      });
    }
  }
  
  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }
})();
