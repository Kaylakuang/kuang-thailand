import {
  db,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "./firebase.js";
import { requireAuth } from "./auth.js";
import {
  $,
  formatCurrency,
  getParam,
  showToast
} from "./utils.js";
import { loadOrder } from "./orders.js?v=202607250001";

let currentOrder = null;
let currentUser = null;
const PAYMENT_ORDER_PREVIEW_KEY = "kt-payment-order-preview";

export async function initPaymentUploadPage() {
  const state = await requireAuth();
  if (!state) return;
  currentUser = state.user;

  const orderId = getParam("orderId");
  const form = $("#payment-form");
  if (!form) return;

  paintPaymentAmount(readPaymentOrderPreview(orderId));
  await paintOrder(orderId);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    if (!currentOrder && orderId) {
      await paintOrder(orderId);
    }
    if (!currentOrder) {
      showToast("找不到這筆訂單");
      return;
    }

    const amount = Number(currentOrder.depositAmount || 0);
    const accountLastFive = $("#account-last-five").value.trim();
    const payerName = $("#payer-name").value.trim();
    const transferDate = $("#transfer-date").value;
    const note = $("#payment-note").value.trim();

    if (!transferDate || !amount || accountLastFive.length !== 5 || !payerName) {
      showToast("請完整填寫匯款日期、姓名與帳號後五碼");
      return;
    }

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "送出中";
      }
      const paymentRef = doc(db, "payments", currentOrder.orderId);
      const paymentPayload = {
        orderId: currentOrder.orderId,
        userId: currentUser.uid,
        transferDate,
        amount,
        accountLastFive,
        payerName,
        note,
        status: "訂金待確認",
        updatedAt: serverTimestamp()
      };

      await setDoc(paymentRef, paymentPayload, { merge: true });
      await updateDoc(doc(db, "orders", currentOrder.docId || currentOrder.orderId), {
        paymentStatus: "訂金待確認",
        paymentInfo: {
          ...(currentOrder.paymentInfo || {}),
          transferDate,
          amount,
          accountLastFive,
          payerName,
          note,
          submittedAt: new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      });

      showPaymentUploadSuccess();
    } catch (error) {
      console.error(error);
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "送出匯款資料";
      }
      showToast("匯款回填失敗，請稍後再試");
    }
  });
}

function showPaymentUploadSuccess() {
  const modal = $("#payment-upload-success-modal");
  if (!modal) {
    showToast("匯款資料回填成功");
    window.location.href = "index.html";
    return;
  }
  modal.classList.remove("is-hidden");
  document.body.classList.add("has-modal");
}

async function paintOrder(orderId) {
  const panel = $("#payment-order-panel");
  if (!panel) return;
  if (!orderId) {
    currentOrder = null;
    paintPaymentAmount(null);
    panel.innerHTML = '<div class="empty-state">請從訂單明細進入匯款回填。</div>';
    setPaymentFormDisabled(true);
    return;
  }

  const previewOrder = readPaymentOrderPreview(orderId);
  if (previewOrder) {
    panel.innerHTML = renderPaymentDepositCard(previewOrder);
    paintPaymentAmount(previewOrder);
  } else {
    panel.innerHTML = '<div class="loading">正在讀取訂單資料...</div>';
    paintPaymentAmount(null);
  }
  setPaymentFormDisabled(true);

  try {
    currentOrder = await loadOrder(orderId);
  } catch (error) {
    console.error(error);
    currentOrder = null;
  }

  if (!currentOrder || currentOrder.userId !== currentUser.uid) {
    panel.innerHTML = '<div class="empty-state">找不到這筆訂單。</div>';
    paintPaymentAmount(null);
    setPaymentFormDisabled(true);
    return;
  }

  panel.innerHTML = renderPaymentDepositCard(currentOrder);
  paintPaymentAmount(currentOrder);
  writePaymentOrderPreview(currentOrder);
  setPaymentFormDisabled(false);
}

function renderPaymentDepositCard(order) {
  return `
    <div class="payment-deposit-card">
      <div class="payment-deposit-card__copy">
        <p>本次需匯款訂金</p>
        <span>訂單總金額 ${formatCurrency(order.total)}，尾款 ${formatCurrency(order.remainingAmount)}</span>
      </div>
      <strong>${formatCurrency(order.depositAmount)}</strong>
    </div>
  `;
}

function paintPaymentAmount(order) {
  const amountInput = $("#payment-amount-display");
  if (!amountInput) return;
  const amount = Number(order?.depositAmount || 0);
  amountInput.value = amount ? formatCurrency(amount) : "";
}

function readPaymentOrderPreview(orderId) {
  const depositAmount = Number(getParam("deposit") || 0);
  const total = Number(getParam("total") || 0);
  const remainingAmount = Number(getParam("remaining") || 0);
  if (orderId && depositAmount > 0) {
    return { orderId, depositAmount, total, remainingAmount };
  }

  try {
    const saved = JSON.parse(localStorage.getItem(PAYMENT_ORDER_PREVIEW_KEY) || "{}");
    if (saved?.orderId === orderId && Number(saved.depositAmount || 0) > 0) {
      return saved;
    }
  } catch (error) {
    console.warn(error);
  }

  return null;
}

function writePaymentOrderPreview(order) {
  try {
    localStorage.setItem(PAYMENT_ORDER_PREVIEW_KEY, JSON.stringify({
      orderId: order.orderId,
      total: Number(order.total || 0),
      depositAmount: Number(order.depositAmount || 0),
      remainingAmount: Number(order.remainingAmount || 0)
    }));
  } catch (error) {
    console.warn(error);
  }
}

function setPaymentFormDisabled(isDisabled) {
  const form = $("#payment-form");
  if (!form) return;
  form.querySelectorAll("input, textarea, button").forEach((field) => {
    if (field.id === "payment-amount-display") return;
    field.disabled = isDisabled;
  });
}
