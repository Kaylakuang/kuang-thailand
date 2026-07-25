export const SITE_NAME = "匡老三代購網";

export const CONTACT_INFO = {
  lineId: "0968060053",
  lineUrl: "https://line.me/ti/p/mJw52omMlQ",
  instagram: "kuang3_thailand",
  instagramUrl: "https://www.instagram.com/kuang3_thailand?igsh=MTRscGNoa2YwZmwycg%3D%3D&utm_source=qr",
  facebookUrl: "https://www.facebook.com/share/18UYEVddMF/?mibextid=wwXIfr",
  threads: "kuang3_thailand",
  threadsUrl: "https://www.threads.com/@kuang3_thailand?igshid=NTc4MTIwNjQ2YQ==",
  email: "kuangsis000000@gmail.com",
  serviceHours: "10:00 - 20:00"
};

export const BANK_INFO = {
  bankName: "元大銀行",
  bankCode: "806",
  accountNumber: "20482700297543",
  accountName: "匡怡如"
};

export const PAYMENT_SETTINGS = {
  depositRate: 0.5,
  paymentDeadlineDays: 3,
  notes: [
    "預購商品下單後，需先匯款訂金。",
    "匯款完成後，需回填匯款資料。",
    "匯款後請填寫帳號後五碼，方便確認付款。",
    "訂金確認後訂單才會正式成立並安排採買。"
  ]
};

export const SHIPPING_SETTINGS = {
  freeShippingThreshold: 3000,
  defaultShippingFee: 65,
  freeShippingText: "滿 NT$3,000 免運"
};

export const PROMOTION_SETTINGS = {
  buyXGetY: {
    enabled: true,
    buy: 5,
    get: 1,
    label: "買五送一"
  }
};

export const LOYALTY_SETTINGS = {
  enabled: true,
  dollarsPerPoint: 10,
  pointValue: 1,
  label: "每 NT$10 累積 1 點"
};

export const PRODUCT_CATEGORIES = [
  "7-11",
  "Big C",
  "美妝保養",
  "零食飲料",
  "生活用品",
  "熱銷商品"
];

export const PRODUCT_STATUS = [
  "開放下單",
  "即將截止",
  "已截止",
  "暫停接單",
  "已售完",
  "即將到貨"
];

export const PAYMENT_METHODS = [
  "LINE Pay",
  "銀行匯款"
];

export const SHIPPING_METHODS = [
  "店到店",
  "面交",
  "宅配（限大件物品）"
];

export const PAYMENT_STATUS = [
  "待付訂金",
  "訂金待確認",
  "訂金已付款",
  "金額不符",
  "付款逾期",
  "已退款"
];

export const ORDER_STATUS = [
  "等待訂金",
  "訂單成立",
  "泰國採買中",
  "已完成採買",
  "運送回台",
  "已抵台",
  "整理出貨中",
  "已出貨",
  "已完成",
  "已取消"
];
