import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "./firebase.js";
import { requireAuth } from "./auth.js?v=202607242329";
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PRODUCT_CATEGORIES,
  PRODUCT_STATUS
} from "./settings.js?v=202607242329";
import { loadProducts } from "./products.js?v=202607242329";
import {
  $,
  escapeHTML,
  fetchSampleProducts,
  formatCurrency,
  formatDateTime,
  getProductImage,
  normalizeProduct,
  showToast,
  slugify,
  toTime
} from "./utils.js?v=202607242329";

let adminProducts = [];
let adminOrders = [];
const ADMIN_IMAGE_MAX_SIZE = 720;
const ADMIN_IMAGE_QUALITY = 0.7;

export async function initAdminPage() {
  const state = await requireAuth();
  if (!state) return;
  const root = $("#admin-root");
  if (!root) return;

  if (state.profile?.role !== "admin") {
    root.innerHTML = `
      <div class="empty-state">
        <h2>沒有管理員權限</h2>
        <p>請先依 README 建立第一個 admin 帳號，再重新登入。</p>
      </div>
    `;
    return;
  }

  bindTabs();
  fillAdminSelects();
  await refreshAdminData();
  bindProductForm();
  bindProductTools();
  bindOrderFilters();
  bindCsvExport();
  bindSampleImport();
}

function bindTabs() {
  document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.adminTab;
      document.querySelectorAll("[data-admin-tab]").forEach((node) => node.classList.toggle("is-active", node === tab));
      document.querySelectorAll(".admin-section").forEach((section) => section.classList.toggle("is-active", section.id === target));
    });
  });
}

function fillAdminSelects() {
  fillSelect("#admin-category", PRODUCT_CATEGORIES);
  fillSelect("#admin-status", PRODUCT_STATUS);
  fillSelect("#order-payment-filter", ["全部付款狀態", ...PAYMENT_STATUS]);
  fillSelect("#order-status-filter", ["全部訂單狀態", ...ORDER_STATUS]);
}

function fillSelect(selector, options) {
  const select = $(selector);
  if (!select) return;
  select.innerHTML = options.map((option) => `<option value="${escapeHTML(option)}">${escapeHTML(option)}</option>`).join("");
}

async function refreshAdminData() {
  await Promise.all([refreshProducts(), refreshOrders()]);
  renderDashboard();
}

async function refreshProducts() {
  adminProducts = await loadProducts({ includeInactive: true });
  renderAdminProducts();
}

async function refreshOrders() {
  const snapshot = await getDocs(collection(db, "orders"));
  adminOrders = snapshot.docs
    .map((entry) => ({ ...entry.data(), docId: entry.id }))
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
  renderAdminOrders();
}

function renderDashboard() {
  const root = $("#dashboard-stats");
  if (!root) return;
  const todayKey = new Date().toLocaleDateString("zh-TW");
  const todayOrders = adminOrders.filter((order) => {
    const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0);
    return date.toLocaleDateString("zh-TW") === todayKey;
  }).length;
  const paidDepositAmount = adminOrders
    .filter((order) => order.paymentStatus === "訂金已付款")
    .reduce((sum, order) => sum + Number(order.depositAmount || 0), 0);
  const lowStock = adminProducts.filter((product) => Number(product.stock || 0) <= 5);
  const hot = getHotProducts();

  const stats = [
    ["今日訂單數", todayOrders],
    ["待付訂金訂單", adminOrders.filter((order) => order.paymentStatus === "待付訂金").length],
    ["訂金待確認", adminOrders.filter((order) => order.paymentStatus === "訂金待確認").length],
    ["訂金已付款金額", formatCurrency(paidDepositAmount)],
    ["採買中訂單", adminOrders.filter((order) => order.orderStatus === "泰國採買中").length],
    ["已出貨訂單", adminOrders.filter((order) => order.orderStatus === "已出貨").length],
    ["熱銷商品", hot[0]?.name || "尚無"],
    ["庫存不足商品", lowStock.length]
  ];

  root.innerHTML = stats.map(([label, value]) => `
    <div class="stat-card">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
    </div>
  `).join("");

  const hotRoot = $("#hot-products");
  if (hotRoot) {
    hotRoot.innerHTML = hot.length
      ? hot.map((item) => `<p>${escapeHTML(item.name)}：${item.quantity} 件</p>`).join("")
      : "<p class='muted'>尚無銷售資料。</p>";
  }

  const lowRoot = $("#low-stock-products");
  if (lowRoot) {
    lowRoot.innerHTML = lowStock.length
      ? lowStock.map((item) => `<p>${escapeHTML(item.name)}：剩 ${item.stock}</p>`).join("")
      : "<p class='muted'>目前沒有低庫存商品。</p>";
  }
}

function getHotProducts() {
  const map = new Map();
  adminOrders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const current = map.get(item.name) || 0;
      map.set(item.name, current + Number(item.quantity || 0));
    });
  });
  return Array.from(map.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);
}

function getProductKey(product) {
  return product?.docId || product?.id || "";
}

function findAdminProduct(key) {
  return adminProducts.find((product) => getProductKey(product) === key || product.id === key);
}

function collectProductImages() {
  const cover = ($("#admin-image")?.value || "").trim();
  const extras = ($("#admin-images")?.value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([cover, ...extras].filter(Boolean))];
}

function setProductImages(images = []) {
  const cleanImages = [...new Set(images.map((image) => String(image || "").trim()).filter(Boolean))];
  const cover = $("#admin-image");
  const extras = $("#admin-images");
  if (cover) cover.value = cleanImages[0] || "";
  if (extras) extras.value = cleanImages.slice(1).join("\n");
  renderProductImagePreview();
}

function renderProductImagePreview() {
  const preview = $("#admin-image-preview");
  if (!preview) return;
  const images = collectProductImages();
  preview.innerHTML = images.length
    ? `<div class="admin-preview-grid">${images.slice(0, 4).map((image, index) => `
        <figure>
          <img src="${escapeHTML(image)}" alt="商品圖片 ${index + 1}" onerror="this.src='assets/product-placeholder.svg'">
          <figcaption>${index === 0 ? "封面" : `照片 ${index + 1}`}</figcaption>
        </figure>
      `).join("")}</div>`
    : "<span>尚未選擇圖片</span>";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function compressImageFile(file) {
  const source = await readAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, ADMIN_IMAGE_MAX_SIZE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffaf3";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", ADMIN_IMAGE_QUALITY));
  return blob ? readAsDataUrl(blob) : source;
}

function resetProductForm(form) {
  form.reset();
  $("#admin-product-id").value = "";
  $("#admin-active").checked = true;
  $("#admin-preorder").checked = true;
  setProductImages([]);
}

function bindProductTools() {
  $("#admin-product-search")?.addEventListener("input", renderAdminProducts);
  ["#admin-image", "#admin-images"].forEach((selector) => {
    $(selector)?.addEventListener("input", renderProductImagePreview);
  });

  const upload = $("#admin-image-upload");
  upload?.addEventListener("change", async () => {
    const files = Array.from(upload.files || [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 4);
    if (!files.length) return;
    upload.disabled = true;
    showToast("正在處理圖片...");
    try {
      const uploadedImages = [];
      for (const file of files) {
        uploadedImages.push(await compressImageFile(file));
      }
      setProductImages([...uploadedImages, ...collectProductImages()]);
      showToast("圖片已加入商品");
    } catch (error) {
      console.error(error);
      showToast("圖片處理失敗，請換一張圖片試試");
    } finally {
      upload.disabled = false;
      upload.value = "";
    }
  });

  renderProductImagePreview();
}

function bindProductForm() {
  const form = $("#admin-product-form");
  if (!form) return;
  $("#reset-product-form")?.addEventListener("click", () => {
    resetProductForm(form);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const existingId = $("#admin-product-id").value;
    const name = $("#admin-name").value.trim();
    const id = existingId || slugify(name);
    const images = collectProductImages();
    const payload = {
      id,
      name,
      image: images[0] || "assets/product-placeholder.svg",
      images,
      category: $("#admin-category").value,
      description: $("#admin-description").value.trim(),
      price: Number($("#admin-price").value || 0),
      originalPrice: Number($("#admin-original-price").value || 0),
      spec: $("#admin-spec").value.trim(),
      stock: Number($("#admin-stock").value || 0),
      isActive: $("#admin-active").checked,
      isPreorder: $("#admin-preorder").checked,
      arrivalDate: $("#admin-arrival").value,
      deadline: $("#admin-deadline").value,
      limitPerUser: Number($("#admin-limit").value || 0),
      promotionText: $("#admin-promotion").value.trim(),
      status: $("#admin-status").value,
      updatedAt: serverTimestamp()
    };
    if (!existingId) payload.createdAt = serverTimestamp();

    try {
      await setDoc(doc(db, "products", id), payload, { merge: true });
      showToast("商品已儲存");
      resetProductForm(form);
      await refreshProducts();
      renderDashboard();
    } catch (error) {
      console.error(error);
      showToast("商品儲存失敗");
    }
  });
}

function renderAdminProducts() {
  const root = $("#admin-products-table");
  if (!root) return;
  const keyword = ($("#admin-product-search")?.value || "").trim().toLowerCase();
  const products = adminProducts.filter((product) => {
    const haystack = `${product.name} ${product.category} ${product.description} ${product.status}`.toLowerCase();
    return !keyword || haystack.includes(keyword);
  });
  root.innerHTML = `
    ${products.length ? `<div class="admin-product-grid">
      ${products.map((product) => {
        const key = getProductKey(product);
        return `
          <article class="admin-product-card" data-product-card="${escapeHTML(key)}">
            <img class="admin-product-thumb" src="${escapeHTML(getProductImage(product))}" alt="${escapeHTML(product.name)}" onerror="this.src='assets/product-placeholder.svg'">
            <div class="admin-product-body">
              <div class="admin-product-status">
                <span class="${product.isActive ? "is-live" : "is-off"}">${product.isActive ? "上架中" : "已下架"}</span>
                <span>${product.isPreorder !== false ? "開放預購" : "現貨"}</span>
              </div>
              <h3>${escapeHTML(product.name)}</h3>
              <p class="muted">${escapeHTML(product.category)}｜${escapeHTML(product.spec || "未設定規格")}</p>
              <div class="admin-product-meta">
                <strong>${formatCurrency(product.price)}</strong>
                <span>庫存 ${Number(product.stock || 0)}</span>
              </div>
              <div class="admin-product-actions">
                <button class="btn btn--ghost btn--small" type="button" data-edit-product="${escapeHTML(key)}">編輯</button>
                <button class="btn btn--ghost btn--small" type="button" data-toggle-product="${escapeHTML(key)}">${product.isActive ? "下架" : "上架"}</button>
                <button class="btn btn--ghost btn--small" type="button" data-delete-product="${escapeHTML(key)}">刪除</button>
              </div>
            </div>
          </article>
        `;
      }).join("")}
    </div>` : "<div class='empty-state'>目前沒有符合條件的商品。</div>"}
  `;

  root.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => fillProductForm(findAdminProduct(button.dataset.editProduct)));
  });
  root.querySelectorAll("[data-toggle-product]").forEach((button) => {
    button.addEventListener("click", async () => {
      const product = findAdminProduct(button.dataset.toggleProduct);
      if (!product) return;
      await updateDoc(doc(db, "products", product.docId || product.id), {
        isActive: !product.isActive,
        updatedAt: serverTimestamp()
      });
      await refreshProducts();
    });
  });
  root.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", async () => {
      const product = findAdminProduct(button.dataset.deleteProduct);
      if (!product || !confirm(`確定刪除 ${product.name}？`)) return;
      await deleteDoc(doc(db, "products", product.docId || product.id));
      await refreshProducts();
      renderDashboard();
    });
  });
}

function fillProductForm(product) {
  if (!product) return;
  $("#admin-product-id").value = product.docId || product.id;
  $("#admin-name").value = product.name || "";
  setProductImages([product.image, ...(Array.isArray(product.images) ? product.images : [])]);
  $("#admin-category").value = product.category || PRODUCT_CATEGORIES[0];
  $("#admin-description").value = product.description || "";
  $("#admin-price").value = product.price || 0;
  $("#admin-original-price").value = product.originalPrice || 0;
  $("#admin-spec").value = product.spec || "";
  $("#admin-stock").value = product.stock || 0;
  $("#admin-active").checked = product.isActive !== false;
  $("#admin-preorder").checked = product.isPreorder !== false;
  $("#admin-arrival").value = product.arrivalDate || "";
  $("#admin-deadline").value = product.deadline || "";
  $("#admin-limit").value = product.limitPerUser || 0;
  $("#admin-promotion").value = product.promotionText || "";
  $("#admin-status").value = product.status || PRODUCT_STATUS[0];
  window.scrollTo({ top: $("#products-admin").offsetTop - 120, behavior: "smooth" });
}

function bindOrderFilters() {
  ["#order-search", "#order-payment-filter", "#order-status-filter"].forEach((selector) => {
    $(selector)?.addEventListener("input", renderAdminOrders);
  });
}

function renderAdminOrders() {
  const root = $("#admin-orders-table");
  if (!root) return;
  const keyword = ($("#order-search")?.value || "").trim().toLowerCase();
  const paymentFilter = $("#order-payment-filter")?.value || "全部付款狀態";
  const statusFilter = $("#order-status-filter")?.value || "全部訂單狀態";

  const orders = adminOrders.filter((order) => {
    const haystack = `${order.orderId} ${order.customerInfo?.name || ""} ${order.customerInfo?.phone || ""}`.toLowerCase();
    const paymentOk = paymentFilter === "全部付款狀態" || order.paymentStatus === paymentFilter;
    const statusOk = statusFilter === "全部訂單狀態" || order.orderStatus === statusFilter;
    return (!keyword || haystack.includes(keyword)) && paymentOk && statusOk;
  });

  root.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>訂單</th>
          <th>客戶</th>
          <th>金額</th>
          <th>付款狀態</th>
          <th>訂單狀態</th>
          <th>物流與備註</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map((order) => `
          <tr data-admin-order="${escapeHTML(order.orderId)}">
            <td><strong>${escapeHTML(order.orderId)}</strong><br><span class="muted">${formatDateTime(order.createdAt)}</span></td>
            <td>${escapeHTML(order.customerInfo?.name || "")}<br><span class="muted">${escapeHTML(order.customerInfo?.phone || "")}</span></td>
            <td>
              ${formatCurrency(order.total)}<br>
              <span class="muted">訂金 ${formatCurrency(order.depositAmount)}</span>
              ${Number(order.loyalty?.pointsRedeemed || 0) > 0 ? `<br><span class="muted">點數折抵 ${Number(order.loyalty.pointsRedeemed)} 點</span>` : ""}
              ${Number(order.loyalty?.pointsEarned || 0) > 0 ? `<br><span class="muted">預計累積 ${Number(order.loyalty.pointsEarned)} 點</span>` : ""}
            </td>
            <td><select data-admin-payment>${PAYMENT_STATUS.map((status) => `<option value="${escapeHTML(status)}" ${order.paymentStatus === status ? "selected" : ""}>${escapeHTML(status)}</option>`).join("")}</select></td>
            <td><select data-admin-status>${ORDER_STATUS.map((status) => `<option value="${escapeHTML(status)}" ${order.orderStatus === status ? "selected" : ""}>${escapeHTML(status)}</option>`).join("")}</select></td>
            <td>
              <input data-admin-tracking value="${escapeHTML(order.trackingNumber || "")}" placeholder="物流單號">
              <textarea data-admin-note placeholder="管理員備註">${escapeHTML(order.adminNote || "")}</textarea>
            </td>
            <td><button class="btn btn--primary btn--small" type="button" data-save-order>儲存</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  root.querySelectorAll("[data-save-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-admin-order]");
      const orderId = row.dataset.adminOrder;
      const paymentStatus = row.querySelector("[data-admin-payment]").value;
      const orderStatus = row.querySelector("[data-admin-status]").value;
      const trackingNumber = row.querySelector("[data-admin-tracking]").value.trim();
      const adminNote = row.querySelector("[data-admin-note]").value.trim();
      const currentOrder = adminOrders.find((order) => order.orderId === orderId);
      const pointsEarned = Number(currentOrder?.loyalty?.pointsEarned || 0);
      const shouldAwardPoints = paymentStatus === "訂金已付款"
        && pointsEarned > 0
        && !currentOrder?.loyalty?.pointsAwarded
        && currentOrder?.userId;
      try {
        const orderUpdates = {
          paymentStatus,
          orderStatus,
          trackingNumber,
          adminNote,
          updatedAt: serverTimestamp()
        };

        const batch = writeBatch(db);
        batch.update(doc(db, "orders", orderId), shouldAwardPoints
          ? {
              ...orderUpdates,
              loyalty: {
                ...currentOrder.loyalty,
                pointsAwarded: true,
                pointsAwardedAt: new Date().toISOString()
              }
            }
          : orderUpdates);

        if (shouldAwardPoints) {
          const userRef = doc(db, "users", currentOrder.userId);
          const userSnapshot = await getDoc(userRef);
          const currentPoints = Number(userSnapshot.data()?.pointsBalance || 0);
          batch.set(userRef, {
            pointsBalance: currentPoints + pointsEarned,
            pointsUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        await batch.commit();
        showToast(shouldAwardPoints ? `訂單已更新，已累積 ${pointsEarned} 點` : "訂單已更新");
        await refreshOrders();
        renderDashboard();
      } catch (error) {
        console.error(error);
        showToast("訂單更新失敗");
      }
    });
  });
}

function bindCsvExport() {
  $("#export-orders")?.addEventListener("click", () => {
    const rows = [
      ["訂單編號", "下單時間", "客戶姓名", "手機", "付款方式", "付款狀態", "訂單狀態", "總金額", "訂金", "尾款", "物流單號"],
      ...adminOrders.map((order) => [
        order.orderId,
        formatDateTime(order.createdAt),
        order.customerInfo?.name || "",
        order.customerInfo?.phone || "",
        order.paymentMethod || "",
        order.paymentStatus || "",
        order.orderStatus || "",
        order.total || 0,
        order.depositAmount || 0,
        order.remainingAmount || 0,
        order.trackingNumber || ""
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kuang-thailand-orders-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

function bindSampleImport() {
  $("#import-sample-products")?.addEventListener("click", async () => {
    if (!confirm("要將範例商品寫入 Firestore products 嗎？")) return;
    try {
      const samples = await fetchSampleProducts();
      await Promise.all(samples.map((product) => setDoc(doc(db, "products", product.id), {
        ...normalizeProduct(product),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true })));
      showToast("範例商品已匯入");
      await refreshProducts();
      renderDashboard();
    } catch (error) {
      console.error(error);
      showToast("範例商品匯入失敗");
    }
  });
}
