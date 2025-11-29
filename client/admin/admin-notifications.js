(function(){
  const API = window.API || '';
  // create UI
  function createNotificationUi(){
    // Find a sensible header container. Try several selectors to support varying page layouts.
    let header = document.querySelector('header') || document.querySelector('div.flex.items-center.justify-between.h-16') || document.querySelector('div[class*="header"]') || document.querySelector('div[class*="top"]') || document.body;
    if (!header) header = document.body;
    const container = document.createElement('div');
    container.id = 'admin-notification-container';
    // add a small right margin so the bell visually aligns with Logout
    container.className = 'relative ml-4 mr-3 flex items-center';
    container.innerHTML = `
      <button id="admin-notif-btn" class="relative p-2 rounded hover:bg-gray-100">
        <i class="fas fa-bell"></i>
        <span id="admin-notif-badge" class="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full px-1" style="display:none;">0</span>
      </button>
      <div id="admin-notif-dropdown" class="hidden absolute right-0 mt-2 w-96 bg-white border rounded shadow-lg z-50">
        <div class="p-3 border-b flex items-center justify-between">
          <strong>Notifications</strong>
          <div>
            <button id="admin-notif-markall" class="text-xs text-indigo-600">Mark all read</button>
            <button id="admin-notif-refresh" class="ml-2 text-xs text-gray-600">Refresh</button>
          </div>
        </div>
        <div id="admin-notif-list" class="max-h-64 overflow-auto"></div>
        <div class="p-2 text-center text-xs text-gray-500 border-t">Notifications show system alerts and inventory warnings.</div>
      </div>
    `;
    // Prefer inserting before a global logout button so the bell is always next to Logout.
    const logoutBtn = document.querySelector('#logout-btn') || header.querySelector('#logout-btn');
    if (logoutBtn) {
      const parent = logoutBtn.parentNode;
      // If logout button is a direct child of header (common with justify-between),
      // create a right-side wrapper so adding the bell doesn't become a middle child.
      if (parent === header) {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-center gap-4';
        // move logoutBtn into wrapper
        header.appendChild(wrapper);
        wrapper.appendChild(logoutBtn);
        // insert container before logout inside wrapper
        wrapper.insertBefore(container, logoutBtn);
      } else {
        // insert before logout in its existing container
        parent.insertBefore(container, logoutBtn);
      }
    } else {
      // Try to find a right-side container in the header (common patterns)
      const rightSide = header.querySelector('.flex.items-center') || header.querySelector('.ml-4') || header.querySelector('.justify-end');
      if (rightSide) rightSide.appendChild(container);
      else header.appendChild(container);

      // If logout button is created later (some pages build header via JS), observe and move the container when it appears
      const observer = new MutationObserver(() => {
        const laterLogout = document.querySelector('#logout-btn') || header.querySelector('#logout-btn');
        if (laterLogout && laterLogout.parentNode) {
          const p = laterLogout.parentNode;
          if (p === header) {
            const wrapper = document.createElement('div');
            wrapper.className = 'flex items-center gap-4';
            header.appendChild(wrapper);
            wrapper.appendChild(laterLogout);
            wrapper.insertBefore(container, laterLogout);
          } else {
            p.insertBefore(container, laterLogout);
          }
          observer.disconnect();
        }
      });
      observer.observe(header, { childList: true, subtree: true });
    }

    // event handlers
    const btn = document.getElementById('admin-notif-btn');
    const dropdown = document.getElementById('admin-notif-dropdown');
    btn.addEventListener('click', ()=>{
      // toggle visibility then adjust positioning so it never overflows the viewport
      const isHidden = dropdown.classList.contains('hidden');
      if (isHidden) {
        dropdown.classList.remove('hidden');
        adjustDropdownPosition();
      } else {
        dropdown.classList.add('hidden');
      }
    });
    // reposition on window resize or scroll while open
    window.addEventListener('resize', ()=>{ if(!dropdown.classList.contains('hidden')) adjustDropdownPosition(); });
    window.addEventListener('scroll', ()=>{ if(!dropdown.classList.contains('hidden')) adjustDropdownPosition(); }, true);

    // compute a fixed-position placement for the dropdown to avoid header/overflow issues
    function adjustDropdownPosition(){
      try{
        const btnRect = btn.getBoundingClientRect();
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        // set width constrained to viewport
        const maxWidth = Math.min(360, vw - 32);
        dropdown.style.position = 'fixed';
        dropdown.style.width = maxWidth + 'px';
        // prefer aligning the dropdown's right edge with button's right edge
        const preferredLeft = Math.min(Math.max(8, btnRect.right - maxWidth), vw - maxWidth - 8);
        dropdown.style.left = preferredLeft + 'px';
        dropdown.style.top = (btnRect.bottom + 8) + 'px';
        dropdown.style.right = 'auto';
        dropdown.style.zIndex = 9999;
        dropdown.style.maxHeight = Math.max(160, window.innerHeight - (btnRect.bottom + 32)) + 'px';
      }catch(e){ console.debug('adjustDropdownPosition failed', e); }
    }
    document.addEventListener('click', (e)=>{
      if(!container.contains(e.target)) dropdown.classList.add('hidden');
    });

    document.getElementById('admin-notif-markall').addEventListener('click', async ()=>{
      try{
        const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
        if (!token) { console.debug('mark all read skipped: no auth token'); return; }
        await fetch(`${API}/api/admin/notifications/mark-all-read`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        await refresh();
      }catch(e){ console.debug('mark all read failed', e); }
    });
    document.getElementById('admin-notif-refresh').addEventListener('click', refresh);
  }

  async function fetchNotifications(){
    try{
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      if (!token) {
        // Not authenticated as admin — avoid unauthenticated request that causes 403 in console
        return [];
      }
      const res = await fetch(`${API}/api/admin/notifications`, { headers: { 'Authorization': `Bearer ${token}` } });
      if(!res.ok) return [];
      const j = await res.json();
      return j.success ? (j.data || []) : [];
    }catch(e){ console.debug('fetch notifications error', e); return []; }
  }

  function renderNotifications(list){
    const badge = document.getElementById('admin-notif-badge');
    const listEl = document.getElementById('admin-notif-list');
    if(!listEl) return;
    listEl.innerHTML = '';
    const unread = list.filter(n => !n.read);
    if(unread.length){ badge.style.display = 'inline-block'; badge.textContent = String(unread.length); }
    else { badge.style.display = 'none'; }

    if(list.length===0){ listEl.innerHTML = '<div class="p-3 text-xs text-gray-500">No notifications</div>'; return; }
    list.forEach(n=>{
      const row = document.createElement('div');
      row.className = 'p-3 border-b flex items-start gap-2';
      row.innerHTML = `
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <div class="text-sm font-semibold">${escapeHtml(n.title)}</div>
            <div class="text-xs text-gray-400">${new Date(n.createdAt).toLocaleString()}</div>
          </div>
          <div class="text-xs text-gray-700 mt-1">${escapeHtml(stripHtml(n.body || ''))}</div>
          <div class="mt-2 flex gap-2">
            <button data-id="${n._id}" class="admin-notif-mark text-xs text-indigo-600">Mark read</button>
          </div>
        </div>
      `;
      if(n.read) row.style.opacity = '0.6';
      listEl.appendChild(row);
    });
    // attach mark handlers
    Array.from(listEl.querySelectorAll('.admin-notif-mark')).forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const id = e.target.dataset.id;
        try{
          const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
          if (!token) { console.debug('mark read skipped: no auth token'); return; }
          await fetch(`${API}/api/admin/notifications/${id}/read`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
          await refresh();
        }catch(err){ console.debug('mark read failed', err); }
      });
    });
  }

  function stripHtml(html){ return (html||'').replace(/<[^>]*>/g,'').slice(0,200); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

  async function refresh(){
    const list = await fetchNotifications();
    renderNotifications(list);
  }

  // init: ensure DOM is ready and retry insertion if logout button appears later
  function initNotifications(){
    try{
      createNotificationUi();
      refresh();
      setInterval(refresh, 60000);
    }catch(e){ console.debug('admin-notif init failed', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotifications);
  } else {
    initNotifications();
  }
})();
