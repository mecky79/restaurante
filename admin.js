   // admin.js — Admin Dashboard (Supabase async version)
document.addEventListener('DOMContentLoaded', async () => {
  DB.init();

  // ── Panel switching ────────────────────────
  window.switchPanel = function(name) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const panel = document.getElementById('panel-' + name);
    if (panel) panel.classList.add('active');
    const link = document.querySelector('[data-panel="' + name + '"]');
    if (link) link.classList.add('active');
    const renderers = {
      dashboard:     renderDashboard,
      orders:        renderOrders,
      delivery:      renderDelivery,
      'menu-mgr':    renderMenuMgr,
      stock:         renderStock,
      analytics:     renderAnalytics,
      'slider-mgr':  renderSliderMgr,
      notifications: renderNotifications,
    };
    if (renderers[name]) renderers[name]();
    document.getElementById('admin-sidebar').classList.remove('open');
  };

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); switchPanel(link.dataset.panel); });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('admin-sidebar').classList.toggle('open');
  });

  // ── Date ──────────────────────────────────
  const dateEl = document.getElementById('dash-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-KE', {
      weekday:'long', year:'numeric', month:'long', day:'numeric'
    });
  }

  // ── Helpers ───────────────────────────────
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function statusClass(s) {
    return { 'Pending':'badge-pending','Confirmed':'badge-confirmed','Preparing':'badge-preparing',
      'Out for Delivery':'badge-delivering','Delivered':'badge-delivered','Cancelled':'badge-cancelled' }[s] || 'badge-pending';
  }
  function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-KE',{day:'numeric',month:'short'}) + ' ' +
           d.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'});
  }
  function toast(msg, type) {
    const t = document.createElement('div');
    t.className   = 'bb-toast bb-toast-' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('bb-toast-show'), 10);
    setTimeout(() => { t.classList.remove('bb-toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
  }
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  function showLoading(id, cols) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<tr><td colspan="${cols}" class="empty-row">⏳ Loading...</td></tr>`;
  }

  // ── Notification badges ───────────────────
  async function updateBadges() {
    const orders  = await DB.getOrders();
    const pending = orders.filter(o => o.status === 'Pending').length;
    const notifs  = await DB.getUnreadCount();

    const pb = document.getElementById('pending-badge');
    if (pb) { pb.textContent = pending; pb.style.display = pending ? 'inline-flex' : 'none'; }
    const nb = document.getElementById('sidebar-notif-count');
    if (nb) { nb.textContent = notifs; nb.style.display = notifs ? 'inline-flex' : 'none'; }
  }
  updateBadges();
  setInterval(updateBadges, 10000);

  // ══════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════
  async function renderDashboard() {
    setText('stat-total-orders', '⏳');
    setText('stat-revenue',      '⏳');
    setText('stat-pending',      '⏳');
    setText('stat-delivered',    '⏳');
    setText('stat-views',        '⏳');
    setText('stat-confirmed-rev','⏳');

    const [orders, revenue, analytics] = await Promise.all([
      DB.getOrders(),
      DB.getRevenue(),
      DB.getAnalytics(),
    ]);

    const pending = orders.filter(o => o.status === 'Pending').length;

    setText('stat-total-orders',  orders.length);
    setText('stat-revenue',       'KSh ' + revenue.total.toLocaleString());
    setText('stat-pending',       pending);
    setText('stat-delivered',     revenue.deliveredCount);
    setText('stat-views',         analytics.pageViews);
    setText('stat-confirmed-rev', 'KSh ' + revenue.confirmed.toLocaleString());

    // Recent orders
    const tbody = document.querySelector('#dash-recent-orders tbody');
    if (tbody) {
      const recent = orders.slice(0, 8);
      tbody.innerHTML = recent.length ? recent.map(o => `
        <tr onclick="openOrderModal('${esc(o.id)}')" style="cursor:pointer">
          <td><code>${esc(o.id)}</code></td>
          <td>${esc(o.customer && o.customer.name)}</td>
          <td>KSh ${(o.total||0).toLocaleString()}</td>
          <td><span class="status-badge ${statusClass(o.status)}">${esc(o.status)}</span></td>
          <td>${formatTime(o.timestamp)}</td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="empty-row">No orders yet</td></tr>';
    }

    renderLowStock();
    updateBadges();
  }

  function renderLowStock() {
    const stock   = DB.getStock();
    const menu    = DB.getMenu();
    const allItems = Object.values(menu).flat();
    const low      = allItems.filter(item => (stock[item.id] || 0) <= 5);
    const card     = document.getElementById('low-stock-card');
    const list     = document.getElementById('low-stock-list');
    if (!list) return;
    card.style.display = low.length ? '' : 'none';
    list.innerHTML = low.map(item => `
      <div class="low-stock-row">
        <span class="low-stock-name">${esc(item.name)}</span>
        <span class="low-stock-qty ${(stock[item.id]||0) === 0 ? 'out-of-stock' : 'nearly-out'}">
          ${(stock[item.id]||0) === 0 ? 'OUT OF STOCK' : stock[item.id] + ' left'}
        </span>
      </div>
    `).join('');
  }

  // ══════════════════════════════════════════
  // ORDERS
  // ══════════════════════════════════════════
  async function renderOrders() {
    showLoading('orders-table', 9);
    const filter = document.getElementById('order-filter').value;
    const search = (document.getElementById('order-search').value || '').toLowerCase();

    let orders = await DB.getOrders();
    if (filter) orders = orders.filter(o => o.status === filter);
    if (search) orders = orders.filter(o =>
      o.id.toLowerCase().includes(search) ||
      (o.customer && o.customer.name && o.customer.name.toLowerCase().includes(search))
    );

    const tbody = document.querySelector('#orders-table tbody');
    if (!tbody) return;

    tbody.innerHTML = orders.length ? orders.map(o => `
      <tr>
        <td><code class="order-id-link" onclick="openOrderModal('${esc(o.id)}')">${esc(o.id)}</code></td>
        <td>${esc(o.customer && o.customer.name)}<br><small>${esc(o.customer && o.customer.phone)}</small></td>
        <td>${esc(o.location)}</td>
        <td class="items-cell">${(o.items||[]).map(it => esc(it.name) + ' x' + it.qty).join(', ')}</td>
        <td>KSh ${(o.total||0).toLocaleString()}</td>
        <td><span class="status-badge ${statusClass(o.status)}">${esc(o.status)}</span></td>
        <td class="instructions-cell">${esc(o.instructions) || '<em style="opacity:.5">None</em>'}</td>
        <td>${formatTime(o.timestamp)}</td>
        <td>
          <select class="status-select mini-select" data-order-id="${esc(o.id)}">
            ${['Pending','Confirmed','Preparing','Out for Delivery','Delivered','Cancelled']
              .map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="9" class="empty-row">No orders found</td></tr>';

    tbody.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        await DB.updateOrderStatus(sel.dataset.orderId, sel.value);
        toast('Status updated to ' + sel.value, 'success');
        updateBadges();
        renderOrders();
      });
    });
  }

  document.getElementById('order-filter').addEventListener('change', renderOrders);
  document.getElementById('order-search').addEventListener('input', renderOrders);

  // ── Order modal ───────────────────────────
  window.openOrderModal = async function(orderId) {
    const modal   = document.getElementById('order-modal');
    const content = document.getElementById('modal-content');
    modal.style.display = 'flex';
    content.innerHTML   = '<p style="text-align:center;padding:40px;color:var(--gold-light)">⏳ Loading order...</p>';

    const order = await DB.getOrderById(orderId);
    if (!order) { content.innerHTML = '<p style="color:#e74c3c;padding:20px">Order not found.</p>'; return; }

    content.innerHTML = `
      <div class="modal-header">
        <h2>Order Details</h2>
        <div class="modal-order-id">${esc(order.id)}</div>
      </div>
      <div class="modal-section">
        <h3>Customer</h3>
        <p><strong>Name:</strong> ${esc(order.customer && order.customer.name)}</p>
        <p><strong>Phone:</strong> ${esc(order.customer && order.customer.phone)}</p>
        ${order.customer && order.customer.email ? `<p><strong>Email:</strong> ${esc(order.customer.email)}</p>` : ''}
        <p><strong>Delivery Area:</strong> ${esc(order.location)}</p>
        <p><strong>Placed:</strong> ${formatTime(order.timestamp)}</p>
      </div>
      <div class="modal-section">
        <h3>Items Ordered</h3>
        <table class="modal-items-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${(order.items||[]).map(it => `
              <tr>
                <td>${esc(it.name)}</td>
                <td>${it.qty}</td>
                <td>${it.price !== null ? 'KSh ' + it.price : 'Custom'}</td>
                <td>${it.subtotal !== null ? 'KSh ' + (it.subtotal||0).toLocaleString() : 'TBC'}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr><td colspan="3"><strong>Total</strong></td><td><strong>KSh ${(order.total||0).toLocaleString()}</strong></td></tr>
          </tfoot>
        </table>
      </div>
      ${order.instructions ? `
        <div class="modal-section">
          <h3>Special Instructions</h3>
          <p class="modal-instructions">${esc(order.instructions)}</p>
        </div>` : ''}
      <div class="modal-section">
        <h3>Status &amp; Delivery</h3>
        <div class="modal-status-row">
          <select class="admin-select" id="modal-status-sel">
            ${['Pending','Confirmed','Preparing','Out for Delivery','Delivered','Cancelled']
              .map(s => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <label style="color:var(--gold-light);margin-top:10px;display:block">Delivery Note</label>
        <textarea id="modal-delivery-note" class="admin-textarea"
          placeholder="e.g. Rider on the way, gate 3">${esc(order.delivery_note||'')}</textarea>
        <button class="btn-gold" id="modal-save-btn" style="margin-top:10px">Save Changes</button>
      </div>
    `;

    document.getElementById('modal-save-btn').addEventListener('click', async () => {
      const newStatus = document.getElementById('modal-status-sel').value;
      const note      = document.getElementById('modal-delivery-note').value.trim();
      await DB.updateOrderStatus(order.id, newStatus, note);
      toast('Order updated', 'success');
      updateBadges();
      modal.style.display = 'none';
      renderOrders();
    });
  };

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    document.getElementById('order-modal').style.display = 'none';
  });
  document.getElementById('order-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  // ══════════════════════════════════════════
  // DELIVERY CONTROL
  // ══════════════════════════════════════════
  async function renderDelivery() {
    const grid = document.getElementById('delivery-grid');
    if (!grid) return;
    grid.innerHTML = '<p style="color:var(--gold-light);padding:20px">⏳ Loading...</p>';

    const orders = (await DB.getOrders()).filter(o =>
      ['Pending','Confirmed','Preparing','Out for Delivery'].includes(o.status)
    );

    if (!orders.length) {
      grid.innerHTML = '<p style="color:var(--gold-light);padding:20px">No active orders right now.</p>';
      return;
    }

    grid.innerHTML = orders.map(o => `
      <div class="delivery-card">
        <div class="delivery-card-header">
          <code>${esc(o.id)}</code>
          <span class="status-badge ${statusClass(o.status)}">${esc(o.status)}</span>
        </div>
        <div class="delivery-customer">
          <strong>${esc(o.customer && o.customer.name)}</strong>
          <a href="tel:${esc(o.customer && o.customer.phone)}" class="delivery-call-btn">
            📞 ${esc(o.customer && o.customer.phone)}
          </a>
        </div>
        <div class="delivery-location">📍 ${esc(o.location)}</div>
        <div class="delivery-items">${(o.items||[]).map(it => esc(it.name) + ' x' + it.qty).join(' · ')}</div>
        <div class="delivery-total">KSh ${(o.total||0).toLocaleString()}</div>
        ${o.instructions ? `<div class="delivery-instructions">📝 ${esc(o.instructions)}</div>` : ''}
        <div class="delivery-actions">
          ${['Confirmed','Preparing','Out for Delivery','Delivered'].map(s => `
            <button class="delivery-action-btn ${o.status === s ? 'btn-current' : ''}"
              data-order="${esc(o.id)}" data-status="${s}">${s}</button>
          `).join('')}
        </div>
        <div class="delivery-note-row">
          <input type="text" class="admin-input delivery-note-input" data-order="${esc(o.id)}"
            placeholder="Delivery note..." value="${esc(o.delivery_note||'')}">
          <button class="btn-gold delivery-note-save" data-order="${esc(o.id)}">Save</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.delivery-action-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await DB.updateOrderStatus(btn.dataset.order, btn.dataset.status);
        toast('Status → ' + btn.dataset.status, 'success');
        updateBadges();
        renderDelivery();
      });
    });

    grid.querySelectorAll('.delivery-note-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const input = grid.querySelector(`.delivery-note-input[data-order="${btn.dataset.order}"]`);
        const order = await DB.getOrderById(btn.dataset.order);
        if (order) {
          await DB.updateOrderStatus(order.id, order.status, input.value.trim());
          toast('Note saved', 'success');
        }
      });
    });
  }

  // ══════════════════════════════════════════
  // MENU MANAGER (local)
  // ══════════════════════════════════════════
   const CAT_LABELS = {
  'fast-food':  '<i class="fas fa-burger"></i> Fast Food',
  'quick-bites':'<i class="fas fa-pizza-slice"></i> Quick Bites',
  'bakery':     '<i class="fas fa-cake-candles"></i> Bakery Treats',
  'special':    '<i class="fas fa-star"></i> Special Orders',
  'drinks':     '<i class="fas fa-mug-saucer"></i> Drinks',
  'combos':     '<i class="fas fa-fire"></i> Combo Deals',
};

  function renderMenuMgr() {
    const menu      = DB.getMenu();
    const container = document.getElementById('menu-mgr-list');
    if (!container) return;

    container.innerHTML = Object.entries(menu).map(([catId, items]) => `
      <div class="admin-card menu-cat-card">
        <div class="card-header"><h2>${CAT_LABELS[catId]||catId}</h2></div>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Item Name</th><th>Price (KSh)</th><th>Actions</th></tr></thead>
            <tbody>
              ${items.map(item => `
                <tr id="menu-row-${esc(item.id)}">
                  <td><input type="text" class="admin-input inline-input menu-name-input"
                    data-cat="${catId}" data-id="${esc(item.id)}" value="${esc(item.name)}"></td>
                  <td><input type="number" class="admin-input inline-input menu-price-input" style="width:100px"
                    data-cat="${catId}" data-id="${esc(item.id)}" value="${item.price !== null ? item.price : ''}"></td>
                  <td>
                    <button class="btn-gold btn-sm menu-save-btn" data-cat="${catId}" data-id="${esc(item.id)}">Save</button>
                    <button class="btn-danger btn-sm menu-del-btn" data-cat="${catId}" data-id="${esc(item.id)}">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.menu-save-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row   = document.getElementById('menu-row-' + btn.dataset.id);
        const name  = row.querySelector('.menu-name-input').value.trim();
        const price = parseFloat(row.querySelector('.menu-price-input').value) || null;
        DB.updateMenuItem(btn.dataset.cat, btn.dataset.id, { name, price });
        toast('Item updated', 'success');
        renderMenuMgr();
      });
    });

    container.querySelectorAll('.menu-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this item?')) return;
        DB.deleteMenuItem(btn.dataset.cat, btn.dataset.id);
        toast('Item deleted', 'success');
        renderMenuMgr();
      });
    });
  }

  document.getElementById('add-menu-item-btn').addEventListener('click', () => {
    const f = document.getElementById('add-item-form');
    f.style.display = f.style.display === 'none' ? '' : 'none';
  });
  document.getElementById('cancel-new-item').addEventListener('click', () => {
    document.getElementById('add-item-form').style.display = 'none';
  });
  document.getElementById('save-new-item').addEventListener('click', () => {
    const cat   = document.getElementById('new-item-cat').value;
    const name  = document.getElementById('new-item-name').value.trim();
    const price = parseFloat(document.getElementById('new-item-price').value) || null;
    if (!name) { toast('Please enter an item name', 'error'); return; }
    DB.addMenuItem(cat, { name, price });
    toast('Item added!', 'success');
    document.getElementById('add-item-form').style.display = 'none';
    document.getElementById('new-item-name').value  = '';
    document.getElementById('new-item-price').value = '';
    renderMenuMgr();
  });

  // ══════════════════════════════════════════
  // STOCK (local)
  // ══════════════════════════════════════════
  function renderStock() {
    const stock = DB.getStock();
    const menu  = DB.getMenu();
    const tbody = document.querySelector('#stock-table tbody');
    if (!tbody) return;

    const rows = [];
    Object.entries(menu).forEach(([catId, items]) => {
      items.forEach(item => {
        const qty = stock[item.id] || 0;
        const statusLabel = qty === 0 ? '🔴 Out of Stock' : qty <= 5 ? '🟡 Low Stock' : '🟢 Good';
        rows.push(`
          <tr>
            <td>${esc(item.name)}</td>
            <td>${CAT_LABELS[catId]||catId}</td>
            <td><input type="number" class="admin-input inline-input stock-qty-input"
              style="width:80px" data-id="${esc(item.id)}" value="${qty}" min="0"></td>
            <td class="${qty===0?'stock-out':qty<=5?'stock-low':'stock-ok'}">${statusLabel}</td>
          </tr>
        `);
      });
    });
    tbody.innerHTML = rows.join('');
  }

  document.getElementById('save-stock-btn').addEventListener('click', () => {
    document.querySelectorAll('.stock-qty-input').forEach(input => {
      DB.updateStock(input.dataset.id, parseInt(input.value) || 0);
    });
    toast('Stock saved!', 'success');
    renderStock();
    renderLowStock();
  });

  // ══════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════
  async function renderAnalytics() {
    setText('an-views',   '⏳');
    setText('an-orders',  '⏳');
    setText('an-revenue', '⏳');
    setText('an-avg',     '⏳');

    const [orders, analytics, revenue] = await Promise.all([
      DB.getOrders(),
      DB.getAnalytics(),
      DB.getRevenue(),
    ]);

    const avg = orders.length ? Math.round(revenue.total / orders.length) : 0;
    setText('an-views',   analytics.pageViews);
    setText('an-orders',  orders.length);
    setText('an-revenue', 'KSh ' + revenue.total.toLocaleString());
    setText('an-avg',     'KSh ' + avg.toLocaleString());

    // Top items
    const itemCount = {};
    orders.forEach(o => (o.items||[]).forEach(it => {
      itemCount[it.name] = (itemCount[it.name] || 0) + it.qty;
    }));
    const topItems = Object.entries(itemCount).sort((a,b) => b[1]-a[1]).slice(0,10);
    const topEl    = document.getElementById('top-items-list');
    if (topEl) {
      const max = topItems[0]?.[1] || 1;
      topEl.innerHTML = topItems.length ? topItems.map(([name, qty]) => `
        <div class="analytics-bar-row">
          <span class="analytics-bar-label">${esc(name)}</span>
          <div class="analytics-bar-track">
            <div class="analytics-bar-fill" style="width:${(qty/max*100).toFixed(1)}%"></div>
          </div>
          <span class="analytics-bar-val">${qty}</span>
        </div>
      `).join('') : '<p style="opacity:.5">No order data yet</p>';
    }

    // Status breakdown
    const statusCount = {};
    orders.forEach(o => { statusCount[o.status] = (statusCount[o.status]||0) + 1; });
    const sbEl = document.getElementById('status-breakdown');
    if (sbEl) {
      sbEl.innerHTML = Object.entries(statusCount).map(([s,c]) => `
        <div class="stat-pill">
          <span class="status-badge ${statusClass(s)}">${esc(s)}</span>
          <span class="stat-pill-count">${c} order${c !== 1 ? 's' : ''}</span>
        </div>
      `).join('') || '<p style="opacity:.5">No data yet</p>';
    }

    // Revenue by location
    const locRev = {};
    orders.forEach(o => { locRev[o.location] = (locRev[o.location]||0) + (o.total||0); });
    const locEl  = document.getElementById('location-breakdown');
    if (locEl) {
      const sorted = Object.entries(locRev).sort((a,b) => b[1]-a[1]);
      const maxRev = sorted[0]?.[1] || 1;
      locEl.innerHTML = sorted.length ? sorted.map(([loc, rev]) => `
        <div class="analytics-bar-row">
          <span class="analytics-bar-label">${esc(loc)}</span>
          <div class="analytics-bar-track">
            <div class="analytics-bar-fill" style="width:${(rev/maxRev*100).toFixed(1)}%;background:var(--gold)"></div>
          </div>
          <span class="analytics-bar-val">KSh ${rev.toLocaleString()}</span>
        </div>
      `).join('') : '<p style="opacity:.5">No data yet</p>';
    }
  }

  // ══════════════════════════════════════════
  // SLIDER MANAGER (local)
  // ══════════════════════════════════════════
  function renderSliderMgr() {
    const images = DB.getSliderImages();
    const list   = document.getElementById('slider-img-list');
    if (!list) return;
    list.innerHTML = images.length ? images.map((img, i) => `
      <div class="slider-img-row">
        <span class="slider-img-name">${esc(img)}</span>
        <button class="btn-danger btn-sm" onclick="removeSliderImg(${i})">Remove</button>
      </div>
    `).join('') : '<p style="opacity:.5;margin-bottom:12px">No custom images added yet.</p>';
  }

  window.removeSliderImg = function(idx) {
    const imgs = DB.getSliderImages();
    imgs.splice(idx, 1);
    DB.saveSliderImages(imgs);
    toast('Image removed', 'success');
    renderSliderMgr();
  };

  document.getElementById('add-slider-img-btn').addEventListener('click', () => {
    const input = document.getElementById('new-slider-img');
    const val   = input.value.trim();
    if (!val) { toast('Please enter a filename', 'error'); return; }
    const imgs  = DB.getSliderImages();
    imgs.push(val);
    DB.saveSliderImages(imgs);
    input.value = '';
    toast('Image added!', 'success');
    renderSliderMgr();
  });

  // ══════════════════════════════════════════
  // NOTIFICATIONS
  // ══════════════════════════════════════════
  async function renderNotifications() {
    const el = document.getElementById('notifications-list');
    if (el) el.innerHTML = '<p style="opacity:.5;padding:20px">⏳ Loading...</p>';

    const notes = await DB.getNotifications();
    if (!el) return;
    el.innerHTML = notes.length ? notes.map(n => `
      <div class="notif-card ${n.read ? '' : 'notif-unread'}">
        <div class="notif-msg">${esc(n.message)}</div>
        <div class="notif-time">${formatTime(n.time)}</div>
        ${n.order_id ? `<button class="btn-gold btn-sm" onclick="openOrderModal('${esc(n.order_id)}')">View Order</button>` : ''}
      </div>
    `).join('') : '<p style="opacity:.5;padding:20px">No notifications yet.</p>';

    updateBadges();
  }

  document.getElementById('mark-read-btn').addEventListener('click', async () => {
    await DB.markNotificationsRead();
    renderNotifications();
    toast('All marked as read', 'success');
  });

  // ── Logout ────────────────────────────────
  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('bb_admin_session');
    window.location.replace('admin-login.html');
  });

  // ── Also update index.html comment section ─
  // (handled separately in index.html inline script)

  // ── Initial render ────────────────────────
  renderDashboard();
});
