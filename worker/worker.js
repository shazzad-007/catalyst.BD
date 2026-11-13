// ============================================================================
// Catalyst.BD — Cloudflare Worker (Gemini API + Google Sheets)  [final]
// Cloudflare -> catalyst-bot -> Edit code -> Ctrl+A, Delete, paste this, Deploy.
// Needs Variables/Secrets: GEMINI_API_KEY, SHEET_WEBHOOK_URL
// ============================================================================

const PRODUCTS = [
  { id: "pod1", name: "Xros Mini Pod Kit", price: 2450, stock: 12 },
  { id: "pod2", name: "Caliburn G3 Pod System", price: 2790, stock: 8 },
  { id: "liq1", name: "30ml Salt Nic — Mango Ice", price: 1150, stock: 25 },
  { id: "liq2", name: "30ml Salt Nic — Grape Mint", price: 1150, stock: 15 },
  { id: "coil1", name: "Replacement Pod Cartridge (২ পিস)", price: 550, stock: 40 }
];
const DELIVERY = { inside: 70, outside: 130 };
const DEBUG = true; // সমস্যা মিটে গেলে false করে দিন
const DEFAULT_MODEL = "gemini-3.8-flash"; // Cloudflare Variable GEMINI_MODEL দিয়ে বদলানো যায়

const SYSTEM_INSTRUCTION = `
You are a polite, concise e-commerce order assistant for Catalyst.BD in Bangladesh.
Customers may write in Bangla, Banglish, or English—always reply naturally in the same style.

ACTIVE CATALOG (never invent prices or products outside this list):
${JSON.stringify(PRODUCTS)}

DELIVERY CHARGES:
- Inside Dhaka: ${DELIVERY.inside} BDT
- Outside Dhaka: ${DELIVERY.outside} BDT
Payment: Cash on Delivery or bKash. Customers must be 18+.

YOUR GOAL:
1. Answer price, stock, and delivery questions accurately from the catalog above.
2. To confirm an order, collect: customer_name, phone (11-digit BD number starting with 01), address, item, quantity, and whether the address is outside Dhaka.
3. Before calling confirm_order, show a short summary with the total (price x quantity + delivery) and ask the customer to confirm.
4. Only after the customer clearly says yes, call confirm_order. Do NOT call it if any field is missing.
5. For "item" always use the product id from the catalog (pod1, pod2, liq1, liq2, coil1).
`;

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "confirm_order",
        description: "Save a confirmed customer order to Google Sheets",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_name: { type: "STRING" },
            phone: { type: "STRING", description: "11-digit Bangladesh mobile number e.g. 01711000000" },
            address: { type: "STRING" },
            item: { type: "STRING", description: "Product id", enum: PRODUCTS.map((p) => p.id) },
            quantity: { type: "INTEGER" },
            is_outside_dhaka: { type: "BOOLEAN" }
          },
          required: ["customer_name", "phone", "address", "item", "quantity", "is_outside_dhaka"]
        }
      }
    ]
  }
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    try {
      if (!env.GEMINI_API_KEY) {
        console.log("GEMINI_API_KEY is missing");
        return jsonResponse({ reply: "দুঃখিত, সিস্টেম এখন প্রস্তুত নয়। অনুগ্রহ করে WhatsApp-এ অর্ডার করুন।" });
      }

      const body = await request.json();
      const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
      if (!history.length) return jsonResponse({ reply: "মেসেজ পাওয়া যায়নি।" });

      const contents = history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "").slice(0, 1500) }]
      }));

      // Gemini busy (503/429/500) হলে কয়েকবার আবার চেষ্টা করে; GEMINI_FALLBACK_MODEL দিলে শেষে সেটিও চেষ্টা করে
      const models = [env.GEMINI_MODEL || DEFAULT_MODEL];
      if (env.GEMINI_FALLBACK_MODEL) models.push(env.GEMINI_FALLBACK_MODEL);
      const delays = [0, 1200, 2500];
      let res;
      let raw = "";
      outer:
      for (const model of models) {
        for (const wait of delays) {
          if (wait) await new Promise((r) => setTimeout(r, wait));
          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
                contents,
                tools: GEMINI_TOOLS,
                generationConfig: { temperature: 0.3 }
              })
            }
          );
          raw = await res.text();
          if (res.ok || ![429, 500, 503].includes(res.status)) break outer;
          console.log("Gemini busy:", model, res.status, "retrying...");
        }
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        console.log("Gemini non-JSON response:", res.status, raw.slice(0, 300));
        return jsonResponse({ reply: DEBUG ? "DEBUG non-JSON " + res.status + ": " + raw.slice(0, 250) : "দুঃখিত, এখন উত্তর দিতে পারছি না।" });
      }

      if (!res.ok || data.error) {
        console.log("Gemini error:", res.status, JSON.stringify(data.error || data).slice(0, 400));
        if (res.status === 503 || res.status === 429) {
          return jsonResponse({ reply: "এই মুহূর্তে অনেকে চ্যাট করছেন, তাই উত্তর দিতে দেরি হচ্ছে। দয়া করে ১ মিনিট পর আবার লিখুন।" });
        }
        if (DEBUG) {
          return jsonResponse({ reply: "DEBUG " + res.status + ": " + JSON.stringify(data.error || data).slice(0, 300) });
        }
        return jsonResponse({ reply: "দুঃখিত, এখন উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন।" });
      }

      const candidateParts = data?.candidates?.[0]?.content?.parts || [];
      const fnCallPart = candidateParts.find((p) => p.functionCall);

      if (fnCallPart && fnCallPart.functionCall.name === "confirm_order") {
        const args = fnCallPart.functionCall.args || {};

        // phone: remove spaces/dashes, convert +880 / 880 to 0
        let phone = String(args.phone || "").replace(/[\s-]/g, "");
        phone = phone.replace(/^\+?880/, "0");
        if (!/^01[3-9]\d{8}$/.test(phone)) {
          return jsonResponse({
            reply: "দুঃখিত, আপনার ফোন নম্বরটি ১১ ডিজিটের সঠিক বাংলাদেশি নম্বর (01XXXXXXXXX) হতে হবে। অনুগ্রহ করে সঠিক নম্বরটি দিন।"
          });
        }

        const matched = PRODUCTS.find((p) => p.id === args.item);
        if (!matched) {
          return jsonResponse({ reply: "দুঃখিত, পণ্যটি বুঝতে পারিনি। কোন পণ্যটি নিতে চান আবার বলুন।" });
        }

        const qty = parseInt(args.quantity, 10);
        if (!qty || qty < 1) {
          return jsonResponse({ reply: "অনুগ্রহ করে কতটি নিতে চান সেটি সঠিক সংখ্যায় বলুন।" });
        }
        if (qty > matched.stock) {
          return jsonResponse({ reply: `দুঃখিত, ${matched.name} এর স্টকে এখন ${matched.stock} টি আছে। অনুগ্রহ করে কম পরিমাণ বলুন।` });
        }

        if (!args.customer_name || !args.address) {
          return jsonResponse({ reply: "অনুগ্রহ করে আপনার নাম ও পূর্ণ ঠিকানা দিন।" });
        }

        const delivery = args.is_outside_dhaka ? DELIVERY.outside : DELIVERY.inside;
        const total = matched.price * qty + delivery;

        const orderRecord = {
          order_id: `ORD-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          timestamp: new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }),
          customer_name: args.customer_name,
          phone,
          address: args.address,
          item: matched.name,
          quantity: qty,
          total_bdt: total,
          status: "Pending"
        };

        let saved = false;
        if (env.SHEET_WEBHOOK_URL) {
          try {
            const sres = await fetch(env.SHEET_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify(orderRecord)
            });
            const stext = await sres.text();
            console.log("Sheet response:", sres.status, stext.slice(0, 200));
            saved = sres.ok && !stext.includes("<html");
          } catch (e) {
            console.log("Sheet error:", e.message);
          }
        } else {
          console.log("SHEET_WEBHOOK_URL is missing");
        }

        if (!saved) {
          return jsonResponse({
            reply: "দুঃখিত, অর্ডারটি সেভ করতে সমস্যা হয়েছে। অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন বা WhatsApp-এ জানান।"
          });
        }

        return jsonResponse({
          order: orderRecord,
          reply: `ধন্যবাদ ${orderRecord.customer_name}! আপনার অর্ডার (${orderRecord.order_id}) কনফার্ম হয়েছে।\n• পণ্য: ${orderRecord.quantity}x ${orderRecord.item}\n• মোট বিল (ডেলিভারিসহ): ৳${orderRecord.total_bdt}\n• ঠিকানা: ${orderRecord.address}`
        });
      }

      const textReply = candidateParts.map((p) => p.text || "").join("").trim();
      return jsonResponse({ reply: textReply || "দুঃখিত, আবার একটু লিখুন।" });
    } catch (err) {
      console.log("Server error:", err.message, err.stack);
      return jsonResponse({ reply: DEBUG ? "DEBUG server error: " + err.message : "দুঃখিত, সমস্যা হয়েছে। আবার চেষ্টা করুন।" }, 200);
    }
  }
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS }
  });
}
