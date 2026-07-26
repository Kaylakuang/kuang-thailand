import {
  db,
  doc,
  auth,
  onAuthStateChanged,
  writeBatch,
  serverTimestamp
} from "./firebase.js";
import { ensureUserProfile } from "./auth.js?v=202607242329";
import {
  BANK_INFO,
  LOYALTY_SETTINGS,
  PAYMENT_METHODS,
  PAYMENT_SETTINGS,
  SHIPPING_METHODS
} from "./settings.js?v=202607242329";
import {
  $,
  escapeHTML,
  formatCurrency,
  formatDateTime,
  generateOrderId,
  getPaymentDeadline,
  renderBankInfo,
  renderSummaryRows,
  showToast
} from "./utils.js?v=202607242329";
import {
  calculateCartTotals,
  clearCart,
  getCartItems,
  getManualGiftQuantity,
  renderCartSummary
} from "./cart.js?v=202607261330";

const CHECKOUT_PROFILE_CACHE_KEY = "kt-checkout-profile";
const CHECKOUT_DRAFT_KEY = "kt-checkout-draft";

export async function initCheckoutPage() {
  const items = getCartItems();
  const form = $("#checkout-form");
  const itemsRoot = $("#checkout-items");
  const loyaltyRoot = $("#checkout-loyalty");
  const summary = $("#checkout-summary");
  if (!form || !itemsRoot || !summary) return;

  fillSelect("#shipping-method", SHIPPING_METHODS);
  fillSelect("#payment-method", PAYMENT_METHODS);
  loadCheckoutDraft();
  bindShippingMethodFields();
  bindPaymentMethodNote();
  bindPolicyModal();
  bindCheckoutDraft(form);

  if (!items.length) {
    form.innerHTML = `
      <div class="empty-state">
        <p>購物車目前沒有商品，請先選購商品。</p>
        <a class="btn btn--primary" href="products.html">前往選購</a>
      </div>
    `;
    return;
  }

  let checkoutState = null;
  let availablePoints = 0;
  const deadline = getPaymentDeadline();
  renderCheckoutItems(itemsRoot, items);
  renderLoyaltyPanel(loyaltyRoot, availablePoints);
  const paintMoney = () => {
    const totals = getCheckoutTotals(items, availablePoints);
    renderCartSummary(summary, totals);
    updateLoyaltyPanel(totals, availablePoints);
  };
  const bindRedeemInput = () => $("#redeem-points")?.addEventListener("input", paintMoney);
  bindRedeemInput();
  paintMoney();

  const authStatePromise = waitForCheckoutUser().then(async (user) => {
    if (!user) {
      redirectToLogin();
      return null;
    }
    checkoutState = { user, profile: getCachedCheckoutProfile(user.uid) || {} };
    fillProfile(user, checkoutState.profile);
    try {
      checkoutState.profile = await ensureUserProfile(user);
      cacheCheckoutProfile(user, checkoutState.profile);
    } catch (error) {
      console.warn("Unable to load checkout profile.", error);
    }
    const state = checkoutState;
    checkoutState = state;
    availablePoints = getAvailablePoints(state.profile);
    fillProfile(state.user, state.profile);
    saveCheckoutDraft();
    renderLoyaltyPanel(loyaltyRoot, availablePoints);
    bindRedeemInput();
    paintMoney();
    return state;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const state = checkoutState || await authStatePromise;
    if (!state) return;
    const submitButton = form.querySelector('button[type="submit"]');
    const consent = ["#agree-preorder", "#agree-policy", "#agree-payment"].every((selector) => $(selector)?.checked);
    if (!consent) {
      showToast("請先確認付款與預購說明");
      return;
    }

    const orderId = generateOrderId();
    const totals = getCheckoutTotals(items, availablePoints);
    const customerInfo = {
      name: $("#customer-name").value.trim(),
      phone: $("#customer-phone").value.trim(),
      email: $("#customer-email").value.trim(),
      lineName: $("#customer-line").value.trim()
    };
    const shippingMethod = $("#shipping-method").value;
    const paymentMethod = $("#payment-method").value;
    const paymentMethodNote = getPaymentMethodNote(paymentMethod);
    const shippingInfo = {
      shippingMethod,
      address: $("#shipping-address").value.trim(),
      storeName: $("#store-name").value.trim(),
      storeCode: $("#store-code").value.trim(),
      recipientName: customerInfo.name
    };
    const customerNote = $("#customer-note").value.trim();

    if (!customerInfo.name || !customerInfo.phone || !customerInfo.email) {
      showToast("請填寫完整收件人資料");
      return;
    }

    const orderItems = items.map((item) => ({
      ...item,
      giftQuantity: getManualGiftQuantity(item, items)
    }));
    const order = {
      orderId,
      userId: state.user.uid,
      customerInfo,
      items: orderItems,
      subtotal: totals.subtotal,
      shippingFee: totals.shippingFee,
      discount: totals.discount,
      total: totals.total,
      depositRate: PAYMENT_SETTINGS.depositRate,
      depositAmount: totals.depositAmount,
      remainingAmount: totals.remainingAmount,
      loyalty: {
        pointsRedeemed: totals.pointsRedeemed,
        pointsDiscount: totals.pointsDiscount,
        pointsEarned: totals.pointsEarned,
        pointsAwarded: false,
        earnRate: LOYALTY_SETTINGS.dollarsPerPoint,
        pointValue: LOYALTY_SETTINGS.pointValue
      },
      paymentMethod,
      paymentStatus: "待付訂金",
      orderStatus: "等待訂金",
      shippingMethod,
      shippingInfo,
      paymentInfo: {
        bankName: BANK_INFO.bankName,
        bankCode: BANK_INFO.bankCode,
        accountNumber: BANK_INFO.accountNumber,
        accountName: BANK_INFO.accountName,
        paymentDeadline: deadline,
        paymentMethodNote
      },
      trackingNumber: "",
      adminNote: "",
      customerNote,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      if (submitButton) submitButton.disabled = true;
      const batch = writeBatch(db);
      batch.set(doc(db, "orders", orderId), order);
      if (totals.pointsRedeemed > 0) {
        batch.set(doc(db, "users", state.user.uid), {
          pointsBalance: Math.max(availablePoints - totals.pointsRedeemed, 0),
          pointsUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
      await sendOrderConfirmationEmail(order);
      clearCheckoutDraft();
      clearCart();
      showPaymentModal(order);
    } catch (error) {
      console.error(error);
      if (submitButton) submitButton.disabled = false;
      showToast(getCheckoutSubmitErrorMessage(error));
    }
  });
}

function getCheckoutSubmitErrorMessage(error = {}) {
  const code = String(error.code || "");
  const message = String(error.message || "");
  if (code.includes("permission-denied") || message.includes("permission")) {
    return "送出失敗：請確認已登入並部署 Firestore Rules";
  }
  if (code.includes("unauthenticated")) {
    return "請先登入後再送出訂單";
  }
  if (code.includes("unavailable") || message.includes("network")) {
    return "Firebase 連線不穩，請稍後再試";
  }
  return "訂單送出失敗，請稍後再試";
}

function waitForCheckoutUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function redirectToLogin() {
  const next = encodeURIComponent(`${window.location.pathname.split("/").pop()}${window.location.search}`);
  window.location.href = `login.html?next=${next}`;
}

function getPaymentMethodNote(paymentMethod) {
  return paymentMethod === "LINE Pay" ? "請聯絡店家" : "";
}

function bindPaymentMethodNote() {
  const payment = $("#payment-method");
  const note = $("#payment-method-note");
  if (!payment || !note) return;

  const sync = () => {
    const text = getPaymentMethodNote(payment.value);
    note.textContent = text;
    note.classList.toggle("is-hidden", !text);
  };

  payment.addEventListener("input", sync);
  payment.addEventListener("change", sync);
  sync();
}

function bindPolicyModal() {
  const modal = $("#policy-modal");
  const openButtons = document.querySelectorAll("[data-open-policy]");
  if (!modal || !openButtons.length) return;

  const open = () => {
    modal.classList.remove("is-hidden");
    document.body.classList.add("has-modal");
  };
  const close = () => {
    modal.classList.add("is-hidden");
    document.body.classList.remove("has-modal");
  };

  openButtons.forEach((button) => {
    button.addEventListener("click", open);
  });
  modal.querySelectorAll("[data-close-policy]").forEach((button) => {
    button.addEventListener("click", close);
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("is-hidden")) close();
  });
}

function fillSelect(selector, options) {
  const select = $(selector);
  if (!select) return;
  select.innerHTML = options.map((option) => `<option value="${escapeHTML(option)}">${escapeHTML(option)}</option>`).join("");
}

function fillProfile(user, profile = {}) {
  setFieldValue("#customer-name", profile?.name || user.displayName || "");
  setFieldValue("#customer-email", user.email || profile?.email || "");
  setFieldValue("#customer-phone", profile?.phone || "");
  setFieldValue("#customer-line", profile?.lineName || "");
  setFieldValue("#shipping-address", profile?.address || "");
  setFieldValue("#store-name", profile?.store || "");
}

function setFieldValue(selector, value, force = false) {
  const field = $(selector);
  if (!field || !value || (!force && field.value.trim())) return;
  field.value = value;
}

function getCheckoutDraftValues() {
  return {
    name: $("#customer-name")?.value.trim() || "",
    phone: $("#customer-phone")?.value.trim() || "",
    email: $("#customer-email")?.value.trim() || "",
    lineName: $("#customer-line")?.value.trim() || "",
    shippingMethod: $("#shipping-method")?.value || "",
    address: $("#shipping-address")?.value.trim() || "",
    storeName: $("#store-name")?.value.trim() || "",
    storeCode: $("#store-code")?.value.trim() || "",
    paymentMethod: $("#payment-method")?.value || "",
    customerNote: $("#customer-note")?.value.trim() || ""
  };
}

function loadCheckoutDraft() {
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY) || "null");
  } catch {
    draft = null;
  }
  if (!draft) return;
  setFieldValue("#customer-name", draft.name, true);
  setFieldValue("#customer-phone", draft.phone, true);
  setFieldValue("#customer-email", draft.email, true);
  setFieldValue("#customer-line", draft.lineName, true);
  setFieldValue("#shipping-method", draft.shippingMethod, true);
  setFieldValue("#shipping-address", draft.address, true);
  setFieldValue("#store-name", draft.storeName, true);
  setFieldValue("#store-code", draft.storeCode, true);
  setFieldValue("#payment-method", draft.paymentMethod, true);
  setFieldValue("#customer-note", draft.customerNote, true);
}

function bindCheckoutDraft(form) {
  form.addEventListener("input", saveCheckoutDraft);
  form.addEventListener("change", saveCheckoutDraft);
}

function saveCheckoutDraft() {
  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(getCheckoutDraftValues()));
}

function clearCheckoutDraft() {
  localStorage.removeItem(CHECKOUT_DRAFT_KEY);
}

function getCachedCheckoutProfile(uid) {
  try {
    const cached = JSON.parse(localStorage.getItem(CHECKOUT_PROFILE_CACHE_KEY) || "{}");
    return cached.uid === uid ? cached.profile : null;
  } catch {
    return null;
  }
}

function cacheCheckoutProfile(user, profile = {}) {
  if (!user) return;
  localStorage.setItem(CHECKOUT_PROFILE_CACHE_KEY, JSON.stringify({
    uid: user.uid,
    profile: {
      name: profile?.name || user.displayName || "",
      email: user.email || profile?.email || "",
      phone: profile?.phone || "",
      lineName: profile?.lineName || "",
      address: profile?.address || "",
      store: profile?.store || "",
      pointsBalance: Number(profile?.pointsBalance || 0)
    }
  }));
}

function bindShippingMethodFields() {
  const method = $("#shipping-method");
  const address = $("#shipping-address");
  const storeName = $("#store-name");
  const storeCode = $("#store-code");
  if (!method || !address || !storeName || !storeCode) return;

  const sync = () => {
    const value = method.value;
    const isStore = value === "店到店";
    const isDelivery = value.includes("宅配");
    const isMeetup = value === "面交";
    document.querySelectorAll('[data-shipping-field="store"]').forEach((field) => {
      field.classList.toggle("is-hidden", !isStore);
    });
    document.querySelectorAll('[data-shipping-field="address"]').forEach((field) => {
      field.classList.toggle("is-hidden", !(isDelivery || isMeetup));
    });
    address.placeholder = isMeetup ? "可填寫希望面交地點或時間" : "宅配限大件物品，請填寫完整地址";
    address.required = isDelivery;
    storeName.required = isStore;
    storeCode.required = false;
  };

  method.addEventListener("input", sync);
  method.addEventListener("change", sync);
  sync();
}

function getAvailablePoints(profile = {}) {
  return Math.max(0, Math.floor(Number(profile?.pointsBalance || 0)));
}

function getCheckoutTotals(items, availablePoints) {
  const input = $("#redeem-points");
  const requested = Math.max(0, Math.floor(Number(input?.value || 0)));
  const baseTotals = calculateCartTotals(items);
  const maxByOrder = Math.max(0, Number(baseTotals.maxRedeemablePoints || 0));
  const pointsRedeemed = Math.min(requested, availablePoints, maxByOrder);
  if (input && Number(input.value || 0) !== pointsRedeemed) {
    input.value = String(pointsRedeemed);
  }
  return calculateCartTotals(items, { pointsRedeemed });
}

function renderLoyaltyPanel(target, availablePoints) {
  if (!target) return;
  target.innerHTML = `
    <div class="loyalty-strip__item">
      <span>持有</span>
      <strong data-points-available>${availablePoints} 點</strong>
    </div>
    <div class="loyalty-strip__item">
      <span>本單最多</span>
      <strong data-points-max>0 點</strong>
    </div>
    <div class="loyalty-strip__item">
      <span>預計累積</span>
      <strong data-points-earned>0 點</strong>
    </div>
    <label class="loyalty-strip__redeem" for="redeem-points">
      <span>折抵</span>
      <input id="redeem-points" type="number" min="0" max="${availablePoints}" step="1" inputmode="numeric" value="0" ${availablePoints > 0 ? "" : "disabled"}>
    </label>
  `;
}

function updateLoyaltyPanel(totals, availablePoints) {
  const available = $("[data-points-available]");
  const maximum = $("[data-points-max]");
  const earned = $("[data-points-earned]");
  const input = $("#redeem-points");
  const usableMaximum = Math.min(
    availablePoints,
    Math.max(0, Number(totals.maxRedeemablePoints || 0))
  );
  if (available) available.textContent = `${availablePoints} 點`;
  if (maximum) maximum.textContent = `${usableMaximum} 點`;
  if (earned) earned.textContent = `${Number(totals.pointsEarned || 0)} 點`;
  if (input) {
    input.max = String(usableMaximum);
    input.disabled = usableMaximum <= 0;
    input.title = "商品滿 NT$100 未滿 NT$500 最多使用 50 點；每滿 NT$500 最多使用 100 點，運費不折抵。";
  }
}

function showPaymentModal(order) {
  const modal = $("#payment-modal");
  const summary = $("#payment-modal-summary");
  const bank = $("#payment-modal-bank");
  const copyButton = $("#payment-copy-button");
  const successLink = $("#payment-success-link");
  if (!modal || !summary || !bank || !copyButton || !successLink) {
    window.location.href = `order-success.html?orderId=${encodeURIComponent(order.orderId)}`;
    return;
  }

  summary.innerHTML = `
    <div class="payment-success-summary">
      <div><span>訂單編號</span><strong>${escapeHTML(order.orderId)}</strong></div>
      <div><span>付款方式</span><strong>${escapeHTML(order.paymentMethod)}</strong></div>
      <div><span>匯款訂金金額</span><strong>${formatCurrency(order.depositAmount)}</strong></div>
    </div>
  `;
  bank.innerHTML = renderBankInfo(order);
  copyButton.onclick = async () => {
    const copied = await copyPaymentInfo(buildPaymentCopyText(order));
    showToast(copied ? "匯款資訊已複製" : "複製失敗，請手動複製匯款資訊");
  };
  successLink.href = `order-success.html?orderId=${encodeURIComponent(order.orderId)}`;
  modal.classList.remove("is-hidden");
  document.body.classList.add("has-modal");
}

function buildPaymentCopyText(order) {
  return [
    `${order.customerInfo.name} 您好，`,
    "",
    `您的訂單 ${order.orderId} 已送出，以下是匯款資訊：`,
    "",
    `銀行名稱：${BANK_INFO.bankName}`,
    `銀行代碼：${BANK_INFO.bankCode}`,
    `匯款帳號：${BANK_INFO.accountNumber}`,
    `戶名：${BANK_INFO.accountName}`,
    "",
    `訂單總金額：${formatCurrency(order.total)}`,
    `匯款訂金金額：${formatCurrency(order.depositAmount)}`,
    `尾款金額：${formatCurrency(order.remainingAmount)}`,
    `付款期限：${formatDateTime(order.paymentInfo.paymentDeadline)}`,
    "",
    "匯款完成後，請回到網站回填匯款資料，方便確認付款。"
  ].join("\n");
}

async function copyPaymentInfo(text) {
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

function renderCheckoutItems(target, items) {
  target.innerHTML = `
    <h2>訂單商品</h2>
    <div class="checkout-item-list">
      ${items.map((item) => {
        const giftQuantity = getManualGiftQuantity(item, items);
        return `
          <div class="checkout-line-item">
            <div>
              <h3>${escapeHTML(item.name)}</h3>
              <p>${escapeHTML(item.spec || item.category || "")}</p>
              ${item.variant ? `<p>款式：${escapeHTML(item.variant)}</p>` : ""}
              ${giftQuantity > 0 ? `<p>🎁 出貨加贈 ${giftQuantity} 件（贈品不計價）</p>` : ""}
            </div>
            <div class="checkout-line-price">
              <span>${formatCurrency(item.price)} x ${item.quantity}</span>
              <strong>${formatCurrency(item.price * item.quantity)}</strong>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// 目前未串接 Email 服務，保留函式避免未來接 EmailJS、Cloud Functions 或其他服務時影響下單流程。
async function sendOrderConfirmationEmail(order) {
  console.info("Email service is not configured. Order email skipped.", order.orderId);
}

export function renderDepositExample(selector = "#deposit-example") {
  const target = $(selector);
  if (!target) return;
  const total = 3001;
  const depositAmount = Math.ceil(total * PAYMENT_SETTINGS.depositRate);
  const remainingAmount = total - depositAmount;
  target.innerHTML = `
    <div class="summary-list">
      ${renderSummaryRows({
        subtotal: total,
        shippingFee: 0,
        discount: 0,
        total,
        depositRate: PAYMENT_SETTINGS.depositRate,
        depositAmount,
        remainingAmount
      })}
    </div>
    <p class="muted" style="margin-top:12px">例如訂單總金額 ${formatCurrency(total)}，訂金 50% 會自動無條件進位為 ${formatCurrency(depositAmount)}，尾款為 ${formatCurrency(remainingAmount)}。</p>
  `;
}
