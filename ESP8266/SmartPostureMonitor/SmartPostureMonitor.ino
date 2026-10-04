
#include <Wire.h>
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>

#include "secrets.h"

// ========================================
// MPU6050
// ========================================

#define MPU6050_ADDR 0x68

#define SDA_PIN D2
#define SCL_PIN D1

// ========================================
// BUZZER
// ========================================

#define BUZZER_PIN D5

// ========================================
// WIFI
// ========================================

const char* WIFI_SSID = WIFI_SSID_VALUE;
const char* WIFI_PASSWORD = WIFI_PASSWORD_VALUE;

#ifndef LOCAL_API_URL_VALUE
#error "Set LOCAL_API_URL_VALUE in secrets.h"
#endif

const char* SERVER_URL = LOCAL_API_URL_VALUE;

const char* const WIFI_CONNECTING_MESSAGE = "Connecting to WiFi";

// ========================================
// POSTURE THRESHOLDS
// ========================================

#define LEFT_THRESHOLD   -0.06
#define RIGHT_THRESHOLD   0.06
#define HUNCHED_THRESHOLD 0.24

#define BAD_POSTURE_TIME 5000

// ========================================
// SEND INTERVAL
// ========================================

#define SEND_INTERVAL 2000
#define WIFI_RETRY_INTERVAL 10000
#define CLOUD_REQUEST_TIMEOUT 10000

// ========================================
// VARIABLES
// ========================================

unsigned long badPostureStart = 0;

bool badPostureTiming = false;
bool alarmOn = false;

unsigned long lastSendTime = 0;
unsigned long lastWiFiAttemptTime = 0;

// ========================================
// WIFI CONNECTION
// ========================================

void beginWiFiConnection() {

  const unsigned long now = millis();

  if (WiFi.status() == WL_CONNECTED ||
      (lastWiFiAttemptTime != 0 &&
       now - lastWiFiAttemptTime < WIFI_RETRY_INTERVAL)) {
    return;
  }

  lastWiFiAttemptTime = now;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.println(WIFI_CONNECTING_MESSAGE);
}

// ========================================
// READ MPU6050
// ========================================

bool readMPU6050(float &AX, float &AY, float &AZ) {

  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  uint8_t bytesReceived =
    Wire.requestFrom(
      (uint8_t)MPU6050_ADDR,
      (size_t)6,
      true
    );

  if (bytesReceived != 6) {
    return false;
  }

  int16_t ax = Wire.read() << 8 | Wire.read();
  int16_t ay = Wire.read() << 8 | Wire.read();
  int16_t az = Wire.read() << 8 | Wire.read();

  AX = ax / 16384.0;
  AY = ay / 16384.0;
  AZ = az / 16384.0;

  return true;
}

// ========================================
// POSTURE DETECTION
// ========================================

String detectPosture(float AX, float AY, float AZ) {

  if (AY < LEFT_THRESHOLD) {
    return "LEAN LEFT";
  }

  if (AY > RIGHT_THRESHOLD) {
    return "LEAN RIGHT";
  }

  if (AZ < HUNCHED_THRESHOLD) {
    return "HUNCHED";
  }

  return "STRAIGHT";
}

// ========================================
// BUZZER
// ========================================

void startAlarm() {

  if (!alarmOn) {

    tone(BUZZER_PIN, 2000);

    alarmOn = true;

    Serial.println("!!! BUZZER ALERT !!!");
  }
}

void stopAlarm() {

  if (alarmOn) {

    noTone(BUZZER_PIN);

    alarmOn = false;

    Serial.println("Buzzer OFF");
  }
}

// ========================================
// SEND DATA TO VERCEL API
// ========================================

void sendPostureData(
  String posture,
  float AX,
  float AY,
  float AZ,
  unsigned long badDuration
) {

  // Check WiFi
  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi not connected. Cannot send data.");

    return;
  }

  // Check HTTPS URL
  String url = String(SERVER_URL);

  if (!url.startsWith("https://")) {

    Serial.println("ERROR: Endpoint must use HTTPS.");

    return;
  }

  // HTTPS Client
  WiFiClientSecure client;

  // Testing only: skip SSL certificate verification
  client.setInsecure();

  client.setTimeout(CLOUD_REQUEST_TIMEOUT);

  HTTPClient http;

  if (!http.begin(client, url)) {

    Serial.println("HTTPS initialization failed.");

    return;
  }

  http.setTimeout(CLOUD_REQUEST_TIMEOUT);

  http.addHeader("Content-Type", "application/json");

  // Build JSON
  String json = "{";

  json += "\"sensor_posture\":\"";
  json += posture;
  json += "\",";

  json += "\"ax\":";
  json += String(AX, 3);
  json += ",";

  json += "\"ay\":";
  json += String(AY, 3);
  json += ",";

  json += "\"az\":";
  json += String(AZ, 3);
  json += ",";

  json += "\"bad_duration_ms\":";
  json += String(badDuration);

  json += "}";

  // Send request
  Serial.println();
  Serial.println("Sending sensor posture to Vercel API.");

  Serial.print("Endpoint: ");
  Serial.println(url);

  int httpCode = http.POST(json);

  Serial.print("HTTP Response: ");
  Serial.println(httpCode);

  if (httpCode > 0) {

    Serial.print("HTTP Status: ");
    Serial.println(httpCode);

    String response = http.getString();

    Serial.println("API Response:");
    Serial.println(response);

  } else {

    Serial.print("HTTP request failed: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

// ========================================
// SETUP
// ========================================

void setup() {

  Serial.begin(115200);

  delay(500);

  Serial.println();
  Serial.println("================================");
  Serial.println(" SMART POSTURE MONITOR");
  Serial.println(" ESP8266 + MPU6050 + BUZZER");
  Serial.println("================================");

  // I2C
  Wire.begin(
    SDA_PIN,
    SCL_PIN
  );

  // Buzzer
  pinMode(
    BUZZER_PIN,
    OUTPUT
  );

  noTone(BUZZER_PIN);

  // Wake up MPU6050
  Wire.beginTransmission(MPU6050_ADDR);

  Wire.write(0x6B);
  Wire.write(0);

  Wire.endTransmission(true);

  delay(500);

  // Start WiFi
  beginWiFiConnection();

  Serial.println();
  Serial.println("System Ready");
  Serial.println();
}

// ========================================
// LOOP
// ========================================

void loop() {

  float AX;
  float AY;
  float AZ;

  // ======================================
  // CHECK WIFI
  // ======================================

  if (WiFi.status() != WL_CONNECTED) {

    beginWiFiConnection();

  }

  // ======================================
  // READ SENSOR
  // ======================================

  if (!readMPU6050(AX, AY, AZ)) {

    Serial.println("ERROR: MPU6050 NOT DETECTED");

    stopAlarm();

    delay(500);

    return;
  }

  // ======================================
  // DETECT POSTURE
  // ======================================

  String posture = detectPosture(AX, AY, AZ);

  // ======================================
  // SERIAL OUTPUT
  // ======================================

  Serial.print("AX=");
  Serial.print(AX, 3);

  Serial.print(" AY=");
  Serial.print(AY, 3);

  Serial.print(" AZ=");
  Serial.print(AZ, 3);

  Serial.print(" | POSTURE=");

  Serial.println(posture);

  // ======================================
  // POSTURE TIMER
  // ======================================

  unsigned long badDuration = 0;

  if (posture == "STRAIGHT") {

    badPostureTiming = false;

    badPostureStart = 0;

    stopAlarm();

  } else {

    if (!badPostureTiming) {

      badPostureTiming = true;

      badPostureStart = millis();

      Serial.print("Bad posture detected: ");

      Serial.println(posture);
    }

    badDuration = millis() - badPostureStart;

    Serial.print("Bad posture time: ");

    Serial.print(
      badDuration / 1000.0,
      1
    );

    Serial.println(" sec");

    if (badDuration >= BAD_POSTURE_TIME) {

      startAlarm();
    }
  }

  // ======================================
  // SEND TO VERCEL EVERY 2 SECONDS
  // ======================================

  if (millis() - lastSendTime >= SEND_INTERVAL) {

    lastSendTime = millis();

    sendPostureData(
      posture,
      AX,
      AY,
      AZ,
      badDuration
    );
  }

  // ======================================
  // LOOP DELAY
  // ======================================

  delay(200);
}