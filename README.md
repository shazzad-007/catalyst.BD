# Catalyst.BD

> Premium vape & pod storefront for Bangladesh with an **AI order assistant** that chats in Bangla, Banglish or English and saves confirmed orders straight to Google Sheets.
>
> **বাংলায় সংক্ষেপে:** এটি একটি স্ট্যাটিক ওয়েবসাইট (GitHub Pages)। ক্রেতা চ্যাটবটের সাথে কথা বলে দাম জানতে ও অর্ডার দিতে পারেন। অর্ডার কনফার্ম হলে সেটি স্বয়ংক্রিয়ভাবে Google Sheet-এ জমা হয়।

**Live site:** https://shazzad-007.github.io/catalyst.BD

---

## Features

- Single-page storefront (`index.html`), no build step, no framework
- Product catalogue with category tabs (Pod Kit, Salt Nic / Liquid, Coil & Accessories) and a product detail modal
- Animated 3D hero section (floating pod, bottles and price cards, mouse-tilt parallax; respects `prefers-reduced-motion`)
- **18+ age gate** shown before the site is used
- Floating **AI order chatbot** (Bangla / Banglish / English), powered by Google Gemini
- Orders saved to **Google Sheets** automatically (Order ID, Timestamp, Name, Phone, Address, Item, Quantity, Total, Status)
- Payment options: **Cash on Delivery** and **bKash** (with QR code)
- Manual order form with WhatsApp hand-off as a fallback
- Delivery charge: **৳70 inside Dhaka**, **৳130 outside Dhaka**
- Responsive, mobile-first layout

---

## How it works

```
 Customer's browser (GitHub Pages)
        │  POST { history: [...] }
        ▼
 Cloudflare Worker  (catalyst-bot)
   • holds the product list, prices, stock, delivery rules
   • calls Gemini API  ──────────►  Google Gemini
   • validates phone / stock / total itself
        │  confirmed order (JSON)
        ▼
 Google Apps Script Web App  ──►  Google Sheet (one row per order)
        │
        ▼
 { reply: "..." }  back to the chat window
```

The Gemini key and the Sheet URL live **only** in Cloudflare as encrypted secrets. They are never in this repository.

---

## Repository structure

```
catalyst.BD/
├── index.html              # the whole website (HTML + CSS + JS)
├── *.jpg / *.jpeg          # product and banner images
├── worker/
│   └── worker.js           # Cloudflare Worker (chatbot backend)
├── apps-script/
│   └── Code.gs             # Google Apps Script (writes orders to the Sheet)
├── .github/workflows/      # GitHub Pages deployment
└── README.md
```

> `worker/` and `apps-script/` are reference copies. The code actually runs on Cloudflare and Google, so after editing here you still have to paste it there and redeploy.

---

## Setup (from scratch)

### 1. Google Sheet + Apps Script (order storage)

1. Create a Google Sheet.
2. **Extensions → Apps Script**, paste `apps-script/Code.gs`.
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the Web App URL (ends with `/exec`).
5. After any later code change: **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Otherwise the old code keeps running.

### 2. Cloudflare Worker (chatbot backend)

1. Cloudflare dashboard → **Workers & Pages** → create/open `catalyst-bot` → **Edit code**.
2. Replace everything with `worker/worker.js` and **Deploy**.
3. **Settings → Variables and Secrets**, add (type *Secret*):

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | Key from [Google AI Studio](https://aistudio.google.com/apikey) |
   | `SHEET_WEBHOOK_URL` | The Apps Script `/exec` URL from step 1 |
   | `GEMINI_MODEL` | *(optional)* defaults to `gemini-2.5-flash` |

4. **Deploy again** after changing variables.

### 3. Connect the website

In `index.html`, set the Worker URL near the top of the script:

```js
const WORKER_URL = "https://catalyst-bot.<your-subdomain>.workers.dev";
```

### 4. Publish

Push to `main`. GitHub Pages builds and serves the site in about a minute (repo **Settings → Pages**).

---

## Everyday tasks

**Change products, prices or stock**
- Website cards: edit the `PRODUCTS` array in `index.html`.
- Chatbot: edit the `PRODUCTS` array at the top of `worker/worker.js` and redeploy the Worker.
- Keep both lists identical, otherwise the bot and the site will quote different prices.

**Change delivery charges:** `DELIVERY` in `worker/worker.js` (and the text in `index.html`).

**Mark an order as delivered:** change the *Status* column in the Google Sheet (default is `Pending`).

**Edit the bot's personality or rules:** `SYSTEM_INSTRUCTION` in `worker/worker.js`.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Chat shows `Gemini Error: API key not valid` | `GEMINI_API_KEY` is wrong, has extra spaces, or the Worker was not redeployed after changing it. Create a new key in AI Studio, paste it again, **Deploy**. |
| Opening the Worker URL shows `Method Not Allowed` | Normal. The Worker accepts `POST` only; the browser sends `GET`. |
| Chat says "Error: Failed to fetch" | Wrong `WORKER_URL`, or the Worker is not deployed. |
| Bot replies but no row appears in the Sheet | `SHEET_WEBHOOK_URL` missing/wrong, Apps Script not deployed as *Anyone*, or a new version was not deployed. Check **Workers → catalyst-bot → Logs**. |
| Apps Script log says "Execution completed" but nothing happens | Pressing **Run** passes no data. Test through the website chat instead. |
| Site not updating after push | Wait 1–2 minutes, hard-refresh (Ctrl+F5), check the **Actions** tab. |

---

## Security notes

- Never commit API keys, tokens or passwords. If a key was ever pasted into a file or screenshot, revoke it and create a new one.
- The Worker re-checks stock, phone format and the total price itself; it does not trust numbers coming from the browser.
- Customer names, phones and addresses sit in your Google Sheet. Keep the Sheet private (share only with people who need it).
- Consider restricting the Worker's CORS origin from `*` to `https://shazzad-007.github.io` once everything works.

---

## Legal & age restriction

The products on this site are for adults only. The site shows an 18+ confirmation, and orders must only be fulfilled to customers aged 18 or older. Make sure your sales and advertising comply with the laws and platform policies that apply in Bangladesh.

---

## Roadmap

- [ ] Order notification to WhatsApp / Telegram when a new row is added
- [ ] Order status messages for customers
- [ ] Automatic stock deduction in the Sheet
- [ ] bKash payment verification (transaction ID check)
- [ ] Admin view for orders

---

## Tech stack

HTML · CSS · vanilla JavaScript · GitHub Pages · Cloudflare Workers · Google Gemini API · Google Apps Script · Google Sheets

## Contact

Catalyst.BD — WhatsApp / bKash: *(add your number here)*

© 2026 Catalyst.BD. All rights reserved.
