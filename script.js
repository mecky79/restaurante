// script.js — Order page: multi-select cart, live calculator, order submission
document.addEventListener('DOMContentLoaded', () => {
  if (typeof DB !== 'undefined') DB.init();

  // ── Category config ───────────────────────
  const CATEGORIES = [
    { id: 'fast-food',    label: '🍟 Fast Food' },
    { id: 'quick-bites',  label: '🍕 Quick Bites' },
    { id: 'bakery',       label: '🧁 Bakery Treats' },
    { id: 'special',      label: '🎂 Special Orders' },
    { id: 'drinks',       label: '🥤 Drinks' },
    { id: 'combos',       label: '⭐ Combo Deals' },
  ];

  // ── Price map (built from DB or inline) ──
  const PRICE_MAP = {};
  if (typeof DB !== 'undefined') {
    const menu = DB.getMenu();
    Object.values(menu).flat().forEach(item => {
      PRICE_MAP[item.id] = item.price;
    });
  } else {
    // fallback static prices
    Object.assign(PRICE_MAP, {
      "classic-burger":250,"cheese-burger":300,"chicken-burger":320,
      "hot-dog":200,"fries-regular":150,"fries-large":250,"wings":400,"samosa":70,
      "mini-pizza":350,"sausage-roll":120,"chicken-wrap":300,"chapati-beans":200,
      "cupcakes":100,"doughnuts":80,"slice-cake":150,"cookies":100,"muffins":120,
      "birthday-cake":1500,"custom-cake":null,
      "soda":100,"juice":150,"milkshake":250,"tea-coffee":80,
      "combo-1":450,"combo-2":300,"combo-3":600,
    });
  }

  // ── Cart state: Map<category-id, Map<item-id, qty>> ──
  // Each category now supports MULTIPLE selected items.
  const cartState = {};
  CATEGORIES.forEach(c => { cartState[c.id] = {}; });

  // ── Build the multi-select rows dynamically ──
  const menuSection = document.querySelector('.menu-section');
  if (!menuSection) return;

  const menuContainer = document.getElementById('menu-groups');
  if (!menuContainer) return;

  const menu = (typeof DB !== 'undefined') ? DB.getMenu() : null;

  CATEGORIES.forEach(cat => {
    const group = document.createElement('div');
    group.className = 'menu-group';
    group.dataset.category = cat.id;

    const label = document.createElement('span');
    label.className = 'category-label';
    label.textContent = cat.label;
    group.appendChild(label);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'category-items';
    group.appendChild(itemsWrap);

    // "Add another" button
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-item-btn';
    addBtn.textContent = '+ Add item';
    addBtn.addEventListener('click', () => addItemRow(cat.id, itemsWrap));
    group.appendChild(addBtn);

    menuContainer.appendChild(group);

    // Add first row automatically
    addItemRow(cat.id, itemsWrap);
  });

  function addItemRow(catId, container) {
    const row    = document.createElement('div');
    row.className = 'qty-row item-row';

    // Build options for this category
    const items  = menu ? (menu[catId] || []) : getStaticItems(catId);
    const select = document.createElement('select');
    select.innerHTML = '<option value="">-- Select item --</option>' +
      items.map(it =>
        `<option value="${it.id}">${it.name}${it.price ? ' — KSh ' + it.price : ' — Price on request'}</option>`
      ).join('');
    select.style.flex = '1';

    const qtyLabel = document.createElement('span');
    qtyLabel.className = 'qty-label';
    qtyLabel.textContent = 'Qty:';

    const qtyInput = document.createElement('input');
    qtyInput.type      = 'number';
    qtyInput.className = 'qty-input';
    qtyInput.min       = 1;
    qtyInput.max       = 20;
    qtyInput.value     = 1;

    const removeBtn = document.createElement('button');
    removeBtn.type      = 'button';
    removeBtn.className = 'remove-item-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title     = 'Remove this item';
    removeBtn.addEventListener('click', () => {
      row.remove();
      recalculate();
    });

    row.append(select, qtyLabel, qtyInput, removeBtn);
    container.appendChild(row);

    select.addEventListener('change', recalculate);
    qtyInput.addEventListener('input', recalculate);
  }

  function getStaticItems(catId) {
    const MAP = {
      'fast-food':   [{id:'classic-burger',name:'Classic Burger',price:250},{id:'cheese-burger',name:'Cheese Burger',price:300},{id:'chicken-burger',name:'Chicken Burger',price:320},{id:'hot-dog',name:'Hot Dog',price:200},{id:'fries-regular',name:'French Fries (Reg)',price:150},{id:'fries-large',name:'French Fries (Lg)',price:250},{id:'wings',name:'Chicken Wings (6pcs)',price:400},{id:'samosa',name:'Samosa',price:70}],
      'quick-bites': [{id:'mini-pizza',name:'Mini Pizza',price:350},{id:'sausage-roll',name:'Sausage Roll',price:120},{id:'chicken-wrap',name:'Chicken Wrap',price:300},{id:'chapati-beans',name:'Chapati + Beans',price:200}],
      'bakery':      [{id:'cupcakes',name:'Cupcakes',price:100},{id:'doughnuts',name:'Doughnuts',price:80},{id:'slice-cake',name:'Slice Cake',price:150},{id:'cookies',name:'Cookies (2pcs)',price:100},{id:'muffins',name:'Muffins',price:120}],
      'special':     [{id:'birthday-cake',name:'Birthday Cake (1kg+)',price:1500},{id:'custom-cake',name:'Custom Cake',price:null}],
      'drinks':      [{id:'soda',name:'Soda (500ml)',price:100},{id:'juice',name:'Fresh Juice',price:150},{id:'milkshake',name:'Milkshake',price:250},{id:'tea-coffee',name:'Tea/Coffee',price:80}],
      'combos':      [{id:'combo-1',name:'Burger + Fries + Soda',price:450},{id:'combo-2',name:'Hot Dog + Juice',price:300},{id:'combo-3',name:'Chicken Wings + Fries + Soda',price:600}],
    };
    return MAP[catId] || [];
  }

  // ── Recalculate ───────────────────────────
  function recalculate() {
    let total        = 0;
    let hasCustom    = false;
    const cartItems  = [];

    document.querySelectorAll('.menu-group').forEach(group => {
      group.querySelectorAll('.item-row').forEach(row => {
        const sel   = row.querySelector('select');
        const qty   = parseInt(row.querySelector('.qty-input').value) || 1;
        const val   = sel.value;
        if (!val) return;

        const name  = sel.options[sel.selectedIndex].text.split('—')[0].trim();
        const price = PRICE_MAP[val];

        if (price === null || price === undefined) {
          hasCustom = true;
          cartItems.push({ id: val, name, qty, price: null, subtotal: null });
        } else {
          const subtotal = price * qty;
          total += subtotal;
          cartItems.push({ id: val, name, qty, price, subtotal });
        }
      });
    });

    renderCart(cartItems);

    const display = document.getElementById('display');
    const note    = document.getElementById('total-note');

    if (!display || !note) return;

    if (cartItems.length === 0) {
      display.value    = 'KSh 0';
      note.textContent = 'Select items above to see your total';
    } else if (hasCustom) {
      display.value    = 'KSh ' + total.toLocaleString() + '+';
      note.textContent = 'Custom cake price confirmed by our team';
    } else {
      display.value    = 'KSh ' + total.toLocaleString();
      note.textContent = 'Delivery fee not included';
    }
  }

  function renderCart(items) {
    const cartList = document.getElementById('cart-list');
    if (!cartList) return;

    if (!items.length) {
      cartList.innerHTML = '<p class="cart-empty">No items selected yet. Start picking above!</p>';
      return;
    }

    cartList.innerHTML = items.map(item => {
      const priceHtml = item.price === null
        ? '<span class="cart-item-custom">Price on request</span>'
        : '<span class="cart-item-price">KSh ' + item.subtotal.toLocaleString() + '</span>';
      return `<div class="cart-item">
        <span class="cart-item-name">${item.name}</span>
        <span class="cart-item-qty">x${item.qty}</span>
        ${priceHtml}
      </div>`;
    }).join('');
  }

  // ── Order submission ──────────────────────
  const form = document.getElementById('order-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name     = document.getElementById('name').value.trim();
      const email    = document.getElementById('email').value.trim();
      const phone    = document.getElementById('number').value.trim();
      const location = document.getElementById('address').value;
      const notes    = document.getElementById('order-notes').value.trim();

      if (!name || !phone || !location) {
        showToast('Please fill in your name, phone, and delivery area.', 'error');
        return;
      }

      // Collect all selected items
      const items     = [];
      let   total     = 0;
      let   hasCustom = false;

      document.querySelectorAll('.item-row').forEach(row => {
        const sel   = row.querySelector('select');
        const qty   = parseInt(row.querySelector('.qty-input').value) || 1;
        const val   = sel ? sel.value : '';
        if (!val) return;

        const name2  = sel.options[sel.selectedIndex].text.split('—')[0].trim();
        const price  = PRICE_MAP[val];

        if (price === null || price === undefined) {
          hasCustom = true;
          items.push({ id: val, name: name2, qty, price: null, subtotal: null });
        } else {
          const sub = price * qty;
          total    += sub;
          items.push({ id: val, name: name2, qty, price, subtotal: sub });
        }
      });

      if (!items.length) {
        showToast('Please select at least one item.', 'error');
        return;
      }

      if (typeof DB !== 'undefined') {
        const orderId = DB.saveOrder({
          customer: { name, email, phone },
          items,
          total: hasCustom ? total : total,
          instructions: notes,
          location,
        });
        showToast('Order placed! Your ID: ' + orderId, 'success');
        form.reset();
        recalculate();

        // Show order confirmation
        showConfirmation(orderId, total, hasCustom);
      } else {
        showToast('Order submitted! (DB not available)', 'success');
        form.reset();
        recalculate();
      }
    });
  }

  function showConfirmation(orderId, total, hasCustom) {
    const existing = document.getElementById('order-confirmation');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.id        = 'order-confirmation';
    box.innerHTML = `
      <div class="confirm-inner">
        <div class="confirm-icon">✅</div>
        <h2>Order Placed!</h2>
        <p>Your order ID is:</p>
        <div class="confirm-id">${orderId}</div>
        <p>Save this ID to track your order below.</p>
        ${hasCustom ? '<p class="confirm-note">Our team will contact you to confirm custom item pricing.</p>' : ''}
        <p class="confirm-total">Estimated Total: KSh ${total.toLocaleString()}${hasCustom ? '+' : ''}</p>
        <a href="index.html#track" class="confirm-track-btn">Track My Order</a>
        <button class="confirm-close" onclick="this.closest('#order-confirmation').remove()">Close</button>
      </div>
    `;
    document.body.appendChild(box);
  }

  // ── Toast helper ──────────────────────────
  function showToast(msg, type) {
    const t = document.createElement('div');
    t.className  = 'bb-toast bb-toast-' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('bb-toast-show'), 10);
    setTimeout(() => { t.classList.remove('bb-toast-show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  recalculate();
  if (typeof DB !== 'undefined') { DB.trackPageView(); DB.trackOrderClick(); }
});
