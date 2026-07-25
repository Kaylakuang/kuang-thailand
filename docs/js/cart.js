import {
  LOYALTY_SETTINGS,
  SHIPPING_SETTINGS,
  PROMOTION_SETTINGS
} from "./settings.js?v=202607242329";
import {
  $,
  escapeHTML,
  formatCurrency,
  calculateDeposit,
  getProductImage,
  renderSummaryRows,
  showToast
} from "./utils.js?v=202607242329";

const CART_KEY = "kuang-thailand-cart";

export function getCartItems() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch (error) {
    console.warn("Cart parse failed", error);
    return [];
  }
}

export function saveCartItems(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartCount();
}

export function clearCart() {
  saveCartItems([]);
}

export function updateCartCount() {
  const count = getCartItems().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = String(count);
  });
}

export function addToCart(product, quantity = 1) {
  if (!product || !product.id) return;
  const items = getCartItems();
  const index = items.findIndex((item) => item.id === product.id);
  const stock = Number(product.stock || 0);
  const requested = Number(quantity || 1);
  const limit = Number(product.limitPerUser || 0);

  if (stock === 0 || product.status === "已售完") {
    showToast("此商品目前已售完");
    return;
  }

  if (index >= 0) {
    const nextQuantity = items[index].quantity + requested;
    const cappedByStock = stock > 0 ? Math.min(nextQuantity, stock) : nextQuantity;
    items[index].quantity = limit > 0 ? Math.min(cappedByStock, limit) : cappedByStock;
  } else {
    const initial = stock > 0 ? Math.min(requested, stock) : requested;
    items.push({
      id: product.id,
      name: product.name,
      image: getProductImage(product),
      category: product.category,
      description: product.description,
      price: Number(product.price) || 0,
      originalPrice: Number(product.originalPrice) || 0,
      spec: product.spec || "",
      stock,
      isPreorder: product.isPreorder !== false,
      arrivalDate: product.arrivalDate || "",
      deadline: product.deadline || "",
      limitPerUser: limit,
      promotionText: product.promotionText || "",
      status: product.status || "開放下單",
      quantity: limit > 0 ? Math.min(initial, limit) : initial
    });
  }
  saveCartItems(items);
  showToast("已加入購物車");
}

export function changeCartQuantity(productId, quantity) {
  const next = getCartItems()
    .map((item) => {
      if (item.id !== productId) return item;
      const stock = Number(item.stock || 0);
      const limit = Number(item.limitPerUser || 0);
      const max = Math.max(1, Math.min(stock || 999, limit || 999));
      return { ...item, quantity: Math.max(1, Math.min(Number(quantity) || 1, max)) };
    })
    .filter((item) => item.quantity > 0);
  saveCartItems(next);
}

export function removeCartItem(productId) {
  saveCartItems(getCartItems().filter((item) => item.id !== productId));
}

export function calculateCartTotals(items = getCartItems(), options = {}) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  let discount = 0;

  if (PROMOTION_SETTINGS.buyXGetY.enabled) {
    const groupSize = PROMOTION_SETTINGS.buyXGetY.buy + PROMOTION_SETTINGS.buyXGetY.get;
    discount = items.reduce((sum, item) => {
      const freeQty = Math.floor(Number(item.quantity || 0) / groupSize) * PROMOTION_SETTINGS.buyXGetY.get;
      return sum + freeQty * Number(item.price || 0);
    }, 0);
  }

  const afterDiscount = Math.max(subtotal - discount, 0);
  const shippingFee = afterDiscount >= SHIPPING_SETTINGS.freeShippingThreshold || afterDiscount === 0
    ? 0
    : SHIPPING_SETTINGS.defaultShippingFee;
  const beforePointsTotal = afterDiscount + shippingFee;
  const requestedPoints = Math.max(0, Math.floor(Number(options.pointsRedeemed || 0)));
  const pointsRedeemed = LOYALTY_SETTINGS.enabled
    ? Math.min(requestedPoints, Math.floor(beforePointsTotal / LOYALTY_SETTINGS.pointValue))
    : 0;
  const pointsDiscount = pointsRedeemed * LOYALTY_SETTINGS.pointValue;
  const total = Math.max(beforePointsTotal - pointsDiscount, 0);
  const pointsEarned = LOYALTY_SETTINGS.enabled
    ? Math.floor(total / LOYALTY_SETTINGS.dollarsPerPoint)
    : 0;
  return {
    subtotal,
    discount,
    shippingFee,
    pointsRedeemed,
    pointsDiscount,
    pointsEarned,
    total,
    ...calculateDeposit(total)
  };
}

export function renderCartSummary(target, totals = calculateCartTotals()) {
  const element = typeof target === "string" ? $(target) : target;
  if (!element) return;
  element.innerHTML = `
    <h2>訂單金額</h2>
    <div class="summary-list">${renderSummaryRows(totals)}</div>
  `;
}

function renderCartItems(items) {
  if (!items.length) {
    return `
      <div class="empty-state empty-state--cart">
        <p>購物車目前是空的。</p>
        <a class="btn btn--primary" href="products.html">前往選購</a>
      </div>
    `;
  }

  return items.map((item) => `
    <article class="cart-item" data-cart-item="${escapeHTML(item.id)}">
      <img src="${escapeHTML(item.image || "assets/product-placeholder.svg")}" alt="${escapeHTML(item.name)}" onerror="this.src='assets/product-placeholder.svg'">
      <div>
        <h3>${escapeHTML(item.name)}</h3>
        <p class="muted">${escapeHTML(item.spec || item.category || "")}</p>
        <p class="price">${formatCurrency(item.price)} <span class="muted">x ${item.quantity}</span></p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px">
          <div class="quantity-control" aria-label="${escapeHTML(item.name)} 數量">
            <button type="button" data-cart-decrease="${escapeHTML(item.id)}" aria-label="減少數量">-</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-increase="${escapeHTML(item.id)}" aria-label="增加數量">+</button>
          </div>
          <button class="btn btn--ghost btn--small" type="button" data-cart-remove="${escapeHTML(item.id)}">刪除</button>
          <strong style="margin-left:auto">${formatCurrency(item.price * item.quantity)}</strong>
        </div>
      </div>
    </article>
  `).join("");
}

export function initCartPage() {
  updateCartCount();
  const root = $("#cart-root");
  const summary = $("#cart-summary");
  if (!root || !summary) return;

  const paint = () => {
    const items = getCartItems();
    root.innerHTML = renderCartItems(items);
    renderCartSummary(summary, calculateCartTotals(items));
    const checkoutButton = $("#checkout-button");
    if (checkoutButton) checkoutButton.toggleAttribute("disabled", !items.length);
  };

  root.addEventListener("click", (event) => {
    const decrease = event.target.closest("[data-cart-decrease]");
    const increase = event.target.closest("[data-cart-increase]");
    const remove = event.target.closest("[data-cart-remove]");
    if (decrease) {
      const id = decrease.dataset.cartDecrease;
      const item = getCartItems().find((entry) => entry.id === id);
      if (item && item.quantity <= 1) removeCartItem(id);
      else changeCartQuantity(id, (item?.quantity || 1) - 1);
      paint();
    }
    if (increase) {
      const id = increase.dataset.cartIncrease;
      const item = getCartItems().find((entry) => entry.id === id);
      changeCartQuantity(id, (item?.quantity || 1) + 1);
      paint();
    }
    if (remove) {
      removeCartItem(remove.dataset.cartRemove);
      paint();
    }
  });

  paint();
}
