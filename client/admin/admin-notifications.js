(function(){
  const API = window.API || '';
  // create UI
  function createNotificationUi(){
    // Find a sensible header container. Try several selectors to support varying page layouts.
    let header = document.querySelector('header') || document.querySelector('div.flex.items-center.justify-between.h-16') || document.querySelector('div[class*="header"]') || document.querySelector('div[class*="top"]') || document.body;
    if (!header) header = document.body;
    const container = document.createElement('div');
    container.id = 'admin-notification-container';
    container.className = 'relative ml-4 flex items-center';
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
    if (logoutBtn && logoutBtn.parentNode) {
      logoutBtn.parentNode.insertBefore(container, logoutBtn);
    } else {
      // Try to find a right-side container in the header (common patterns)
      const rightSide = header.querySelector('.flex.items-center') || header.querySelector('.ml-4') || header.querySelector('.justify-end');
      if (rightSide) rightSide.appendChild(container);
      else header.appendChild(container);
    }

    // event handlers
    const btn = document.getElementById('admin-notif-btn');
    const dropdown = document.getElementById('admin-notif-dropdown');
    btn.addEventListener('click', ()=>{
      dropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', (e)=>{
      if(!container.contains(e.target)) dropdown.classList.add('hidden');
    });

    document.getElementById('admin-notif-markall').addEventListener('click', async ()=>{
      try{
        const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
        await fetch(`${API}/api/admin/notifications/mark-all-read`, { method: 'POST', headers: token?{ 'Authorization': `Bearer ${token}` }:{} });
        await refresh();
      }catch(e){ console.debug('mark all read failed', e); }
    });
    document.getElementById('admin-notif-refresh').addEventListener('click', refresh);
  }

  async function fetchNotifications(){
    try{
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/admin/notifications`, { headers: token?{ 'Authorization': `Bearer ${token}` }:{} });
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
          const token = localStorage.getItem('token');
          await fetch(`${API}/api/admin/notifications/${id}/read`, { method: 'PUT', headers: token?{ 'Authorization': `Bearer ${token}` }:{} });
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

  // init
  try{ createNotificationUi(); refresh(); setInterval(refresh, 60000); }catch(e){ console.debug('admin-notif init failed', e); }
})();
