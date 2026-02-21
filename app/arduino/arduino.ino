#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// -------------------- WIFI --------------------
const char* WIFI_SSID = "xEGOx";
const char* WIFI_PASS = "anoir123";

// -------------------- FIREBASE RTDB --------------------
const char* FIREBASE_DB_URL =
  "https://gazdetector-85aba-default-rtdb.europe-west1.firebasedatabase.app";

// Device
const char* DEVICE_ID = "esp32_01";

// -------------------- TELEGRAM --------------------
// ⚠️ Mets ICI ton nouveau token (régénéré) + chat_id
const char* TG_BOT_TOKEN = "7621034726:AAEIostuJ6xRripd2mR2ZyFSVyCgO26Kj_E";
const char* TG_CHAT_ID   = "1132211631";

// -------------------- PINS --------------------
static const int PIN_MQ2 = 34;     // ADC input (GPIO34)
static const int PIN_LED = 26;
static const int PIN_BUZZER = 25;

// -------------------- MESURE --------------------
int baseline = 0;
bool baselineReady = false;

const int SAMPLE_COUNT = 30;
const int BASELINE_SECONDS = 20;
const int LOOP_DELAY_MS = 2000;

// ✅ Seuils dynamiques (modifiables via le site)
int warnThreshold  = 35;
int alertThreshold = 60;

// Historique
bool ENABLE_HISTORY = true;
const int HISTORY_EVERY_N = 1;
int measureCount = 0;

// ✅ Reload config interval (Firebase)
unsigned long lastConfigFetchMs = 0;
const unsigned long CONFIG_FETCH_INTERVAL_MS = 30000; // 30s

// ✅ Telegram anti-spam
unsigned long lastTelegramMs = 0;
const unsigned long TG_COOLDOWN_MS = 60000; // 60s
bool wasAlert = false; // pour envoyer seulement lors du passage en ALERT

// -------------------- UTILITAIRES --------------------

int readAdcAvg(int n) {
  long sum = 0;
  for (int i = 0; i < n; i++) {
    sum += analogRead(PIN_MQ2);
    delay(5);
  }
  return (int)(sum / n);
}

int adcToIndex(int adc) {
  int span = 1200; // à ajuster selon capteur
  int idx = (int)((adc - baseline) * 100L / span);
  if (idx < 0) idx = 0;
  if (idx > 100) idx = 100;
  return idx;
}

const char* statusFromIndexDynamic(int idx) {
  if (idx >= alertThreshold) return "ALERT";
  if (idx >= warnThreshold)  return "WARN";
  return "OK";
}

void setAlarm(const char* status) {
  if (strcmp(status, "ALERT") == 0) {
    digitalWrite(PIN_LED, HIGH);
    tone(PIN_BUZZER, 2000); // buzzer passif
  } else if (strcmp(status, "WARN") == 0) {
    digitalWrite(PIN_LED, HIGH);
    noTone(PIN_BUZZER);
  } else {
    digitalWrite(PIN_LED, LOW);
    noTone(PIN_BUZZER);
  }
}

// -------------------- FIREBASE REST --------------------

bool firebasePutJson(const String& path, const String& json) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(FIREBASE_DB_URL) + path + ".json";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int code = http.PUT(json);
  http.end();

  return (code >= 200 && code < 300);
}

bool firebasePostJson(const String& path, const String& json) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(FIREBASE_DB_URL) + path + ".json";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(json);
  http.end();

  return (code >= 200 && code < 300);
}

bool firebaseGetJson(const String& path, String &outBody) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure(); // ✅ dev: ignore certificat (OK pour projet étudiant)

  HTTPClient http;
  String url = String(FIREBASE_DB_URL) + path + ".json";

  if (!http.begin(client, url)) return false;

  int code = http.GET();
  if (code <= 0) {
    http.end();
    return false;
  }

  if (code >= 200 && code < 300) {
    outBody = http.getString();
    http.end();
    return true;
  }

  http.end();
  return false;
}

// -------------------- TELEGRAM (HTTPS) --------------------

bool telegramSend(const String& text) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure(); // ✅ dev: ignore certificat

  HTTPClient http;
  String url = "https://api.telegram.org/bot" + String(TG_BOT_TOKEN) + "/sendMessage";

  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["chat_id"] = TG_CHAT_ID;
  doc["text"] = text;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  String resp = http.getString(); // utile debug
  http.end();

  Serial.print("Telegram POST code=");
  Serial.print(code);
  Serial.print(" resp=");
  Serial.println(resp);

  return (code >= 200 && code < 300);
}

void maybeNotifyTelegram(const char* status, int idx, int adc) {
  const bool isAlert = (strcmp(status, "ALERT") == 0);
  const unsigned long now = millis();

  // reset quand on repasse à WARN/OK
  if (!isAlert) {
    wasAlert = false;
    return;
  }

  // Si c'est ALERT :
  // - envoyer une fois lors du passage en ALERT
  // - puis éventuellement toutes les TG_COOLDOWN_MS si ça reste en ALERT
  if (!wasAlert || (now - lastTelegramMs >= TG_COOLDOWN_MS)) {
    String msg = "⚠️ ALERTE GAZ / FUMÉE\n";
    msg += "Device: " + String(DEVICE_ID) + "\n";
    msg += "Index: " + String(idx) + "\n";
    msg += "ADC: " + String(adc) + "\n";
    msg += "Seuils: WARN≥" + String(warnThreshold) + " / ALERT≥" + String(alertThreshold);

    bool ok = telegramSend(msg);
    if (ok) {
      lastTelegramMs = now;
      wasAlert = true;
    }
  }
}

// -------------------- WIFI --------------------

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Connexion WiFi");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi NON connecte");
  }
}

// -------------------- BASELINE --------------------

void calibrateBaseline() {
  Serial.println("Calibration baseline (air normal)...");
  long sum = 0;
  int loops = (BASELINE_SECONDS * 1000) / 200; // 200ms
  for (int i = 0; i < loops; i++) {
    sum += readAdcAvg(10);
    delay(200);
  }
  baseline = (int)(sum / loops);
  baselineReady = true;

  Serial.print("Baseline = ");
  Serial.println(baseline);
}

// -------------------- CONFIG FETCH --------------------

void fetchConfigFromFirebase() {
  String body;
  String configPath = String("/devices/") + DEVICE_ID + "/config";

  if (!firebaseGetJson(configPath, body)) {
    Serial.println("Config fetch: FAIL (keep previous thresholds)");
    return;
  }

  body.trim();
  if (body == "null" || body.length() < 2) {
    Serial.println("Config fetch: null (keep defaults)");
    return;
  }

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.print("Config JSON parse error: ");
    Serial.println(err.c_str());
    return;
  }

  if (doc["warn"].is<int>())  warnThreshold  = doc["warn"].as<int>();
  if (doc["alert"].is<int>()) alertThreshold = doc["alert"].as<int>();

  // Validation minimale
  if (warnThreshold < 1) warnThreshold = 1;
  if (warnThreshold > 99) warnThreshold = 99;
  if (alertThreshold < warnThreshold + 1) alertThreshold = warnThreshold + 1;
  if (alertThreshold > 100) alertThreshold = 100;

  Serial.print("Config updated: warn=");
  Serial.print(warnThreshold);
  Serial.print(" alert=");
  Serial.println(alertThreshold);
}

// -------------------- SETUP / LOOP --------------------

void setup() {
  Serial.begin(115200);

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  noTone(PIN_BUZZER);

  analogReadResolution(12); // 0..4095

  connectWifi();
  calibrateBaseline();

  // premier chargement des seuils depuis Firebase
  fetchConfigFromFirebase();
  lastConfigFetchMs = millis();
}

void loop() {
  if (!baselineReady) return;

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  // rafraîchir config toutes les 30s
  unsigned long now = millis();
  if (now - lastConfigFetchMs >= CONFIG_FETCH_INTERVAL_MS) {
    fetchConfigFromFirebase();
    lastConfigFetchMs = now;
  }

  int adc = readAdcAvg(SAMPLE_COUNT);
  int idx = adcToIndex(adc);
  const char* status = statusFromIndexDynamic(idx);

  // Alarme locale
  setAlarm(status);

  // ✅ Telegram direct (anti-spam)
  maybeNotifyTelegram(status, idx, adc);

  // Timestamp
  unsigned long ts = millis();

  // JSON payload
  StaticJsonDocument<320> doc;
  doc["ts"] = ts;
  doc["adc"] = adc;
  doc["index"] = idx;
  doc["status"] = status;
  doc["warn"] = warnThreshold;
  doc["alert"] = alertThreshold;

  String payload;
  serializeJson(doc, payload);

  // latest
  String latestPath = String("/devices/") + DEVICE_ID + "/latest";
  bool okLatest = firebasePutJson(latestPath, payload);

  // history
  measureCount++;
  bool okHist = true;
  if (ENABLE_HISTORY && (measureCount % HISTORY_EVERY_N == 0)) {
    String histPath = String("/devices/") + DEVICE_ID + "/history";
    okHist = firebasePostJson(histPath, payload);
  }

  Serial.print("ADC=");
  Serial.print(adc);
  Serial.print(" IDX=");
  Serial.print(idx);
  Serial.print(" STATUS=");
  Serial.print(status);
  Serial.print(" (warn=");
  Serial.print(warnThreshold);
  Serial.print(", alert=");
  Serial.print(alertThreshold);
  Serial.print(") | Firebase latest=");
  Serial.print(okLatest ? "OK" : "FAIL");
  Serial.print(" hist=");
  Serial.println(okHist ? "OK" : "FAIL");

  delay(LOOP_DELAY_MS);
}