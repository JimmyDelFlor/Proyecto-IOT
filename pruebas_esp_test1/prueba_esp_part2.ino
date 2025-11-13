// ============================================
// ESP32 - GATEWAY FINAL
// ============================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>

// --- WIFI ---
const char* ssid = "TU_WIFI_SSID";        // ← CAMBIAR
const char* password = "TU_WIFI_PASSWORD"; // ← CAMBIAR

// --- SERVIDOR ---
const char* SERVER_IP = "10.145.65.93";
const int SERVER_PORT = 5000;

// --- SERIAL ARDUINO ---
#define RXD2 16
#define TXD2 17
#define BAUD_RATE 115200

// --- WEBSOCKET ---
WebSocketsClient webSocket;

// --- VARIABLES ---
unsigned long lastHeartbeat = 0;
unsigned long lastReconnect = 0;
bool arduinoReady = false;
bool serverConnected = false;
bool registeredHTTP = false;
String deviceId = "ESP32_GATEWAY_01";

// --- LED ---
const int LED_STATUS = 2;

void setup() {
  Serial.begin(115200);
  delay(200);
  
  Serial.println("\n╔══════════════════════════╗");
  Serial.println("║  ESP32 GATEWAY v3.0      ║");
  Serial.println("╚══════════════════════════╝");
  
  pinMode(LED_STATUS, OUTPUT);
  
  Serial2.begin(BAUD_RATE, SERIAL_8N1, RXD2, TXD2);
  Serial.println("✓ Serial2 OK (115200)");
  
  conectarWiFi();
  conectarWebSocket();
  
  Serial.println("\n✅ Sistema iniciado\n");
}

void loop() {
  webSocket.loop();
  
  // Leer Arduino
  if (Serial2.available()) {
    String msg = Serial2.readStringUntil('\n');
    msg.trim();
    if (msg.length() > 0) {
      enviarMensajeArduino(msg);
    }
  }
  
  // Debug manual
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      Serial.print("🔧 Manual → Arduino: ");
      Serial.println(cmd);
      Serial2.println(cmd);
    }
  }
  
  // Heartbeat cada 20 segundos
  if (millis() - lastHeartbeat > 20000) {
    lastHeartbeat = millis();
    enviarHeartbeat();
  }
  
  // Reconectar si necesario
  if (!webSocket.isConnected() && millis() - lastReconnect > 5000) {
    lastReconnect = millis();
    Serial.println("⟳ Reconectando...");
    serverConnected = false;
    registeredHTTP = false;
    conectarWebSocket();
  }
  
  actualizarLED();
}

// =====================================================
// WIFI
// =====================================================

void conectarWiFi() {
  Serial.print("📡 WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int i = 0;
  while (WiFi.status() != WL_CONNECTED && i < 30) {
    delay(500);
    Serial.print(".");
    i++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi OK");
    Serial.print("   IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n✗ WiFi FAIL");
    delay(5000);
    ESP.restart();
  }
}

// =====================================================
// WEBSOCKET
// =====================================================

void conectarWebSocket() {
  Serial.print("🔌 WebSocket: ws://");
  Serial.print(SERVER_IP);
  Serial.print(":");
  Serial.print(SERVER_PORT);
  Serial.println("/raw");
  
  webSocket.begin(SERVER_IP, SERVER_PORT, "/raw");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("✗ WebSocket OFF");
      serverConnected = false;
      registeredHTTP = false;
      break;

    case WStype_CONNECTED: {
      Serial.println("✓ WebSocket ON");
      serverConnected = true;
      
      // Identificarse
      String id = "{\"type\":\"esp32_connected\",\"deviceId\":\"" + deviceId + "\"}";
      webSocket.sendTXT(id);
      Serial.println("📤 ID enviado");
      
      // Registrar por HTTP una sola vez
      if (!registeredHTTP) {
        delay(1000);
        enviarRegistroHTTP();
        registeredHTTP = true;
      }
      break;
    }

    case WStype_TEXT: {
      String msg = String((char*)payload);
      Serial.print("📥 Servidor: ");
      Serial.println(msg);
      
      procesarComando(msg);
      break;
    }

    default:
      break;
  }
}

void procesarComando(String msg) {
  msg.trim();
  
  // Parsear JSON: {"command":1} o {"command":"A"}
  int idx = msg.indexOf("\"command\":");
  if (idx != -1) {
    String resto = msg.substring(idx + 10);
    resto.replace("}", "");
    resto.replace("\"", "");
    resto.replace(" ", "");
    resto.trim();
    
    int coma = resto.indexOf(',');
    String cmd = (coma == -1) ? resto : resto.substring(0, coma);
    cmd.trim();
    
    if (cmd.length() > 0) {
      Serial.print("✅ Cmd → Arduino: ");
      Serial.println(cmd);
      Serial2.println(cmd);
    }
  }
}

// =====================================================
// MENSAJES ARDUINO
// =====================================================

void enviarMensajeArduino(String msg) {
  // Log selectivo (evitar spam)
  if (msg.startsWith("SENSORS:")) {
    // No loguear cada sensor, enviar silenciosamente
  } else {
    Serial.print("📨 Arduino: ");
    Serial.println(msg);
  }
  
  if (msg == "ARDUINO:READY") {
    arduinoReady = true;
    Serial.println("✓ Arduino READY");
  }
  
  if (msg.startsWith("ALERT:")) {
    Serial.println("🚨 ALERTA");
  }
  
  // Enviar al servidor
  if (webSocket.isConnected()) {
    String json = "{\"deviceId\":\"" + deviceId + "\",\"message\":\"" + msg + "\"}";
    webSocket.sendTXT(json);
  }
}

// =====================================================
// HTTP Y HEARTBEAT
// =====================================================

void enviarRegistroHTTP() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/esp32/register";
  
  Serial.println("📡 Registro HTTP...");
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String json = "{";
  json += "\"deviceId\":\"" + deviceId + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"version\":\"3.0\",";
  json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false");
  json += "}";
  
  int code = http.POST(json);
  
  if (code > 0) {
    Serial.print("✓ HTTP OK (");
    Serial.print(code);
    Serial.println(")");
  } else {
    Serial.println("✗ HTTP FAIL");
  }
  
  http.end();
}

void enviarHeartbeat() {
  if (!webSocket.isConnected()) return;
  
  String json = "{";
  json += "\"type\":\"heartbeat\",";
  json += "\"deviceId\":\"" + deviceId + "\",";
  json += "\"uptime\":" + String(millis() / 1000) + ",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false");
  json += "}";
  
  webSocket.sendTXT(json);
  Serial.println("💓 Heartbeat");
}

// =====================================================
// LED
// =====================================================

void actualizarLED() {
  static unsigned long last = 0;
  static bool estado = false;
  
  unsigned long intervalo;
  
  if (!WiFi.isConnected()) {
    intervalo = 200;
  } else if (!serverConnected) {
    intervalo = 500;
  } else if (!arduinoReady) {
    intervalo = 1000;
  } else {
    digitalWrite(LED_STATUS, HIGH);
    return;
  }
  
  if (millis() - last >= intervalo) {
    estado = !estado;
    digitalWrite(LED_STATUS, estado);
    last = millis();
  }
}