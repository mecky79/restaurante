 // script.js — Order page: multi-select cart, live calculator, order submission
document.addEventListener('DOMContentLoaded', async () => {
  DB.init();

  // ── Category config ───────────────────────
  const CATEGORIES = [
    { id: 'fast-food',   label: '🍟 Fast Food'     },
    { id: 'quick-bites', label: '🍕 Quick Bites'   },
    { id: 'bakery',      label: '🧁 Bakery Treats'  },
    { id: 'special',     label: '🎂 Special Orders' },
    { id: 'drinks',      label: '🥤 Drinks'         },
    { id: 'combos',      label: '⭐ Combo Deals'    },
  ];

  // ── Build price map from menu ─────────────
  const PRICE_MAP = {};
  const menu = DB.getMenu();
  Object.values(menu).flat().forEach(item => { PRICE_MAP[item.id] = item.price; });

  // ── Build menu groups dynamically ─────────
  const menuContainer = document.getElementById('menu-groups');
  if (!menuContainer) return;

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

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-item-btn';
    addBtn.textContent = '+ Add item';
    addBtn.addEventListener('click', () => addItemRow(cat.id, itemsWrap));
    group.appendChild(addBtn);

    menuContainer.appendChild(group);
    addItemRow(cat.id, itemsWrap);
  });

  function addItemRow(catId, container) {
    const row    = document.createElement('div');
    row.className = 'qty-row item-row';

    const items  = menu[catId] || [];
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
    removeBtn.addEventListener('click', () => { row.remove(); recalculate(); });

    row.append(select, qtyLabel, qtyInput, removeBtn);
    container.appendChild(row);

    select.addEventListener('change', recalculate);
    qtyInput.addEventListener('input', recalculate);
  }

  // ── Recalculate cart ──────────────────────
  function recalculate() {
    let total       = 0;
    let hasCustom   = false;
    const cartItems = [];

    document.querySelectorAll('.item-row').forEach(row => {
      const sel = row.querySelector('select');
      const qty = parseInt(row.querySelector('.qty-input').value) || 1;
      const val = sel ? sel.value : '';
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

    renderCart(cartItems);

    const display = document.getElementById('display');
    const note    = document.getElementById('total-note');
    if (!display || !note) return;

    if (!cartItems.length) {
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
    form.addEventListener('submit', async (e) => {
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

      const items     = [];
      let   total     = 0;
      let   hasCustom = false;

      document.querySelectorAll('.item-row').forEach(row => {
        const sel  = row.querySelector('select');
        const qty  = parseInt(row.querySelector('.qty-input').value) || 1;
        const val  = sel ? sel.value : '';
        if (!val) return;

        const name2 = sel.options[sel.selectedIndex].text.split('—')[0].trim();
        const price = PRICE_MAP[val];

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

      // Disable button while saving
      const submitBtn = form.querySelector('.submit-btn');
      submitBtn.disabled    = true;
      submitBtn.textContent = '⏳ Placing order...';

      const orderId = await DB.saveOrder({
        customer: { name, email, phone },
        items,
        total,
        instructions: notes,
        location,
      });

      submitBtn.disabled    = false;
      submitBtn.textContent = '🛒 Place Order';

      if (orderId) {
        showToast('Order placed! Your ID: ' + orderId, 'success');
        form.reset();
        recalculate();
        showConfirmation(orderId, total, hasCustom);
      } else {
        showToast('Something went wrong. Please try again.', 'error');
      }
    });
  }

  // ── Order confirmation popup ──────────────
  function showConfirmation(orderId, total, hasCustom) {
    const existing = document.getElementById('order-confirmation');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.id = 'order-confirmation';
    box.innerHTML = `
      <div class="confirm-inner">
        <div class="confirm-icon">✅</div>
        <h2>Order Placed!</h2>
        <p>Your order ID is:</p>
        <div class="confirm-id">${orderId}</div>
        <p>Save this ID to track your order.</p>
        ${hasCustom ? '<p class="confirm-note">Our team will contact you to confirm custom item pricing.</p>' : ''}
        <p class="confirm-total">Estimated Total: KSh ${total.toLocaleString()}${hasCustom ? '+' : ''}</p>
        <a href="index.html#track" class="confirm-track-btn">Track My Order</a>
        <button class="confirm-close" onclick="this.closest('#order-confirmation').remove()">Close</button>
      </div>
    `;
    document.body.appendChild(box);
  }

  // ── Toast ─────────────────────────────────
  function showToast(msg, type) {
    const t = document.createElement('div');
    t.className   = 'bb-toast bb-toast-' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('bb-toast-show'), 10);
    setTimeout(() => { t.classList.remove('bb-toast-show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  // Page transition
  document.querySelectorAll('.page-transition-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href    = link.href;
      const overlay = document.getElementById('page-transition-overlay');
      overlay.classList.add('overlay-active');
      setTimeout(() => { window.location.href = href; }, 450);
    });
  });

  recalculate();
  DB.trackPageView();
});
