# 匡老三代購網

這是一個可直接部署到 GitHub Pages 的純 HTML / CSS / JavaScript 靜態網站專案。網站程式放在 `docs/`，Firebase 使用 CDN 模組版，不需要 npm、不需要 React / Vue，也不使用 Firebase Storage。

## 專案結構

```text
README.md
firebase.json
firestore.rules
docs/
  index.html
  products.html
  product.html
  cart.html
  checkout.html
  order-success.html
  login.html
  register.html
  forgot-password.html
  my-orders.html
  order-detail.html
  payment-upload.html
  admin.html
  css/style.css
  js/
  data/sample-products.json
  assets/
```

## 1. 建立 Firebase 專案

1. 前往 [Firebase Console](https://console.firebase.google.com/)。
2. 點選「新增專案」。
3. 專案名稱可填 `kuang-thailand`。
4. Google Analytics 可依需求開啟或略過。
5. 建立完成後，進入專案。

## 2. 開啟 Authentication

1. Firebase Console 左側選單點選「Authentication」。
2. 點選「Get started」或「開始使用」。
3. 進入「Sign-in method」。

## 3. 開啟 Email 與 Google 登入

Email 登入：

1. 在「Sign-in method」找到「Email/Password」。
2. 點進去並啟用。
3. 儲存。

Google 登入：

1. 在「Sign-in method」找到「Google」。
2. 啟用 Google 登入。
3. 選擇支援 Email。
4. 儲存。

## 4. Authorized domains

GitHub Pages 網域必須加入 Firebase Authentication 的 Authorized domains：

```text
kaylakuang.github.io
```

路徑：

```text
Firebase Console → Authentication → Settings → Authorized domains → Add domain
```

如果未加入，登入時會出現 `auth/unauthorized-domain`。

## 5. 建立 Firestore

1. Firebase Console 左側點選「Firestore Database」。
2. 點選「Create database」。
3. 選擇 Production mode。
4. 選擇離你主要使用者較近的區域。
5. 建立資料庫。

## 6. 貼上 Firebase Config

目前正式設定已放在：

```text
docs/js/firebase-config.js
```

若未來要改專案，請到：

```text
Firebase Console → Project settings → General → Your apps → Web app
```

複製 Firebase Web Config，貼到 `docs/js/firebase-config.js`。

`docs/js/firebase-config.example.js` 是範例檔，保留給日後參考，不要把它當正式設定使用。

## 7. 部署 Firestore Rules

本專案已提供完整規則：

```text
firestore.rules
```

部署方式二選一：

1. Firebase Console 貼上
   - 進入 Firestore Database。
   - 點選「Rules」。
   - 將 `firestore.rules` 內容完整貼上。
   - 點選 Publish。

2. Firebase CLI
   - 若你已經有 Firebase CLI，可執行部署 rules。
   - 本網站本身不需要 npm；Firebase CLI 只是可選部署工具。

規則重點：

- 未登入者只能讀取 `isActive == true` 的商品。
- 會員只能讀取與修改自己的 `users/{uid}`。
- 會員只能建立與查看自己的訂單。
- 會員不能自行把 `paymentStatus` 改成「訂金已付款」。
- 會員不能修改訂單金額、運費、折扣、總金額、訂金與尾款。
- admin 可管理 `users`、`products`、`orders`、`payments`、`settings`、`categories`、`promotions`。
- 不允許公開讀取所有會員資料。

## 8. 建立第一個 admin 帳號

1. 先在網站註冊一個會員帳號。
2. 到 Firebase Console → Firestore Database。
3. 找到 `users/{你的 uid}`。
4. 將欄位 `role` 從 `customer` 改成：

```text
admin
```

5. 回網站重新登入。
6. 進入 `admin.html` 即可使用管理員後台。

## 9. 上傳到 GitHub

Repository：`Kaylakuang/kuang-thailand`

請上傳以下項目：

```text
docs/
README.md
firebase.json
firestore.rules
```

不要只上傳單一 HTML，因為網站有多頁、CSS、JavaScript、範例商品與 assets。

## 10. 用 GitHub 網頁版上傳

1. 開啟 GitHub repository：`Kaylakuang/kuang-thailand`。
2. 點選 `Add file`。
3. 點選 `Upload files`。
4. 把 `docs` 資料夾、`README.md`、`firebase.json`、`firestore.rules` 拖進去。
5. 等待檔案列出。
6. 在下方 Commit message 可填：

```text
Add Kuang Thailand shopping site
```

7. 點選 `Commit changes`。

如果 GitHub 網頁版不能拖整個資料夾：

- 方法 A：把整個專案壓成 zip，解壓後分批拖曳 `docs` 內的資料夾與檔案。
- 方法 B：在 GitHub 網頁版逐步建立資料夾：
  - 先建立 `docs/index.html`
  - 再建立 `docs/css/style.css`
  - 再建立 `docs/js/...`
  - 再建立 `docs/data/sample-products.json`
  - 再建立 `docs/assets/...`
- 方法 C：使用 GitHub Desktop，直接把整個專案資料夾放進 repository 後 commit。

## 11. 設定 GitHub Pages

1. 進入 repository。
2. 點選 `Settings`。
3. 左側點選 `Pages`。
4. Source 選擇：

```text
Deploy from a branch
```

5. Branch 選擇：

```text
main
```

6. Folder 選擇：

```text
/docs
```

7. 點選 `Save`。
8. 等待 GitHub Pages 部署完成。

網站網址通常會是：

```text
https://kaylakuang.github.io/kuang-thailand/
```

## 12. 新增商品

方式 A：使用管理員後台

1. 登入 admin 帳號。
2. 開啟 `admin.html`。
3. 到「商品管理」。
4. 填寫商品名稱、分類、價格、庫存、狀態、截止日期、優惠活動、圖片網址。
5. 點選「儲存商品」。

方式 B：先匯入範例商品

1. 登入 admin 帳號。
2. 開啟 `admin.html`。
3. 到「商品管理」。
4. 點選「匯入範例商品」。
5. 系統會把 `docs/data/sample-products.json` 寫入 Firestore `products`。

## 13. 查看訂單

會員：

```text
my-orders.html
```

管理員：

```text
admin.html → 訂單管理
```

管理員可搜尋訂單編號、客戶姓名、手機號碼，依付款狀態與訂單狀態篩選，並可更新付款狀態、訂單狀態、物流單號、管理員備註與匯出 CSV。

## 14. 修改銀行帳號

銀行資料集中在：

```text
docs/js/settings.js
```

修改：

```js
export const BANK_INFO = {
  bankName: "請修改銀行名稱",
  bankCode: "000",
  accountNumber: "請修改匯款帳號",
  accountName: "請修改戶名"
};
```

不要到各個 HTML 分散修改，網站所有匯款資訊都會引用這裡。

## 15. 修改訂金比例

目前預設訂金比例是 50%：

```js
export const PAYMENT_SETTINGS = {
  depositRate: 0.5
};
```

位置：

```text
docs/js/settings.js
```

系統計算方式：

```js
depositAmount = Math.ceil(total * depositRate)
remainingAmount = total - depositAmount
```

若訂單總金額為 `NT$3,001`，訂金會自動計算為 `NT$1,501`，尾款為 `NT$1,500`。

如果未來修改訂金比例，請同步檢查 `firestore.rules` 的 `validDeposit()`，目前 Rules 固定要求 `depositRate == 0.5`。

## 16. 替換 Hero 主視覺圖片

首頁 Hero 右側圖片使用固定路徑：

```text
docs/assets/hero-main.jpg
```

替換方式：

1. 準備正式圖片。
2. 將圖片命名為：

```text
hero-main.jpg
```

3. 放到：

```text
docs/assets/hero-main.jpg
```

4. 上傳到 GitHub。

如果 `hero-main.jpg` 沒有上傳，首頁會顯示淡米色 placeholder 與「精選泰國好物」，不會顯示外部圖片。

## 17. 匯款回填

頁面：

```text
payment-upload.html
```

不使用 Firebase Storage，也不提供匯款證明圖片上傳。

客人只需要填：

- 匯款日期
- 匯款金額
- 匯款人姓名
- 帳號後五碼
- 備註

送出後：

- 建立或更新 `payments` collection。
- 將訂單 `paymentStatus` 改成「訂金待確認」。
- 管理員確認後，才把 `paymentStatus` 改成「訂金已付款」，並將 `orderStatus` 改成「訂單成立」。

## 18. 常見錯誤排除

### `auth/unauthorized-domain`

代表 GitHub Pages 網域還沒有加入 Firebase Authorized domains。

請加入：

```text
kaylakuang.github.io
```

### `The query requires an index`

本專案的「我的訂單」頁刻意只使用：

```js
where("userId", "==", uid)
```

沒有同時使用 `orderBy("createdAt")`，因此不需要 Firestore 複合索引。若你日後自行改 query 並加入 `orderBy`，才可能出現這個錯誤。

### Firebase config 未設定

請確認：

```text
docs/js/firebase-config.js
```

裡面不是範例文字，而是 Firebase Console 的 Web Config。

### GitHub Pages 還沒更新

GitHub Pages 部署有時需要幾分鐘。請到：

```text
Repository → Actions
```

或：

```text
Settings → Pages
```

確認部署狀態。也可以重新整理瀏覽器或使用無痕視窗查看。

### `hero-main.jpg` 沒有上傳

如果尚未放入正式圖片，首頁會顯示 placeholder。把圖片命名為 `hero-main.jpg` 並放到 `docs/assets/hero-main.jpg` 後重新上傳即可。

## 19. 重要提醒

- 不需要安裝 npm。
- 不需要 Firebase Storage。
- 不需要匯款證明圖片上傳。
- LINE Pay 目前只作為訂單付款方式選項與後台紀錄，不串接金流 API。
- GitHub Pages 請設定 `main /docs`。
