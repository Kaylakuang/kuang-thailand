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
  if (!date) return "撠𡁏𧊋蝝���";
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
    name: product.name || "�芸𦶢�滚���",
    image,
    images,
    category: product.category || "�梢啹���",
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
    status: product.status || "�𧢲𦆮銝见鱓",
    createdAt: product.createdAt || "",
    updatedAt: product.updatedAt || ""
  };
}

export async function fetchSampleProducts() {
  const response = await fetch("data/sample-products.json", { cache: "no-store" });
  if (!response.ok) throw new Error("�⊥�霈��𣇉�靘见������");
  const data = await response.json();
  return data.map(normalizeProduct);
}

export function getProductImage(product) {
  return product?.image || "assets/product-placeholder.svg";
}

export function productIsAvailable(product) {
  return product?.isActive
    && product?.stock !== 0
    && !["撌脫⏛甇�", "�怠��亙鱓", "撌脣睸摰�"].includes(product?.status);
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
  return `<span class="status-pill ${extraClass}">${escapeHTML(label || "�芾身摰�")}</span>`;
}

export function renderSummaryRows(totals) {
  const pointsDiscount = Number(totals.pointsDiscount || 0);
  const pointsEarned = Number(totals.pointsEarned || 0);
  return `
    <div class="summary-row"><span>���撠讛�</span><strong>${formatCurrency(totals.subtotal)}</strong></div>
    <div class="summary-row"><span>�贝祥</span><strong>${formatCurrency(totals.shippingFee)}</strong></div>
    <div class="summary-row"><span>�芣��䀹緍</span><strong>-${formatCurrency(totals.discount)}</strong></div>
    ${pointsDiscount > 0 ? `<div class="summary-row summary-row--points"><span>暺墧彍�䀹𠽌</span><strong>-${formatCurrency(pointsDiscount)}</strong></div>` : ""}
    <div class="summary-row summary-row--total"><span>閮�鱓蝮賡�憿�</span><strong>${formatCurrency(totals.total)}</strong></div>
    <div class="summary-row summary-row--deposit"><span>�舀狡閮���煾�</span><strong>${formatCurrency(totals.depositAmount)}</strong></div>
    <div class="summary-row"><span>撠暹狡�煾�</span><strong>${formatCurrency(totals.remainingAmount)}</strong></div>
    ${pointsEarned > 0 ? `<div class="summary-row summary-row--points"><span>�祆活�鞱�蝝舐�</span><strong>${pointsEarned} 暺�</strong></div>` : ""}
  `;
}

export function renderBankInfo(orderOrTotals = {}) {
  const total = orderOrTotals.total ?? 0;
  const deposit = orderOrTotals.depositAmount ?? calculateDeposit(total).depositAmount;
  const deadline = orderOrTotals.paymentDeadline || orderOrTotals.paymentInfo?.paymentDeadline || "";
  return `
    <div class="summary-list">
      <div class="summary-row"><span>��銵��蝔�</span><strong>${escapeHTML(BANK_INFO.bankName)}</strong></div>
      <div class="summary-row"><span>��銵䔶誨蝣�</span><strong>${escapeHTML(BANK_INFO.bankCode)}</strong></div>
      <div class="summary-row"><span>�舀狡撣唾�</span><strong>${escapeHTML(BANK_INFO.accountNumber)}</strong></div>
      <div class="summary-row"><span>�嗅�</span><strong>${escapeHTML(BANK_INFO.accountName)}</strong></div>
      <div class="summary-row"><span>閮�鱓蝮賡�憿�</span><strong>${formatCurrency(total)}</strong></div>
      <div class="summary-row summary-row--deposit"><span>�舀狡閮���煾�</span><strong>${formatCurrency(deposit)}</strong></div>
      <div class="summary-row"><span>隞䀹狡�罸�</span><strong>${deadline ? escapeHTML(formatDateTime(deadline)) : `銝见鱓敺� ${PAYMENT_SETTINGS.paymentDeadlineDays} �亙�`}</strong></div>
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
    ["擐㚚�", "index.html", "home"],
    ["�券����", "products.html", "products"],
    ["���啣���", "products.html?sort=latest", "latest"],
    ["�𤑳�閮�鱓", "my-orders.html", "orders"],
    ["�餃�嚗讛酉��", "login.html", "auth"],
    ["鞈潛�頠�", "cart.html", "cart"]
  ];

  header.innerHTML = `
    <div class="announcement">
      <div class="announcement__inner">
        <span>${escapeHTML(SHIPPING_SETTINGS.freeShippingText)}</span>
        <span>隞䀹狡�孵�嚗匁INE Pay嚚𣈯�銵�𥲤甈�</span>
        <span>摰Ｘ����嚗�${escapeHTML(CONTACT_INFO.serviceHours)}</span>
      </div>
    </div>
    <header class="site-header">
      <nav class="nav" aria-label="銝餃�閬�">
        <a href="index.html" class="brand" aria-label="${SITE_NAME} 擐㚚�">${SITE_NAME}<span>KUANG SERVICE</span></a>
        <div class="nav__links" id="primary-nav">
          ${navItems.map(([label, href, key]) => `<a href="${href}" data-nav-key="${key}" class="${activeKey === key ? "is-active" : ""}">${label}</a>`).join("")}
        </div>
        <div class="nav__actions">
          <a href="login.html" class="icon-button auth-icon-link" aria-label="��摱�餃�">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="3.4" fill="none"></circle>
              <path d="M5.8 20c1.05-4.2 3.25-6.3 6.2-6.3s5.15 2.1 6.2 6.3" fill="none"></path>
            </svg>
          </a>
          <a href="cart.html" class="cart-link" aria-label="鞈潛�頠�">
            <svg class="nav-icon nav-icon--bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7.3 9.4h9.4l-.7 9.7H8L7.3 9.4Z" fill="none"></path>
              <path d="M9.4 9.4V7.6a2.6 2.6 0 0 1 5.2 0v1.8" fill="none"></path>
            </svg>
            <span class="cart-count" data-cart-count>0</span>
          </a>
          <button class="menu-button" type="button" aria-label="�见��詨鱓" aria-expanded="false" aria-controls="primary-nav"><span></span></button>
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
            <p class="muted">瘜啣��曉𧑐�∟眺�����末�拐誨鞈潦��</p>
            <p class="muted">靘��皜��嚗���潮�𤩺�嚗��鞈芰鍂敹���栶��</p>
          </div>
          <div class="footer__col">
            <h3>������</h3>
            ${PRODUCT_CATEGORIES.map((category) => `<a href="products.html?category=${encodeURIComponent(category)}">${escapeHTML(category)}</a>`).join("")}
          </div>
          <div class="footer__col">
            <h3>隞䀹狡�����</h3>
            <span>LINE Pay</span>
            <span>��銵�𥲤甈�</span>
            <span>摨堒�摨梹��Ｖ漱嚗誩���</span>
            <span>皛� NT$3,000 �漤�</span>
          </div>
          <div class="footer__col footer__social-col">
            <div class="social-links social-links--footer" aria-label="蝷曄黎���">
              <a class="social-link social-link--small" href="${escapeHTML(CONTACT_INFO.lineUrl)}" target="_blank" rel="noopener" aria-label="�惩� LINE"><img src="assets/icon-line.svg" alt=""></a>
              <a class="social-link social-link--small" href="${escapeHTML(CONTACT_INFO.instagramUrl)}" target="_blank" rel="noopener" aria-label="�滚� Instagram"><img src="assets/icon-instagram.svg" alt=""></a>
              <a class="social-link social-link--small" href="${escapeHTML(CONTACT_INFO.facebookUrl)}" target="_blank" rel="noopener" aria-label="�滚� Facebook"><img src="assets/icon-facebook.svg" alt=""></a>
              <a class="social-link social-link--small" href="${escapeHTML(CONTACT_INFO.threadsUrl)}" target="_blank" rel="noopener" aria-label="�滚� Threads"><img src="assets/icon-threads.svg" alt=""></a>
            </div>
            <a class="footer-email" href="mailto:${escapeHTML(CONTACT_INFO.email)}">Email嚗�${escapeHTML(CONTACT_INFO.email)}</a>
          </div>
        </div>
        <div class="footer__bottom">
          <span>穢 <span data-current-year></span> ${SITE_NAME}. All rights reserved.</span>
          <span>Terms of Service 嚚� Privacy Policy</span>
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

  const closeMenu = () => {
    nav.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "�见��詨鱓");
  };

  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", isOpen);
    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute("aria-label", isOpen ? "�𣈯��詨鱓" : "�见��詨鱓");
  };

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target) && !button.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 980) closeMenu();
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
  if (!element) throw new Error(`�曆��圈��Ｗ�蝝𩤃�${selector}`);
  return element;
}
