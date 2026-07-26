import {
  LOYALTY_SETTINGS,
  SHIPPING_SETTINGS,
  PROMOTION_SETTINGS
} from "./settings.js?v=202607252330";
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

export function getCartItemKey(item = {}) {
  return `${String(item.id || "")}::${String(item.variant || "")}`;
}

export function addToCart(product, quantity = 1, selectedVariant = "") {
  if (!product || !product.id) return;
  const items = getCartItems();
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variant = String(selectedVariant || "").trim();
  if (variants.length && !variants.includes(variant)) {
    showToast("請先選擇商品款式");
    return;
  }
  const cartKey = getCartItemKey({ id: product.id, variant });
  const index = items.findIndex((item) => getCartItemKey(item) === cartKey);
  const stock = Number(product.stock || 0);
  const requested = Math.max(1, Number(quantity || 1));
  const limit = Number(product.limitPerUser || 0);
  const productMaximum = Math.min(stock > 0 ? stock : 999, limit > 0 ? limit : 999);
  const otherVariantQuantity = items.reduce((sum, item, itemIndex) => (
    item.id === product.id && itemIndex !== index
      ? sum + Number(item.quantity || 0)
      : sum
  ), 0);
  const availableForVariant = Math.max(0, productMaximum - otherVariantQuantity);

  if (stock === 0 || product.status === "已售完") {
    showToast("此商品目前已售完");
    return;
  }

  if (index >= 0) {
    const nextQuantity = items[index].quantity + requested;
    items[index].quantity = Math.min(nextQuantity, availableForVariant);
  } else {
    const initial = Math.min(requested, availableForVariant);
    if (initial <= 0) {
      showToast("已達此商品的庫存或限購數量");
      return;
    }
    items.push({
      id: product.id,
      cartKey,
      name: product.name,
      image: getProductImage(product),
      category: product.category,
      description: product.description,
      price: Number(product.price) || 0,
      originalPrice: Number(product.originalPrice) || 0,
      spec: product.spec || "",
      variant,
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

export function changeCartQuantity(cartKey, quantity) {
  const items = getCartItems();
  const target = items.find((item) => getCartItemKey(item) === cartKey);
  if (!target) return;
  const otherVariantQuantity = items.reduce((sum, item) => (
    item.id === target.id && getCartItemKey(item) !== cartKey
      ? sum + Number(item.quantity || 0)
      : sum
  ), 0);
  const stock = Number(target.stock || 0);
  const limit = Number(target.limitPerUser || 0);
  const productMaximum = Math.min(stock > 0 ? stock : 999, limit > 0 ? limit : 999);
  const maximumForVariant = Math.max(1, productMaximum - otherVariantQuantity);
  const next = items
    .map((item) => {
      if (getCartItemKey(item) !== cartKey) return item;
      return { ...item, quantity: Math.max(1, Math.min(Number(quantity) || 1, maximumForVariant)) };
    })
    .filter((item) => item.quantity > 0);
  saveCartItems(next);
}

export function removeCartItem(cartKey) {
  saveCartItems(getCartItems().filter((item) => getCartItemKey(item) !== cartKey));
}

export function getMaxRedeemablePoints(productAmount) {
  const amount = Math.max(0, Math.floor(Number(productAmount) || 0));
  if (amount < 100) return 0;
  if (amount < 500) return 50;
  return Math.floor(amount / 500) * 100;
}

export function getManualGiftQuantity(item = {}, items = [item]) {
  const promotionText = String(item.promotionText || "");
  const promotion = PROMOTION_SETTINGS.buyXGetY;
  if (!promotion.enabled || !promotionText.includes(promotion.label)) return 0;
  const matchingItems = items.filter((entry) => (
    entry.id === item.id
    && String(entry.promotionText || "").includes(promotion.label)
  ));
  if (getCartItemKey(matchingItems[0]) !== getCartItemKey(item)) return 0;
  const purchasedQuantity = matchingItems.reduce(
    (sum, entry) => sum + Math.max(0, Math.floor(Number(entry.quantity) || 0)),
    0
  );
  return Math.floor(purchasedQuantity / promotion.buy) * promotion.get;
}

export function calculateCartTotals(items = getCartItems(), options = {}) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const discount = 0;
  const afterDiscount = Math.max(subtotal - discount, 0);
  const shippingFee = afterDiscount >= SHIPPING_SETTINGS.freeShippingThreshold || afterDiscount === 0
    ? 0
    : SHIPPING_SETTINGS.defaultShippingFee;
  const maxRedeemablePoints = LOYALTY_SETTINGS.enabled
    ? getMaxRedeemablePoints(afterDiscount)
    : 0;
  const requestedPoints = Math.max(0, Math.floor(Number(options.pointsRedeemed || 0)));
  const pointsRedeemed = LOYALTY_SETTINGS.enabled
    ? Math.min(
        requestedPoints,
        maxRedeemablePoints,
        Math.floor(afterDiscount / LOYALTY_SETTINGS.pointValue)
      )
    : 0;
  const pointsDiscount = pointsRedeemed * LOYALTY_SETTINGS.pointValue;
  const productTotalAfterPoints = Math.max(afterDiscount - pointsDiscount, 0);
  const total = productTotalAfterPoints + shippingFee;
  const pointsEarned = LOYALTY_SETTINGS.enabled
    ? Math.floor(productTotalAfterPoints / LOYALTY_SETTINGS.dollarsPerPoint)
    : 0;
  return {
    subtotal,
    discount,
    shippingFee,
    maxRedeemablePoints,
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

  return items.map((item) => {
    const cartKey = getCartItemKey(item);
    const giftQuantity = getManualGiftQuantity(item, items);
    return `
      <article class="cart-item" data-cart-item="${escapeHTML(cartKey)}">
        <img src="${escapeHTML(item.image || "assets/product-placeholder.svg")}" alt="${escapeHTML(item.name)}" onerror="this.src='assets/product-placeholder.svg'">
        <div>
          <h3>${escapeHTML(item.name)}</h3>
          <p class="muted">${escapeHTML(item.spec || item.category || "")}</p>
          ${item.variant ? `<p class="muted">款式：${escapeHTML(item.variant)}</p>` : ""}
          <p class="price">${formatCurrency(item.price)} <span class="muted">x ${item.quantity}</span></p>
          ${giftQuantity > 0 ? `<p class="muted">🎁 符合買五送一，出貨加贈 ${giftQuantity} 件（贈品不計價）</p>` : ""}
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px">
            <div class="quantity-control" aria-label="${escapeHTML(item.name)} 數量">
              <button type="button" data-cart-decrease="${escapeHTML(cartKey)}" aria-label="減少數量">-</button>
              <span>${item.quantity}</span>
              <button type="button" data-cart-increase="${escapeHTML(cartKey)}" aria-label="增加數量">+</button>
            </div>
            <button class="btn btn--ghost btn--small" type="button" data-cart-remove="${escapeHTML(cartKey)}">刪除</button>
            <strong style="margin-left:auto">${formatCurrency(item.price * item.quantity)}</strong>
          </div>
        </div>
      </article>
    `;
  }).join("");
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
      const cartKey = decrease.dataset.cartDecrease;
      const item = getCartItems().find((entry) => getCartItemKey(entry) === cartKey);
      if (item && item.quantity <= 1) removeCartItem(cartKey);
      else changeCartQuantity(cartKey, (item?.quantity || 1) - 1);
      paint();
    }
    if (increase) {
      const cartKey = increase.dataset.cartIncrease;
      const item = getCartItems().find((entry) => getCartItemKey(entry) === cartKey);
      changeCartQuantity(cartKey, (item?.quantity || 1) + 1);
      paint();
    }
    if (remove) {
      removeCartItem(remove.dataset.cartRemove);
      paint();
    }
  });

  paint();
}
