import {
  db,
  collection,
  getDocs,
  query,
  where
} from "./firebase.js";
import { PRODUCT_CATEGORIES } from "./settings.js?v=202607242329";
import {
  $,
  escapeHTML,
  fetchSampleProducts,
  formatCurrency,
  formatDate,
  getParam,
  getProductImage,
  normalizeProduct,
  productIsAvailable,
  renderStatusPill,
  showToast,
  toTime
} from "./utils.js?v=202607261330";
import { addToCart } from "./cart.js?v=202607261330";

const BEST_SELLER_NAMES = [
  "KUNNA 巧克力椰子脆餅",
  "Bell 真燕窩飲",
  "BONBACK 天然燕窩家庭號",
  "Dentiste 金色牙膏",
  "Monster & Friends UFO",
  "雙龍牌船麵"
];

const CATEGORY_PAGE_COPY = {
  "": {
    eyebrow: "ALL PRODUCTS",
    title: "全部商品",
    subtitle: "泰國超市・美妝保養・零食飲品｜精選代購清單"
  },
  "7-11": {
    eyebrow: "7-ELEVEN PICKS",
    title: "7-11 精選",
    subtitle: "泰國 7-11 熱門零食・飲品・限定好物"
  },
  "Big C": {
    eyebrow: "BIG C SELECTION",
    title: "Big C 精選",
    subtitle: "Big C 超市必買清單・囤貨與伴手禮"
  },
  "美妝保養": {
    eyebrow: "BEAUTY CARE",
    title: "美妝保養",
    subtitle: "人氣保養・美妝小物・日常護理"
  },
  "零食飲料": {
    eyebrow: "SNACKS & DRINKS",
    title: "零食飲料",
    subtitle: "泰式飲品・甜鹹零食・高回購小點"
  },
  "生活用品": {
    eyebrow: "DAILY GOODS",
    title: "生活用品",
    subtitle: "日常清潔・香氛藥妝・居家好物"
  },
  "熱銷商品": {
    eyebrow: "BEST SELLERS",
    title: "熱銷商品",
    subtitle: "人氣回購款・第一次下單也好挑"
  }
};

let cachedProducts = null;
let customSelectListenerBound = false;

function closeCustomSelects(except = null) {
  document.querySelectorAll(".custom-select.is-open").forEach((element) => {
    if (element === except) return;
    element.classList.remove("is-open");
    element.querySelector(".custom-select__button")?.setAttribute("aria-expanded", "false");
  });
}

function enhanceSelect(select) {
  if (!select || select.dataset.customSelect === "true") return;
  select.dataset.customSelect = "true";
  select.classList.add("select-native-hidden");

  const custom = document.createElement("div");
  custom.className = "custom-select";
  custom.innerHTML = `
    <button class="custom-select__button" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span class="custom-select__value"></span>
      <span class="custom-select__chevron" aria-hidden="true"></span>
    </button>
    <div class="custom-select__menu" role="listbox"></div>
  `;
  select.insertAdjacentElement("afterend", custom);

  const button = custom.querySelector(".custom-select__button");
  const value = custom.querySelector(".custom-select__value");
  const menu = custom.querySelector(".custom-select__menu");

  const syncLabel = () => {
    value.textContent = select.options[select.selectedIndex]?.textContent || "請選擇";
  };

  const renderOptions = () => {
    menu.innerHTML = Array.from(select.options).map((option) => `
      <button
        class="custom-select__option"
        type="button"
        role="option"
        data-value="${escapeHTML(option.value)}"
        aria-selected="${option.value === select.value ? "true" : "false"}"
      >${escapeHTML(option.textContent)}</button>
    `).join("");
  };

  button.addEventListener("click", () => {
    const willOpen = !custom.classList.contains("is-open");
    closeCustomSelects(custom);
    custom.classList.toggle("is-open", willOpen);
    button.setAttribute("aria-expanded", String(willOpen));
  });

  menu.addEventListener("click", (event) => {
    const option = event.target.closest(".custom-select__option");
    if (!option) return;
    select.value = option.dataset.value;
    syncLabel();
    renderOptions();
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    closeCustomSelects();
  });

  custom.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCustomSelects();
      button.focus();
    }
  });

  select.addEventListener("input", () => {
    syncLabel();
    renderOptions();
  });

  if (!customSelectListenerBound) {
    document.addEventListener("click", (event) => {
      if (event.target.closest(".custom-select")) return;
      closeCustomSelects();
    });
    customSelectListenerBound = true;
  }

  renderOptions();
  syncLabel();
}

export async function loadProducts(options = {}) {
  const { includeInactive = false, forceSample = false } = options;
  if (cachedProducts && !includeInactive && !forceSample) return cachedProducts;
  if (forceSample) return fetchSampleProducts();

  try {
    const ref = collection(db, "products");
    const request = includeInactive ? ref : query(ref, where("isActive", "==", true));
    const snapshot = await getDocs(request);
    const products = snapshot.docs.map((entry, index) => normalizeProduct({
      ...entry.data(),
      docId: entry.id,
      id: entry.data().id || entry.id
    }, index));

    if (!products.length) {
      cachedProducts = [];
      return [];
    }

    cachedProducts = products
      .filter((product) => includeInactive || product.isActive)
      .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
    return cachedProducts;
  } catch (error) {
    console.warn("Firestore products fallback to sample data", error);
    cachedProducts = await fetchSampleProducts();
    return cachedProducts;
  }
}

export function renderCategoryStrip(target = "#category-strip") {
  const element = typeof target === "string" ? $(target) : target;
  if (!element) return;
  element.innerHTML = PRODUCT_CATEGORIES.map((category) => `
    <a class="category-tile" href="products.html?category=${encodeURIComponent(category)}">
      <span>${escapeHTML(category)}</span>
    </a>
  `).join("");
}

function getProductCardBadge(product, available) {
  if (!available) return { label: product.status || "暫停接單", className: "badge--red" };
  if (product.isPreorder) return { label: "開放預購", className: "badge--navy" };
  return { label: "現貨販售", className: "" };
}

function getDisplayPromotionText(text) {
  return String(text || "")
    .replace(/滿\s*NT\$?3,?000\s*免運/g, "")
    .replace(/數量有限[，,、]?\s*售完即止/g, "")
    .replace(/整箱可私訊詢價/g, "")
    .replace(/款式隨機出貨[，,、]?\s*可備註偏好/g, "")
    .replace(/買五送一適用/g, "買五送一")
    .replace(/[，,、｜|]+$/g, "")
    .replace(/^[，,、｜|]+/g, "")
    .trim();
}

function renderVariantOptions(product) {
  return (product.variants || [])
    .map((variant) => `<option value="${escapeHTML(variant)}">${escapeHTML(variant)}</option>`)
    .join("");
}

export function renderProductCard(product) {
  const available = productIsAvailable(product);
  const badge = getProductCardBadge(product, available);
  const promoText = getDisplayPromotionText(product.promotionText);
  return `
    <article class="product-card">
      <a class="product-card__image" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="查看 ${escapeHTML(product.name)}">
        <img src="${escapeHTML(getProductImage(product))}" alt="${escapeHTML(product.name)}" onerror="this.src='assets/product-placeholder.svg'">
        <span class="product-card__badges">
          <span class="badge ${badge.className}">${escapeHTML(badge.label)}</span>
        </span>
      </a>
      <div class="product-card__body">
        <a href="product.html?id=${encodeURIComponent(product.id)}"><h3 class="product-card__name">${escapeHTML(product.name)}</h3></a>
        <p class="product-card__desc">${escapeHTML(product.description)}</p>
        ${promoText ? `<p class="promo-text">${escapeHTML(promoText)}</p>` : ""}
        ${(product.variants || []).length ? `
          <label class="field" style="margin-top:10px">
            <span>選擇款式</span>
            <select data-product-variant aria-label="${escapeHTML(product.name)}款式">
              <option value="">請選擇款式</option>
              ${renderVariantOptions(product)}
            </select>
          </label>
        ` : ""}
        <div class="product-card__meta">
          <div class="price">${formatCurrency(product.price)}${product.originalPrice ? ` <del>${formatCurrency(product.originalPrice)}</del>` : ""}</div>
          <button class="add-button" type="button" data-add-cart="${escapeHTML(product.id)}" ${available ? "" : "disabled"} aria-label="加入購物車">+</button>
        </div>
      </div>
    </article>
  `;
}

function renderRelatedProductCard(product) {
  return `
    <article class="related-product-card">
      <a class="related-product-card__image" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="查看 ${escapeHTML(product.name)}">
        <img src="${escapeHTML(getProductImage(product))}" alt="${escapeHTML(product.name)}" onerror="this.src='assets/product-placeholder.svg'">
      </a>
      <a class="related-product-card__name" href="product.html?id=${encodeURIComponent(product.id)}">${escapeHTML(product.name)}</a>
    </article>
  `;
}

function getProductImages(product) {
  const images = Array.isArray(product.images) ? product.images : [];
  return [...new Set([getProductImage(product), ...images])]
    .map((image) => String(image || "").trim())
    .filter(Boolean);
}

export function bindAddToCart(products, scope = document) {
  scope.querySelectorAll("[data-add-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = products.find((item) => item.id === button.dataset.addCart);
      if (!product) return;
      const variantSelect = button.closest(".product-card")?.querySelector("[data-product-variant]");
      const selectedVariant = variantSelect?.value || "";
      if ((product.variants || []).length && !selectedVariant) {
        showToast("請先選擇商品款式");
        variantSelect?.focus();
        return;
      }
      addToCart(product, 1, selectedVariant);
    });
  });
}

export async function initHomePage() {
  renderCategoryStrip("#category-strip");
  const grid = $("#best-sellers-grid");
  if (!grid) return;
  grid.innerHTML = '<div class="loading">正在整理熱門商品...</div>';
  const products = await loadProducts();
  const sorted = [
    ...BEST_SELLER_NAMES.map((name) => products.find((product) => product.name === name)).filter(Boolean),
    ...products.filter((product) => !BEST_SELLER_NAMES.includes(product.name))
  ].slice(0, 5);

  grid.innerHTML = sorted.map(renderProductCard).join("");
  bindAddToCart(sorted, grid);
}

export async function initProductsPage() {
  const grid = $("#products-grid");
  const category = $("#category-filter");
  const search = $("#product-search");
  const sort = $("#sort-filter");
  if (!grid || !category || !search || !sort) return;

  category.innerHTML = `<option value="">全部分類</option>${PRODUCT_CATEGORIES.map((item) => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("")}`;
  category.value = getParam("category") || "";
  const requestedSort = getParam("sort") || "default";
  sort.value = Array.from(sort.options).some((option) => option.value === requestedSort) ? requestedSort : "default";
  enhanceSelect(category);
  enhanceSelect(sort);

  const getPageCopy = () => {
    let pageCopy = CATEGORY_PAGE_COPY[category.value] || {
      eyebrow: "CATEGORY",
      title: category.value,
      subtitle: `瀏覽 ${category.value} 分類中的泰國精選好物。`
    };
    if (!category.value && sort.value === "latest") {
      pageCopy = {
        eyebrow: "NEW ARRIVALS",
        title: "最新商品",
        subtitle: "依上架時間排列｜最新到貨與開放預購清單"
      };
    }
    return pageCopy;
  };

  const updateProductsHeader = (keyword = "", countText = "") => {
    const pageCopy = getPageCopy();
    const eyebrow = $("#products-eyebrow");
    const title = $("#products-title");
    const subtitle = $("#products-subtitle");
    const count = $("#products-count");

    if (eyebrow) eyebrow.textContent = pageCopy.eyebrow;
    if (title) title.textContent = pageCopy.title;
    if (subtitle) subtitle.textContent = keyword
      ? `搜尋「${search.value.trim()}」｜可切換分類或排序`
      : pageCopy.subtitle;
    if (count && countText) count.textContent = countText;
    document.title = `${pageCopy.title}｜匡老三代購網`;
  };

  updateProductsHeader("", "正在讀取商品...");

  const products = await loadProducts();
  const paint = () => {
    const keyword = search.value.trim().toLowerCase();
    let list = products.filter((product) => {
      const matchesCategory = !category.value || product.category === category.value;
      const haystack = `${product.name} ${product.description} ${product.category} ${(product.variants || []).join(" ")}`.toLowerCase();
      return matchesCategory && (!keyword || haystack.includes(keyword));
    });

    if (sort.value === "latest") list = list.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
    if (sort.value === "price-asc") list = list.sort((a, b) => a.price - b.price);
    if (sort.value === "price-desc") list = list.sort((a, b) => b.price - a.price);

    grid.innerHTML = list.length
      ? list.map(renderProductCard).join("")
      : '<div class="empty-state">目前沒有符合條件的商品。</div>';
    bindAddToCart(list, grid);

    const countPrefix = category.value ? `${category.value}｜` : "";
    updateProductsHeader(keyword, `${countPrefix}共 ${list.length} 件商品`);
  };

  [category, search, sort].forEach((node) => node.addEventListener("input", paint));
  paint();
}

export async function initProductDetailPage() {
  const root = $("#product-detail");
  if (!root) return;
  root.innerHTML = '<div class="loading">正在讀取商品...</div>';
  const id = getParam("id");
  const products = await loadProducts();
  const product = products.find((item) => item.id === id || item.docId === id);

  if (!product) {
    root.innerHTML = `
      <div class="empty-state">
        <p>找不到這項商品。</p>
        <a class="btn btn--primary" href="products.html">回到全部商品</a>
      </div>
    `;
    return;
  }

  const available = productIsAvailable(product);
  const promoText = getDisplayPromotionText(product.promotionText);
  const productImages = getProductImages(product);
  const hasMultipleImages = productImages.length > 1;
  const maxQuantity = Math.max(1, Number(product.limitPerUser || product.stock || 99));
  root.innerHTML = `
    <div class="layout-grid product-showcase">
      <section class="panel product-media-panel">
        <div class="product-gallery" data-product-gallery>
          <div class="product-frame">
            ${hasMultipleImages ? `<button class="gallery-nav gallery-nav--prev" type="button" data-gallery-step="-1" aria-label="上一張商品圖片">‹</button>` : ""}
            <img class="product-detail-image" data-gallery-main src="${escapeHTML(productImages[0] || getProductImage(product))}" alt="${escapeHTML(product.name)}" onerror="this.src='assets/product-placeholder.svg'">
            ${hasMultipleImages ? `<button class="gallery-nav gallery-nav--next" type="button" data-gallery-step="1" aria-label="下一張商品圖片">›</button>` : ""}
          </div>
          ${hasMultipleImages ? `
            <div class="gallery-thumbnails" aria-label="商品圖片縮圖">
              ${productImages.map((image, index) => `
                <button class="gallery-thumb${index === 0 ? " is-active" : ""}" type="button" data-gallery-index="${index}" aria-label="查看第 ${index + 1} 張商品圖片">
                  <img src="${escapeHTML(image)}" alt="" onerror="this.src='assets/product-placeholder.svg'">
                </button>
              `).join("")}
            </div>
          ` : ""}
        </div>
        <div class="product-image-note">
          <h2>產品說明</h2>
          <p>${escapeHTML(product.description)}</p>
        </div>
      </section>
      <aside class="panel product-info-panel">
        <p class="eyebrow">${escapeHTML(product.category)}</p>
        <h1 class="product-detail-title">${escapeHTML(product.name)}</h1>
        <p class="muted">${escapeHTML(product.description)}</p>
        <p class="price product-detail-price">${formatCurrency(product.price)}${product.originalPrice ? ` <del>${formatCurrency(product.originalPrice)}</del>` : ""}</p>
        <div class="product-detail-badges">
          ${available ? renderStatusPill(product.isPreorder ? "開放預購" : "現貨販售") : renderStatusPill(product.status, "badge--red")}
          ${promoText ? renderStatusPill(promoText, "badge--promo") : ""}
        </div>
        <div class="summary-list">
          <div class="summary-row"><span>規格</span><strong>${escapeHTML(product.spec || "依商品頁標示")}</strong></div>
          <div class="summary-row"><span>截止時間</span><strong>${escapeHTML(formatDate(product.deadline) || "尚未設定")}</strong></div>
          <div class="summary-row"><span>預計到貨</span><strong>${escapeHTML(product.arrivalDate || "依開團公告")}</strong></div>
        </div>
        ${(product.variants || []).length ? `
          <label class="field">
            <span>選擇款式</span>
            <select id="detail-variant" aria-label="${escapeHTML(product.name)}款式">
              <option value="">請選擇款式</option>
              ${renderVariantOptions(product)}
            </select>
          </label>
        ` : ""}
        <div class="product-purchase-row">
          <div class="product-quantity-control" aria-label="購買數量">
            <button type="button" data-quantity-step="-1" aria-label="減少數量">−</button>
            <input class="product-quantity-input" id="detail-quantity" type="text" inputmode="numeric" pattern="[0-9]*" min="1" max="${maxQuantity}" value="1" aria-label="購買數量">
            <button type="button" data-quantity-step="1" aria-label="增加數量">+</button>
          </div>
          <button class="btn btn--primary" id="detail-add" type="button" ${available ? "" : "disabled"}>加入購物車</button>
        </div>
      </aside>
    </div>
  `;

  const galleryMain = root.querySelector("[data-gallery-main]");
  let activeImageIndex = 0;
  const updateGallery = (nextIndex) => {
    if (!galleryMain || !productImages.length) return;
    activeImageIndex = (nextIndex + productImages.length) % productImages.length;
    galleryMain.src = productImages[activeImageIndex];
    root.querySelectorAll("[data-gallery-index]").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.galleryIndex) === activeImageIndex);
    });
  };

  root.querySelectorAll("[data-gallery-step]").forEach((button) => {
    button.addEventListener("click", () => updateGallery(activeImageIndex + Number(button.dataset.galleryStep || 0)));
  });

  root.querySelectorAll("[data-gallery-index]").forEach((button) => {
    button.addEventListener("click", () => updateGallery(Number(button.dataset.galleryIndex || 0)));
  });

  const quantityInput = $("#detail-quantity");
  const clampQuantity = (value) => Math.min(maxQuantity, Math.max(1, Number.parseInt(value, 10) || 1));

  root.querySelectorAll("[data-quantity-step]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!quantityInput) return;
      quantityInput.value = String(clampQuantity(Number(quantityInput.value || 1) + Number(button.dataset.quantityStep || 0)));
    });
  });

  quantityInput?.addEventListener("input", () => {
    quantityInput.value = quantityInput.value.replace(/\D/g, "");
  });

  quantityInput?.addEventListener("blur", () => {
    quantityInput.value = String(clampQuantity(quantityInput.value));
  });

  $("#detail-add")?.addEventListener("click", () => {
    const quantity = clampQuantity($("#detail-quantity")?.value || 1);
    const selectedVariant = $("#detail-variant")?.value || "";
    if ((product.variants || []).length && !selectedVariant) {
      showToast("請先選擇商品款式");
      $("#detail-variant")?.focus();
      return;
    }
    addToCart(product, quantity, selectedVariant);
  });

  const related = $("#related-products");
  if (related) {
    const relatedProducts = products
      .filter((item) => item.id !== product.id && item.category === product.category)
      .slice(0, 5);
    related.innerHTML = relatedProducts.length
      ? relatedProducts.map(renderRelatedProductCard).join("")
      : '<div class="empty-state">目前沒有同分類商品。</div>';
  }
}

export function getBestSellerNames() {
  return BEST_SELLER_NAMES.slice();
}
