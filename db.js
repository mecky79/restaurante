// =============================================
// db.js — Bakes and Bites Local Database
// Uses localStorage as the persistent store.
// Exports a DB object used by all pages.
// =============================================

var DB = (() => {

  // ── Keys ──────────────────────────────────
  const KEYS = {
    orders:       'bb_orders',
    menu:         'bb_menu',
    comments:     'bb_comments',
    analytics:    'bb_analytics',
    stock:        'bb_stock',
    sliderImages: 'bb_slider_images',
    notifications:'bb_notifications',
  };

  // ── Helpers ───────────────────────────────
  function get(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  function set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function generateID() {
    const ts   = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
    return 'BB-' + ts + '-' + rand;
  }

  // ── Default Menu ──────────────────────────
  const DEFAULT_MENU = {
    'fast-food': [
      { id:'classic-burger',  name:'Classic Burger',          price:250 },
      { id:'cheese-burger',   name:'Cheese Burger',           price:300 },
      { id:'chicken-burger',  name:'Chicken Burger',          price:320 },
      { id:'hot-dog',         name:'Hot Dog (Loaded)',         price:200 },
      { id:'fries-regular',   name:'French Fries (Regular)',  price:150 },
      { id:'fries-large',     name:'French Fries (Large)',    price:250 },
      { id:'wings',           name:'Chicken Wings (6pcs)',    price:400 },
      { id:'samosa',          name:'Samosa (Beef/Chicken)',   price:70  },
    ],
    'quick-bites': [
      { id:'mini-pizza',     name:'Mini Pizza',      price:350 },
      { id:'sausage-roll',   name:'Sausage Roll',    price:120 },
      { id:'chicken-wrap',   name:'Chicken Wrap',    price:300 },
      { id:'chapati-beans',  name:'Chapati + Beans', price:200 },
    ],
    'bakery': [
      { id:'cupcakes',    name:'Cupcakes (Vanilla/Chocolate)', price:100  },
      { id:'doughnuts',   name:'Doughnuts (Glazed/Chocolate)', price:80   },
      { id:'slice-cake',  name:'Slice Cake',                   price:150  },
      { id:'cookies',     name:'Cookies (2 pcs)',              price:100  },
      { id:'muffins',     name:'Muffins',                      price:120  },
    ],
    'special': [
      { id:'birthday-cake', name:'Birthday Cake (1kg+)', price:1500 },
      { id:'custom-cake',   name:'Custom Cake',          price:null },
    ],
    'drinks': [
      { id:'soda',       name:'Soda (500ml)',                price:100 },
      { id:'juice',      name:'Fresh Juice',                 price:150 },
      { id:'milkshake',  name:'Milkshake (Vanilla/Choc)',   price:250 },
      { id:'tea-coffee', name:'Tea / Coffee',                price:80  },
    ],
    'combos': [
      { id:'combo-1', name:'Burger + Fries + Soda',          price:450 },
      { id:'combo-2', name:'Hot Dog + Juice',                 price:300 },
      { id:'combo-3', name:'Chicken Wings + Fries + Soda',   price:600 },
    ],
  };

  // ── Default Stock (units per item) ────────
  const DEFAULT_STOCK = {};
  Object.values(DEFAULT_MENU).flat().forEach(item => {
    DEFAULT_STOCK[item.id] = 50; // start each item with 50 units
  });

  // ── Init ──────────────────────────────────
  function init() {
    if (!get(KEYS.orders))    set(KEYS.orders, []);
    if (!get(KEYS.comments))  set(KEYS.comments, []);
    if (!get(KEYS.notifications)) set(KEYS.notifications, []);
    if (!get(KEYS.menu))      set(KEYS.menu, DEFAULT_MENU);
    if (!get(KEYS.stock))     set(KEYS.stock, DEFAULT_STOCK);
    if (!get(KEYS.analytics)) set(KEYS.analytics, { pageViews: 0, orderClicks: 0 });
    if (!get(KEYS.sliderImages)) set(KEYS.sliderImages, []);
  }

  // ── Orders ────────────────────────────────
  function saveOrder(orderData) {
    const orders = get(KEYS.orders) || [];
    const order  = {
      id:           generateID(),
      timestamp:    new Date().toISOString(),
      status:       'Pending',
      customer:     orderData.customer,
      items:        orderData.items,
      total:        orderData.total,
      instructions: orderData.instructions || '',
      location:     orderData.location,
      deliveryNote: '',
    };
    orders.unshift(order); // newest first
    set(KEYS.orders, orders);

    // Deduct stock
    orderData.items.forEach(item => {
      deductStock(item.id, item.qty);
    });

    // Add notification
    addNotification({
      type: 'order',
      message: `New order ${order.id} from ${order.customer.name} — KSh ${order.total.toLocaleString()}`,
      orderId: order.id,
      read: false,
      time: order.timestamp,
    });

    return order.id;
  }

  function getOrders() { return get(KEYS.orders) || []; }

  function updateOrderStatus(orderId, status, deliveryNote) {
    const orders = getOrders();
    const idx    = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      orders[idx].status = status;
      if (deliveryNote !== undefined) orders[idx].deliveryNote = deliveryNote;
      set(KEYS.orders, orders);
    }
  }

  function getOrderById(id) {
    return getOrders().find(o => o.id === id) || null;
  }

  // ── Comments ─────────────────────────────
  function saveComment(text, author) {
    const comments = get(KEYS.comments) || [];
    const comment  = {
      id:        Date.now(),
      author:    author || 'Anonymous',
      text:      text,
      timestamp: new Date().toISOString(),
    };
    comments.unshift(comment);
    set(KEYS.comments, comments);
    return comment;
  }

  function getComments() { return get(KEYS.comments) || []; }

  // ── Menu CRUD ─────────────────────────────
  function getMenu() { return get(KEYS.menu) || DEFAULT_MENU; }

  function updateMenuItem(category, itemId, newData) {
    const menu = getMenu();
    if (!menu[category]) return;
    const idx = menu[category].findIndex(i => i.id === itemId);
    if (idx !== -1) menu[category][idx] = { ...menu[category][idx], ...newData };
    set(KEYS.menu, menu);
  }

  function addMenuItem(category, item) {
    const menu = getMenu();
    if (!menu[category]) menu[category] = [];
    item.id = category + '-' + Date.now();
    menu[category].push(item);
    set(KEYS.menu, menu);
  }

  function deleteMenuItem(category, itemId) {
    const menu = getMenu();
    if (!menu[category]) return;
    menu[category] = menu[category].filter(i => i.id !== itemId);
    set(KEYS.menu, menu);
  }

  // ── Stock ─────────────────────────────────
  function getStock() { return get(KEYS.stock) || DEFAULT_STOCK; }

  function updateStock(itemId, qty) {
    const stock = getStock();
    stock[itemId] = qty;
    set(KEYS.stock, stock);
  }

  function deductStock(itemId, qty) {
    const stock  = getStock();
    const cur    = stock[itemId] || 0;
    stock[itemId] = Math.max(0, cur - qty);
    set(KEYS.stock, stock);
  }

  // ── Analytics ─────────────────────────────
  function trackPageView() {
    const a = get(KEYS.analytics) || { pageViews: 0, orderClicks: 0 };
    a.pageViews++;
    set(KEYS.analytics, a);
  }

  function trackOrderClick() {
    const a = get(KEYS.analytics) || { pageViews: 0, orderClicks: 0 };
    a.orderClicks++;
    set(KEYS.analytics, a);
  }

  function getAnalytics() { return get(KEYS.analytics) || { pageViews: 0, orderClicks: 0 }; }

  // ── Notifications ─────────────────────────
  function addNotification(n) {
    const notes = get(KEYS.notifications) || [];
    notes.unshift(n);
    set(KEYS.notifications, notes.slice(0, 50)); // keep latest 50
  }

  function getNotifications() { return get(KEYS.notifications) || []; }

  function markNotificationsRead() {
    const notes = getNotifications().map(n => ({ ...n, read: true }));
    set(KEYS.notifications, notes);
  }

  function getUnreadCount() {
    return getNotifications().filter(n => !n.read).length;
  }

  // ── Revenue ───────────────────────────────
  function getRevenue() {
    const orders = getOrders();
    const delivered = orders.filter(o => o.status === 'Delivered');
    const total     = orders.reduce((s, o) => s + (o.total || 0), 0);
    const confirmed = delivered.reduce((s, o) => s + (o.total || 0), 0);
    return { total, confirmed, orderCount: orders.length, deliveredCount: delivered.length };
  }

  // ── Slider Images ─────────────────────────
  function getSliderImages() { return get(KEYS.sliderImages) || []; }
  function saveSliderImages(arr) { set(KEYS.sliderImages, arr); }

  // ── Public API ────────────────────────────
  return {
    init,
    generateID,
    // orders
    saveOrder, getOrders, updateOrderStatus, getOrderById, getRevenue,
    // comments
    saveComment, getComments,
    // menu
    getMenu, updateMenuItem, addMenuItem, deleteMenuItem,
    // stock
    getStock, updateStock, deductStock,
    // analytics
    trackPageView, trackOrderClick, getAnalytics,
    // notifications
    addNotification, getNotifications, markNotificationsRead, getUnreadCount,
    // slider
    getSliderImages, saveSliderImages,
    // default menu (read-only ref)
    DEFAULT_MENU,
  };
})();
