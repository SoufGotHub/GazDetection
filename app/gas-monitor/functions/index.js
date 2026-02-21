const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

async function sendTelegram(text) {
  const token = functions.config().telegram.token;
  const chatId = functions.config().telegram.chat_id;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram error: ${res.status} ${body}`);
  }
}

exports.onLatestAlert = functions.database
  .ref("/devices/esp32_01/latest")
  .onWrite(async (change, context) => {
    const after = change.after.val();
    if (!after) return null;

    // 1) ne notifier que si ALERT
    if (after.status !== "ALERT") return null;

    // 2) anti-spam : ne notifier que si status a changé (OK/WARN -> ALERT)
    const before = change.before.val();
    if (before && before.status === "ALERT") return null;

    const idx = after.index ?? "?";
    const adc = after.adc ?? "?";
    const ts = after.ts ?? "?";

    const msg = `⚠️ ALERTE GAZ\nDevice: esp32_01\nIndex: ${idx}\nADC: ${adc}\nTS: ${ts}`;
    await sendTelegram(msg);

    return null;
  });