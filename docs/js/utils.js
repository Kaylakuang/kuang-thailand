import {
  SITE_NAME,
  CONTACT_INFO,
  PRODUCT_CATEGORIES,
  PAYMENT_SETTINGS,
  BANK_INFO,
  SHIPPING_SETTINGS
} from "./settings.js?v=202607242329";

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatCurrency(value = 0) {
  const number = Number(value) || 0;
  return `NT$${new Intl.NumberFormat("zh-TW").format(Math.round(number))}`;
}

export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toTime(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "尚未紀錄";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function getPaymentDeadline(days = PAYMENT_SETTINGS.paymentDeadlineDays) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 0, 0);
  return date;
}

export function calculateDeposit(total) {
  const depositRate = PAYMENT_SETTINGS.depositRate;
  const depositAmount = Math.ceil((Number(total) || 0) * depositRate);
  const remainingAmount = (Number(total) || 0) - depositAmount;
  return { depositRate, depositAmount, remainingAmount };
}

export function generateOrderId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(100000 + Math.random() * 900000);
  return `KT-${y}${m}${d}-${random}`;
}

export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function normalizeProduct(product = {}, index = 0) {
  const id = product.id || product.docId || `sample-${index + 1}`;
  const imageList = Array.isArray(product.images)
    ? product.images.map((image) => String(image || "").trim()).filter(Boolean)
    : [];
  const image = product.image || imageList[0] || "assets/product-placeholder.svg";
  const images = [...new Set([image, ...imageList])];
  return {
    id,
    docId: product.docId || id,
    name: product.name || "未命名商品",
    image,
    images,
    category: product.category || "熱銷商品",
    description: product.description || "",
    price: Number(product.price) || 0,
    originalPrice: Number(product.originalPrice) || 0,
    spec: product.spec || "",
    stock: Number(product.stock ?? 0),
    isActive: product.isActive !== false,
    isPreorder: product.isPreorder !== false,
    arrivalDate: product.arrivalDate || "",
    deadline: product.deadline || "",
    limitPerUser: Number(product.limitPerUser || 0),
    promotionText: product.promotionText || "",
    status: product.status || "開放下單",
    createdAt: product.createdAt || "",
    updatedAt: product.updatedAt || ""
  };
}

export async function fetchSampleProducts() {
  const response = await fetch("data/sample-products.json", { cache: "no-store" });
  if (!response.ok) throw new Error("無法讀取範例商品資料");
  const data = await response.json();
  return data.map(normalizeProduct);
}

export function getProductImage(product) {
  return product?.image || "assets/product-placeholder.svg";
}

export function productIsAvailable(product) {
  return product?.isActive
    && product?.stock !== 0
    && !["已截止", "暫停接單", "已售完"].includes(product?.status);
}

export function slugify(value = "") {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `item-${Date.now()}`;
}

export function showToast(message) {
  let toast = $(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

export function renderStatusPill(label, extraClass = "") {
  return `<span class="status-pill ${extraClass}">${escapeHTML(label || "未設定")}</span>`;
}

export function renderSummaryRows(totals) {
  const pointsDiscount = Number(totals.pointsDiscount || 0);
  const pointsEarned = Number(totals.pointsEarned || 0);
  return `
    <div class="summary-row"><span>商品小計</span><strong>${formatCurrency(totals.subtotal)}</strong></div>
    <div class="summary-row"><span>運費</span><strong>${formatCurrency(totals.shippingFee)}</strong></div>
    <div class="summary-row"><span>優惠折扣</span><strong>-${formatCurrency(totals.discount)}</strong></div>
    ${pointsDiscount > 0 ? `<div class="summary-row summary-row--points"><span>點數折抵</span><strong>-${formatCurrency(pointsDiscount)}</strong></div>` : ""}
    <div class="summary-row summary-row--total"><span>訂單總金額</span><strong>${formatCurrency(totals.total)}</strong></div>
    <div class="summary-row summary-row--deposit"><span>匯款訂金金額</span><strong>${formatCurrency(totals.depositAmount)}</strong></div>
    <div class="summary-row"><span>尾款金額</span><strong>${formatCurrency(totals.remainingAmount)}</strong></div>
    ${pointsEarned > 0 ? `<div class="summary-row summary-row--points"><span>本次預計累積</span><strong>${pointsEarned} 點</strong></div>` : ""}
  `;
}

export function renderBankInfo(orderOrTotals = {}) {
  const total = orderOrTotals.total ?? 0;
  const deposit = orderOrTotals.depositAmount ?? calculateDeposit(total).depositAmount;
  const deadline = orderOrTotals.paymentDeadline || orderOrTotals.paymentInfo?.paymentDeadline || "";
  return `
    <div class="summary-list">
      <div class="summary-row"><span>銀行名稱</span><strong>${escapeHTML(BANK_INFO.bankName)}</strong></div>
      <div class="summary-row"><span>銀行代碼</span><strong>${escapeHTML(BANK_INFO.bankCode)}</strong></div>
      <div class="summary-row"><span>匯款帳號</span><strong>${escapeHTML(BANK_INFO.accountNumber)}</strong></div>
      <div class="summary-row"><span>戶名</span><strong>${escapeHTML(BANK_INFO.accountName)}</strong></div>
      <div class="summary-row"><span>訂單總金額</span><strong>${formatCurrency(total)}</strong></div>
      <div class="summary-row summary-row--deposit"><span>匯款訂金金額</span><strong>${formatCurrency(deposit)}</strong></div>
      <div class="summary-row"><span>付款期限</span><strong>${deadline ? escapeHTML(formatDateTime(deadline)) : `下單後 ${PAYMENT_SETTINGS.paymentDeadlineDays} 日內`}</strong></div>
    </div>
  `;
}

export function renderSiteHeader(active = "") {
  const header = $("#site-header");
  if (!header) return;
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const params = new URLSearchParams(window.location.search);
  let activeKey = active;

  if (currentPage === "products.html") {
    if (params.get("sort") === "latest") activeKey = "latest";
  }

  const navItems = [
    ["首頁", "index.html", "home"],
    ["全部商品", "products.html", "products"],
    ["最新商品", "products.html?sort=latest", "latest"],
    ["我的訂單", "my-orders.html", "orders"],
    ["登入／註冊", "login.html", "auth"],
    ["購物車", "cart.html", "cart"]
  ];

  header.innerHTML = `
    <div class="announcement">
      <div class="announcement__inner">
        <span>${escapeHTML(SHIPPING_SETTINGS.freeShippingText)}</span>
        <span>付款方式：LINE Pay｜銀行匯款</span>
        <span>客服時間：${escapeHTML(CONTACT_INFO.serviceHours)}</span>
      </div>
    </div>
    <header class="site-header">
      <nav class="nav" aria-label="主導覽">
        <a href="index.html" class="brand" aria-label="${SITE_NAME} 首頁">${SITE_NAME}<span>KUANG SERVICE</span></a>
        <div class="nav__links" id="primary-nav">
          ${navItems.map(([label, href, key]) => `<a href="${href}" data-nav-key="${key}" class="${activeKey === key ? "is-active" : ""}">${label}</a>`).join("")}
        </div>
        <div class="nav__actions">
          <a href="login.html" class="icon-button auth-icon-link" aria-label="會員登入">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="3.4" fill="none"></circle>
              <path d="M5.8 20c1.05-4.2 3.25-6.3 6.2-6.3s5.15 2.1 6.2 6.3" fill="none"></path>
            </svg>
          </a>
          <a href="cart.html" class="cart-link" aria-label="購物車">
            <svg class="nav-icon nav-icon--bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7.3 9.4h9.4l-.7 9.7H8L7.3 9.4Z" fill="none"></path>
              <path d="M9.4 9.4V7.6a2.6 2.6 0 0 1 5.2 0v1.8" fill="none"></path>
            </svg>
            <span class="cart-count" data-cart-count>0</span>
          </a>
          <button class="menu-button" type="button" aria-label="開啟選單" aria-expanded="false" aria-controls="primary-nav"><span></span></button>
        </div>
      </nav>
    </header>
  `;
  bindMobileMenu();
}

export function renderSiteFooter() {
  const footer = $("#site-footer");
  if (!footer) return;
  footer.innerHTML = `
    <footer class="footer">
      <div class="container">
        <div class="footer__main">
          <div class="footer__brand">
            <h2>${SITE_NAME}</h2>
            <p class="muted">泰國現地採買與品牌好物代購。</p>
            <p class="muted">來源清楚，價格透明，品質用心把關。</p>
          </div>
          <div class="footer__col">
            <h3>商品分類</h3>
            ${PRODUCT_CATEGORIES.map((category) => `<a href="products.html?category=${encodeURIComponent(category)}">${escapeHTML(category)}</a>`).join("")}
          </div>
          <div class="footer__col">
            <h3>付款與運送</h3>
            <span>LINE Pay</span>
            <span>銀行匯款</span>
            <span>店到店／面交／宅配</span>
            <span>滿 NT$3,000 免運</span>
          </div>
          <div class="footer__col footer__social-col">
            <div class="social-links social-links--footer" aria-label="社群連結">
              <a class="social-link social-link--small" href="${escapeHTML(CONTACT_INFO.lineUrl)}" target="_blank" rel="noopener" aria-label="加入 LINE"><img src="assets/icon-line.svg" alt=""></a>
              <a class="social-link social-link--small" href="${escapeHTML(CONTACT_INFO.instagramUrl)}" target="_blank" rel="noopener" aria-label="前往 Instagram"><img src="assets/icon-instagram.svg" alt=""></a>
              <a class="social-link social-link--small" href="${escapeHTML(CONTACT_INFO.facebookUrl)}" target="_blank" rel="noopener" aria-label="前往 Facebook"><img src="assets/icon-facebook.svg" alt=""></a>
              <a class="social-link social-link--small" href="${escapeHTML(CONTACT_INFO.threadsUrl)}" target="_blank" rel="noopener" aria-label="前往 Threads"><img src="assets/icon-threads.svg" alt=""></a>
            </div>
            <a class="footer-email" href="mailto:${escapeHTML(CONTACT_INFO.email)}">Email：${escapeHTML(CONTACT_INFO.email)}</a>
          </div>
        </div>
        <div class="footer__bottom">
          <span>© <span data-current-year></span> ${SITE_NAME}. All rights reserved.</span>
          <span>Terms of Service ｜ Privacy Policy</span>
        </div>
      </div>
    </footer>
  `;
  const year = $("[data-current-year]", footer);
  if (year) year.textContent = new Date().getFullYear();
}

export function bindMobileMenu() {
  const button = $(".menu-button");
  const nav = $("#primary-nav");
  if (!button || !nav) return;
  button.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
  });
}

export function initHeroImageFallback() {
  const image = $(".hero-main-image");
  if (!image) return;
  const visual = image.closest(".hero__visual");
  const markEmpty = () => visual?.classList.add("is-empty");
  image.addEventListener("error", markEmpty, { once: true });
  if (image.complete && image.naturalWidth === 0) markEmpty();
}

export function requireElement(selector) {
  const element = $(selector);
  if (!element) throw new Error(`找不到頁面元素：${selector}`);
  return element;
}
