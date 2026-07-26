import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "./firebase.js";
import { requireAuth, bindLogoutButton } from "./auth.js";
import { BANK_INFO, ORDER_STATUS } from "./settings.js";
import {
  $,
  escapeHTML,
  formatCurrency,
  formatDateTime,
  getParam,
  showToast,
  toTime
} from "./utils.js";

export async function loadOrder(orderId) {
  const snapshot = await getDoc(doc(db, "orders", orderId));
  if (!snapshot.exists()) return null;
  return { ...snapshot.data(), docId: snapshot.id };
}

export async function loadMyOrders(uid) {
  const request = query(collection(db, "orders"), where("userId", "==", uid));
  const snapshot = await getDocs(request);
  return snapshot.docs
    .map((entry) => ({ ...entry.data(), docId: entry.id }))
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
}

export async function initMyOrdersPage() {
  const state = await requireAuth();
  if (!state) return;
  bindLogoutButton();
  const root = $("#orders-root");
  if (!root) return;
  root.innerHTML = '<div class="loading">正在讀取我的訂單...</div>';

  try {
    const orders = await loadMyOrders(state.user.uid);
    if (!orders.length) {
      root.innerHTML = `
        <div class="empty-state">
          <p>目前還沒有訂單。</p>
          <a class="btn btn--primary" href="products.html">前往選購</a>
        </div>
      `;
      return;
    }
    root.innerHTML = orders.map(renderOrderCard).join("");
  } catch (error) {
    console.error(error);
    root.innerHTML = '<div class="empty-state">讀取訂單失敗，請確認已登入且 Firestore Rules 已部署。</div>';
  }
}

export async function initOrderDetailPage() {
  const state = await requireAuth();
  if (!state) return;
  bindLogoutButton();
  const root = $("#order-detail-root");
  const orderId = getParam("orderId");
  if (!root || !orderId) return;
  root.innerHTML = '<div class="loading">正在讀取訂單明細...</div>';

  const order = await loadOrder(orderId);
  if (!order || order.userId !== state.user.uid && state.profile?.role !== "admin") {
    root.innerHTML = '<div class="empty-state">找不到這筆訂單，或你沒有權限查看。</div>';
    return;
  }
  root.innerHTML = renderOrderDetail(order, { success: false });
  bindPaymentCopyButton(root, order);
}

export async function initOrderSuccessPage() {
  const root = $("#order-success-root");
  if (!root) return;
  if (isLocalPreviewMode()) {
    const order = buildPreviewOrder();
    root.innerHTML = renderOrderDetail(order, { success: true });
    bindPaymentCopyButton(root, order);
    return;
  }

  const state = await requireAuth();
  if (!state) return;
  const orderId = getParam("orderId");
  if (!orderId) return;
  root.innerHTML = '<div class="loading">正在整理訂單摘要...</div>';

  const order = await loadOrder(orderId);
  if (!order || order.userId !== state.user.uid) {
    root.innerHTML = '<div class="empty-state">找不到訂單資料。</div>';
    return;
  }
  root.innerHTML = renderOrderDetail(order, { success: true });
  bindPaymentCopyButton(root, order);
}

function paymentUploadHref(order) {
  const params = new URLSearchParams();
  params.set("orderId", order.orderId || "");

  const total = Number(order.total || 0);
  const deposit = Number(order.depositAmount || 0);
  const remaining = Number(order.remainingAmount || 0);

  if (total > 0) params.set("total", String(total));
  if (deposit > 0) params.set("deposit", String(deposit));
  if (remaining >= 0) params.set("remaining", String(remaining));

  return `payment-upload.html?${params.toString()}`;
}

export function renderOrderCard(order) {
  const totals = orderToTotals(order);
  return `
    <article class="order-card order-card--summary">
      <div class="order-card__head">
        <div>
          <p class="eyebrow">ORDER</p>
          <h3><a href="order-detail.html?orderId=${encodeURIComponent(order.orderId)}">${escapeHTML(order.orderId)}</a></h3>
          <p class="muted">下單時間：${formatDateTime(order.createdAt)}</p>
        </div>
      </div>

      <div class="order-card__body">
        <div class="order-card__items" aria-label="商品明細">
          ${renderOrderItemRows(order.items)}
        </div>
        <div class="order-card__money">
          <div><span>訂單金額</span><strong>${formatCurrency(order.total)}</strong></div>
          <div><span>匯款訂金金額</span><strong>${formatCurrency(order.depositAmount)}</strong></div>
          <div><span>尾款</span><strong>${formatCurrency(order.remainingAmount)}</strong></div>
          ${Number(order.loyalty?.pointsEarned || 0) > 0 ? `<div><span>預計累積</span><strong>${Number(order.loyalty.pointsEarned)} 點</strong></div>` : ""}
        </div>
      </div>

      ${renderCompactTimeline(order.orderStatus)}
      <div class="order-card__foot">
        <span>訂金付款方式：${escapeHTML(order.paymentMethod)}</span>
        <span>收件方式：${escapeHTML(formatShippingMethod(order.shippingMethod))}</span>
        <span>最後更新：${formatDateTime(order.updatedAt)}</span>
      </div>
      <div class="order-card__actions">
        <a class="btn btn--ghost btn--small" href="order-detail.html?orderId=${encodeURIComponent(order.orderId)}">查看明細</a>
        <a class="btn btn--primary btn--small" href="${paymentUploadHref(order)}">回填匯款</a>
      </div>
    </article>
  `;
}

export function renderOrderDetail(order, options = {}) {
  const totals = orderToTotals(order);
  return `
    <div class="panel order-bank-strip">
      <div class="order-bank-strip__title">
        <span>PAYMENT</span>
        <strong>匯款資訊</strong>
      </div>
      ${renderOrderBankStrip(order)}
      <button class="btn btn--ghost btn--small" type="button" data-copy-payment>複製匯款資訊</button>
    </div>
    <div class="panel order-recipient-strip">
      <div class="order-recipient-strip__title">
        <span>RECEIVER</span>
        <strong>收件資訊</strong>
      </div>
      ${renderOrderRecipientStrip(order)}
    </div>
    <div class="panel order-overview-panel order-overview-strip">
      <div class="order-overview-strip__meta">
        <div>
          <p class="eyebrow">ORDER</p>
          <h1>${escapeHTML(order.orderId)}</h1>
        </div>
        <div class="order-overview-strip__dates">
          <p>下單時間：${formatDateTime(order.createdAt)}</p>
          <p>最後更新：${formatDateTime(order.updatedAt)}</p>
        </div>
      </div>
      ${renderTimeline(order.orderStatus)}
    </div>
    <div class="layout-grid" style="margin-top:18px">
      <section>
        <div class="panel order-items-panel">
          <h2>商品明細</h2>
          ${renderOrderItems(order.items)}
        </div>
      </section>
      <aside>
        <div class="panel order-summary-panel">
          <h2>金額摘要</h2>
          <div class="summary-list order-total-list">${renderOrderSummaryRows(totals)}</div>
          <a class="btn btn--primary order-summary-button" href="${paymentUploadHref(order)}">回填匯款資料</a>
        </div>
      </aside>
    </div>
  `;
}

function renderOrderBankStrip(order) {
  const deadline = order.paymentInfo?.paymentDeadline;
  const rows = [
    ["銀行", `${BANK_INFO.bankName}｜${BANK_INFO.bankCode}`],
    ["帳號", BANK_INFO.accountNumber],
    ["戶名", BANK_INFO.accountName],
    ["期限", deadline ? formatShortDeadline(deadline) : "下單後 3 日內", "is-deadline"]
  ];

  return `
    <div class="order-bank-line">
      ${rows.map(([label, value, modifier]) => `
        <div class="order-bank-line__item ${modifier || ""}">
          <span>${escapeHTML(label)}</span>
          <strong>${escapeHTML(value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOrderRecipientStrip(order) {
  const customer = order.customerInfo || {};
  const shipping = order.shippingInfo || {};
  const storeName = String(shipping.storeName || "").trim();
  const address = String(shipping.address || "").trim();
  const rows = [
    ["姓名", customer.name],
    ["手機", customer.phone],
    ["Email", customer.email, "email"],
    ["收件方式", formatShippingMethod(order.shippingMethod)],
    storeName ? ["超商門市", storeName] : null,
    !storeName && address ? ["地址", address] : null
  ].filter(Boolean);

  return `
    <div class="order-recipient-line">
      ${rows.map(([label, value, type]) => `
        <div class="order-recipient-line__item ${type === "email" ? "order-recipient-line__item--email" : ""}">
          <span>${escapeHTML(label)}</span>
          <strong>${escapeHTML(value || "未填寫")}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOrderSummaryRows(totals) {
  const pointsDiscount = Number(totals.pointsDiscount || 0);
  const pointsEarned = Number(totals.pointsEarned || 0);
  return `
    <div class="summary-row"><span>商品小計</span><strong>${formatCurrency(totals.subtotal)}</strong></div>
    <div class="summary-row"><span>運費</span><strong>${formatCurrency(totals.shippingFee)}</strong></div>
    <div class="summary-row"><span>優惠折扣</span><strong>-${formatCurrency(totals.discount)}</strong></div>
    ${pointsDiscount > 0 ? `<div class="summary-row summary-row--points"><span>點數折抵</span><strong>-${formatCurrency(pointsDiscount)}</strong></div>` : ""}
    <div class="summary-row summary-row--total"><span>訂單總金額</span><strong>${formatCurrency(totals.total)}</strong></div>
    <div class="summary-row summary-row--deposit"><span>匯款訂金金額</span><strong>${formatCurrency(totals.depositAmount)}</strong></div>
    ${pointsEarned > 0 ? `<div class="summary-row summary-row--points"><span>本次預計累積</span><strong>${pointsEarned} 點</strong></div>` : ""}
  `;
}

function renderOrderInfoGrid(order) {
  const customer = order.customerInfo || {};
  const shipping = order.shippingInfo || {};
  const lineId = String(customer.lineName || "").trim();
  const storeName = String(shipping.storeName || "").trim();
  const storeCode = String(shipping.storeCode || "").trim();
  const address = String(shipping.address || "").trim();
  const note = String(order.customerNote || "").trim();
  const rows = [
    ["姓名", customer.name],
    ["手機", customer.phone],
    lineId ? ["LINE ID", lineId] : null,
    ["收件方式", formatShippingMethod(order.shippingMethod)],
    address ? ["收件地址", address, "wide"] : null,
    storeName ? ["超商門市", storeName] : null,
    storeCode ? ["門市店號", storeCode] : null,
    note ? ["備註", note, "wide"] : null
  ].filter(Boolean);

  return `
    <div class="order-info-grid">
      ${rows.map(([label, value, width]) => `
        <div class="order-info-cell ${width === "wide" ? "order-info-cell--wide" : ""}">
          <span>${escapeHTML(label)}</span>
          <strong>${escapeHTML(value || "未填寫")}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function formatShippingMethod(method) {
  const value = String(method || "").trim();
  if (value === "店到店") return "711 店到店";
  return value;
}

function formatShortDeadline(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateTime(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

function bindPaymentCopyButton(root, order) {
  const button = root.querySelector("[data-copy-payment]");
  if (!button) return;
  button.addEventListener("click", async () => {
    const copied = await copyPaymentText(buildPaymentCopyText());
    showToast(copied ? "匯款資訊已複製" : "複製失敗，請手動複製匯款資訊");
  });
}

function buildPaymentCopyText() {
  return [
    `銀行名稱：${BANK_INFO.bankName}`,
    `銀行代碼：${BANK_INFO.bankCode}`,
    `匯款帳號：${BANK_INFO.accountNumber}`,
    `戶名：${BANK_INFO.accountName}`
  ].join("\n");
}

async function copyPaymentText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn("Clipboard API failed.", error);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function renderOrderItems(items = []) {
  if (!items.length) return '<p class="muted">沒有商品明細。</p>';
  return `
    <div class="order-detail-items">
      ${items.map((item) => {
        const giftQuantity = getOrderGiftQuantity(item);
        return `
          <article class="order-detail-item">
            <img class="order-detail-item__image" src="${escapeHTML(item.image || "assets/product-placeholder.svg")}" alt="${escapeHTML(item.name)}" onerror="this.src='assets/product-placeholder.svg'">
            <div class="order-detail-item__main">
              <h3>${escapeHTML(item.name)}</h3>
              <p>${escapeHTML(item.spec || item.category || "")}</p>
              ${giftQuantity > 0 ? `<p>🎁 出貨加贈 ${giftQuantity} 件（贈品不計價）</p>` : ""}
            </div>
            <div class="order-detail-item__price">
              <span>${formatCurrency(item.price)} x ${item.quantity}</span>
              <strong>${formatCurrency(item.price * item.quantity)}</strong>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function getOrderGiftQuantity(item = {}) {
  return Math.max(0, Math.floor(Number(item.giftQuantity) || 0));
}

function renderItemsLine(items = []) {
  return items.map((item) => `${escapeHTML(item.name)} x ${item.quantity}`).join("、") || "無商品明細";
}

function renderOrderItemRows(items = []) {
  if (!items.length) return '<p class="muted">沒有商品明細。</p>';
  return items.map((item) => {
    const giftQuantity = getOrderGiftQuantity(item);
    return `
      <div class="order-card__item">
        <div>
          <strong>${escapeHTML(item.name)}</strong>
          <span>${escapeHTML(item.spec || item.category || "")}</span>
          ${giftQuantity > 0 ? `<span>🎁 出貨加贈 ${giftQuantity} 件</span>` : ""}
        </div>
        <p>${formatCurrency(item.price)} x ${item.quantity}</p>
      </div>
    `;
  }).join("");
}

function renderCompactTimeline(status) {
  const steps = ["等待訂金", "訂單成立", "泰國採買中", "運送回台", "已出貨", "已完成"];
  const currentIndex = Math.max(0, steps.indexOf(status));
  return `
    <div class="order-progress" aria-label="訂單進度">
      ${steps.map((step, index) => `
        <span class="${currentIndex >= index ? "is-done" : ""}">${escapeHTML(step)}</span>
      `).join("")}
    </div>
  `;
}

function renderTimeline(status) {
  const currentIndex = Math.max(0, ORDER_STATUS.indexOf(status));
  const progress = ORDER_STATUS.length > 1
    ? Math.round((currentIndex / (ORDER_STATUS.length - 1)) * 100)
    : 0;
  return `
    <div class="timeline timeline--bar" style="--progress:${progress}%" aria-label="訂單進度">
      <div class="timeline__track" aria-hidden="true"><span></span></div>
      <div class="timeline__labels">
        ${ORDER_STATUS.map((step, index) => `
          <span class="${currentIndex >= index ? "is-done" : ""}">${escapeHTML(step)}</span>
        `).join("")}
      </div>
    </div>
  `;
}

function isLocalPreviewMode() {
  return getParam("preview") === "1" && ["127.0.0.1", "localhost"].includes(window.location.hostname);
}

function buildPreviewOrder() {
  const now = new Date();
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + 3);
  deadline.setHours(23, 59, 0, 0);
  const total = 1562;
  const depositAmount = Math.ceil(total * 0.5);
  return {
    orderId: "KT-20260724-483921",
    userId: "preview",
    customerInfo: {
      name: "匡怡如",
      phone: "0912345678",
      email: "kaylakuang@gmail.com.tw",
      lineName: ""
    },
    items: [
      { name: "KUNNA 巧克力椰子脆餅", image: "assets/product-placeholder.svg", spec: "袋裝 80g", price: 189, quantity: 4 },
      { name: "Bell 真燕窩飲", image: "assets/product-placeholder.svg", spec: "單瓶裝", price: 99, quantity: 1 },
      { name: "BONBACK 天然燕窩家庭號", image: "assets/product-placeholder.svg", spec: "家庭號組", price: 499, quantity: 1 },
      { name: "Monster & Friends UFO", image: "assets/product-placeholder.svg", spec: "單入隨機款", price: 159, quantity: 1 }
    ],
    subtotal: 1513,
    shippingFee: 49,
    discount: 0,
    total,
    depositRate: 0.5,
    depositAmount,
    remainingAmount: total - depositAmount,
    loyalty: {
      pointsRedeemed: 0,
      pointsDiscount: 0,
      pointsEarned: 151
    },
    paymentMethod: "銀行匯款",
    paymentStatus: "待付訂金",
    orderStatus: "等待訂金",
    shippingMethod: "店到店",
    shippingInfo: {
      address: "",
      storeName: "711 範例門市",
      storeCode: ""
    },
    paymentInfo: {
      paymentDeadline: deadline
    },
    trackingNumber: "",
    adminNote: "",
    customerNote: "本頁為本機預覽，不會建立真實訂單。",
    createdAt: now,
    updatedAt: now
  };
}

function orderToTotals(order) {
  return {
    subtotal: Number(order.subtotal || 0),
    shippingFee: Number(order.shippingFee || 0),
    discount: Number(order.discount || 0),
    pointsRedeemed: Number(order.loyalty?.pointsRedeemed || 0),
    pointsDiscount: Number(order.loyalty?.pointsDiscount || 0),
    pointsEarned: Number(order.loyalty?.pointsEarned || 0),
    total: Number(order.total || 0),
    depositRate: Number(order.depositRate || 0.5),
    depositAmount: Number(order.depositAmount || 0),
    remainingAmount: Number(order.remainingAmount || 0)
  };
}
