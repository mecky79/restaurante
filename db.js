 // =============================================
// db.js — Bakes and Bites
// Supabase cloud database layer
// =============================================

var DB = (() => {

  // ── Supabase config ───────────────────────
  const SUPABASE_URL = 'https://oyrubwniizgwsweggegc.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cnVid25paXpnd3N3ZWdnZWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjQ5OTUsImV4cCI6MjA5NzE0MDk5NX0.btv71sMVs9ABVLfc7ErRKXutuFZTUIaUqClqRJ-TSiY';

  const HEADERS = {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Prefer':        'return=representation',
  };

  // ── Base fetch wrapper ────────────────────
  async function query(path, options = {}) {
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
        headers: { ...HEADERS, ...(options.headers || {}) },
        ...options,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Supabase error:', err);
        return null;
      }
      const text = await res.text();
      return text ? JSON.parse(text) : [];
    } catch (e) {
      console.error('Network error:', e);
      return null;
    }
  }

  // ── ID generator ──────────────────────────
  function generateID() {
    const ts   = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
    return 'BB-' + ts + '-' + rand;
  }

  // ── Default menu ──────────────────────────
  const DEFAULT_MENU = {
    'fast-food': [
      { id:'classic-burger',  name:'Classic Burger',         price:250  },
      { id:'cheese-burger',   name:'Cheese Burger',          price:300  },
      { id:'chicken-burger',  name:'Chicken Burger',         price:320  },
      { id:'hot-dog',         name:'Hot Dog (Loaded)',        price:200  },
      { id:'fries-regular',   name:'French Fries (Regular)', price:150  },
      { id:'fries-large',     name:'French Fries (Large)',   price:250  },
      { id:'wings',           name:'Chicken Wings (6pcs)',   price:400  },
      { id:'samosa',          name:'Samosa (Beef/Chicken)',  price:70   },
    ],
    'quick-bites': [
      { id:'mini-pizza',    name:'Mini Pizza',      price:350 },
      { id:'sausage-roll',  name:'Sausage Roll',    price:120 },
      { id:'chicken-wrap',  name:'Chicken Wrap',    price:300 },
      { id:'chapati-beans', name:'Chapati + Beans', price:200 },
    ],
    'bakery': [
      { id:'cupcakes',   name:'Cupcakes (Vanilla/Chocolate)', price:100 },
      { id:'doughnuts',  name:'Doughnuts (Glazed/Chocolate)', price:80  },
      { id:'slice-cake', name:'Slice Cake',                   price:150 },
      { id:'cookies',    name:'Cookies (2 pcs)',              price:100 },
      { id:'muffins',    name:'Muffins',                      price:120 },
    ],
    'special': [
      { id:'birthday-cake', name:'Birthday Cake (1kg+)', price:1500 },
      { id:'custom-cake',   name:'Custom Cake',          price:null },
    ],
    'drinks': [
      { id:'soda',       name:'Soda (500ml)',              price:100 },
      { id:'juice',      name:'Fresh Juice',               price:150 },
      { id:'milkshake',  name:'Milkshake (Vanilla/Choc)', price:250 },
      { id:'tea-coffee', name:'Tea / Coffee',              price:80  },
    ],
    'combos': [
      { id:'combo-1', name:'Burger + Fries + Soda',        price:450 },
      { id:'combo-2', name:'Hot Dog + Juice',               price:300 },
      { id:'combo-3', name:'Chicken Wings + Fries + Soda', price:600 },
    ],
  };

  // ── Local storage helpers ─────────────────
  function localGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function localSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ── Init ──────────────────────────────────
  function init() {
    if (!localGet('bb_menu'))  localSet('bb_menu', DEFAULT_MENU);
    if (!localGet('bb_stock')) {
      const s = {};
      Object.values(DEFAULT_MENU).flat().forEach(item => { s[item.id] = 50; });
      localSet('bb_stock', s);
    }
  }

  // ══════════════════════════════════════════
  // ORDERS
  // ══════════════════════════════════════════
  async function saveOrder(orderData) {
    const id  = generateID();
    const row = {
      id,
      status:        'Pending',
      customer:      orderData.customer,
      items:         orderData.items,
      total:         orderData.total || 0,
      instructions:  orderData.instructions || '',
      location:      orderData.location || '',
      delivery_note: '',
    };

    const result = await query('orders', {
      method: 'POST',
      body:   JSON.stringify(row),
    });

    if (result) {
      // Deduct stock locally
      orderData.items.forEach(item => deductStock(item.id, item.qty));

      // Save notification
      await addNotification({
        type:     'order',
        message:  'New order ' + id + ' from ' + orderData.customer.name + ' — KSh ' + (orderData.total || 0).toLocaleString(),
        order_id: id,
        read:     false,
      });

      // Send email notifications
      try {
        await fetch(SUPABASE_URL + '/functions/v1/send-order-email', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer ' + SUPABASE_KEY,
          },
          body: JSON.stringify({
            order: {
              id,
              timestamp:    new Date().toISOString(),
              status:       'Pending',
              customer:     orderData.customer,
              items:        orderData.items,
              total:        orderData.total || 0,
              instructions: orderData.instructions || '',
              location:     orderData.location || '',
            },
          }),
        });
      } catch(e) {
        console.error('Email notification failed:', e);
      }
    }

    return result ? id : null;
  }

  async function getOrders() {
    const data = await query('orders?order=timestamp.desc');
    return data || [];
  }

  async function updateOrderStatus(orderId, status, deliveryNote) {
    const body = { status };
    if (deliveryNote !== undefined) body.delivery_note = deliveryNote;
    await query('orders?id=eq.' + encodeURIComponent(orderId), {
      method: 'PATCH',
      body:   JSON.stringify(body),
    });
  }

  async function getOrderById(id) {
    const data = await query('orders?id=eq.' + encodeURIComponent(id));
    return (data && data.length) ? data[0] : null;
  }

  async function getRevenue() {
    const orders    = await getOrders();
    const total     = orders.reduce((s, o) => s + (o.total || 0), 0);
    const delivered = orders.filter(o => o.status === 'Delivered');
    const confirmed = delivered.reduce((s, o) => s + (o.total || 0), 0);
    return {
      total,
      confirmed,
      orderCount:     orders.length,
      deliveredCount: delivered.length,
    };
  }

  // ══════════════════════════════════════════
  // COMMENTS
  // ══════════════════════════════════════════
  async function saveComment(text, author) {
    const row    = { author: author || 'Anonymous', text };
    const result = await query('comments', {
      method: 'POST',
      body:   JSON.stringify(row),
    });
    return result ? result[0] : null;
  }

  async function getComments() {
    const data = await query('comments?order=timestamp.desc');
    return data || [];
  }

  // ══════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════
  async function trackPageView() {
    await _incrementAnalytics('page_views');
  }

  async function trackOrderClick() {
    await _incrementAnalytics('order_clicks');
  }

  async function _incrementAnalytics(field) {
    const data = await query('analytics?id=eq.1');
    if (data && data.length) {
      const current = data[0][field] || 0;
      const body    = {};
      body[field]   = current + 1;
      await query('analytics?id=eq.1', {
        method:  'PATCH',
        headers: { ...HEADERS, 'Prefer': 'return=minimal' },
        body:    JSON.stringify(body),
      });
    }
  }

  async function getAnalytics() {
    const data = await query('analytics?id=eq.1');
    return (data && data.length)
      ? { pageViews: data[0].page_views, orderClicks: data[0].order_clicks }
      : { pageViews: 0, orderClicks: 0 };
  }

  // ══════════════════════════════════════════
  // NOTIFICATIONS
  // ══════════════════════════════════════════
  async function addNotification(n) {
    await query('notifications', {
      method: 'POST',
      body:   JSON.stringify(n),
    });
  }

  async function getNotifications() {
    const data = await query('notifications?order=time.desc&limit=50');
    return data || [];
  }

  async function markNotificationsRead() {
    await query('notifications?read=eq.false', {
      method:  'PATCH',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ read: true }),
    });
  }

  async function getUnreadCount() {
    const data = await query('notifications?read=eq.false&select=id');
    return Array.isArray(data) ? data.length : 0;
  }

  // ══════════════════════════════════════════
  // MENU (localStorage)
  // ══════════════════════════════════════════
  function getMenu()    { return localGet('bb_menu') || DEFAULT_MENU; }

  function updateMenuItem(category, itemId, newData) {
    const menu = getMenu();
    if (!menu[category]) return;
    const idx  = menu[category].findIndex(i => i.id === itemId);
    if (idx !== -1) menu[category][idx] = { ...menu[category][idx], ...newData };
    localSet('bb_menu', menu);
  }

  function addMenuItem(category, item) {
    const menu = getMenu();
    if (!menu[category]) menu[category] = [];
    item.id    = category + '-' + Date.now();
    menu[category].push(item);
    localSet('bb_menu', menu);
  }

  function deleteMenuItem(category, itemId) {
    const menu = getMenu();
    if (!menu[category]) return;
    menu[category] = menu[category].filter(i => i.id !== itemId);
    localSet('bb_menu', menu);
  }

  // ══════════════════════════════════════════
  // STOCK (localStorage)
  // ══════════════════════════════════════════
  function getStock() {
    const s = localGet('bb_stock');
    if (s) return s;
    const def = {};
    Object.values(DEFAULT_MENU).flat().forEach(item => { def[item.id] = 50; });
    return def;
  }

  function updateStock(itemId, qty) {
    const stock    = getStock();
    stock[itemId]  = qty;
    localSet('bb_stock', stock);
  }

  function deductStock(itemId, qty) {
    const stock    = getStock();
    stock[itemId]  = Math.max(0, (stock[itemId] || 0) - qty);
    localSet('bb_stock', stock);
  }

  // ══════════════════════════════════════════
  // SLIDER IMAGES (localStorage)
  // ══════════════════════════════════════════
  function getSliderImages()     { return localGet('bb_slider_images') || []; }
  function saveSliderImages(arr) { localSet('bb_slider_images', arr); }

  // ── Public API ────────────────────────────
  return {
    init,
    generateID,
    saveOrder, getOrders, updateOrderStatus, getOrderById, getRevenue,
    saveComment, getComments,
    trackPageView, trackOrderClick, getAnalytics,
    addNotification, getNotifications, markNotificationsRead, getUnreadCount,
    getMenu, updateMenuItem, addMenuItem, deleteMenuItem,
    getStock, updateStock, deductStock,
    getSliderImages, saveSliderImages,
    DEFAULT_MENU,
  };

})();
