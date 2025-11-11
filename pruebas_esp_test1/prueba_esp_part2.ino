// ============================================
// ESP32 - GATEWAY MEJORADO
// Compatible con sistema domótico completo
// ============================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>

// --- CONFIGURACIÓN WIFI ---
const char* ssid = "TU_WIFI_SSID";        // ← CAMBIAR
const char* password = "TU_WIFI_PASSWORD"; // ← CAMBIAR

// --- CONFIGURACIÓN SERVIDOR NODE.JS ---
const char* SERVER_IP = "192.168.1.105";  // ← CAMBIAR: IP del servidor Node.js
const int SERVER_PORT = 5000;
const int WS_PORT = 5000;

// --- CONFIGURACIÓN SERIAL (UART2 para Arduino) ---
#define RXD2 16  // GPIO16 - RX del ESP32 → TX del Arduino
#define TXD2 17  // GPIO17 - TX del ESP32 → RX del Arduino
#define BAUD_RATE 115200

// --- CLIENTES ---
HTTPClient http;
WebSocketsClient webSocket;

// --- VARIABLES ---
unsigned long lastHeartbeat = 0;
unsigned long lastReconnect = 0;
bool arduinoReady = false;
bool serverConnected = false;
String deviceId = "ESP32_GATEWAY_01";

// --- LED INDICADOR (opcional) ---
const int LED_STATUS = 2; // LED integrado del ESP32

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n╔════════════════════════════════════════╗");
  Serial.println("║   ESP32 SMART HOME GATEWAY V2.0       ║");
  Serial.println("╚════════════════════════════════════════╝");
  
  // LED de estado
  pinMode(LED_STATUS, OUTPUT);
  digitalWrite(LED_STATUS, LOW);
  
  // Iniciar Serial2 para Arduino
  Serial2.begin(BAUD_RATE, SERIAL_8N1, RXD2, TXD2);
  Serial.println("✓ Serial2 iniciado para Arduino (115200 baud)");
  
  // Conectar WiFi
  conectarWiFi();
  
  // Conectar WebSocket al servidor
  conectarWebSocket();
  
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║        SISTEMA INICIADO                ║");
  Serial.println("╚════════════════════════════════════════╝\n");
}

void loop() {
  webSocket.loop();
  
  // Leer mensajes del Arduino
  if (Serial2.available()) {
    String mensaje = Serial2.readStringUntil('\n');
    mensaje.trim();
    
    if (mensaje.length() > 0) {
      procesarMensajeArduino(mensaje);
    }
  }
  
  // Heartbeat cada 10 segundos
  if (millis() - lastHeartbeat > 10000) {
    lastHeartbeat = millis();
    enviarHeartbeat();
  }
  
  // Intentar reconectar WebSocket si se desconectó
  if (!webSocket.isConnected() && millis() - lastReconnect > 5000) {
    lastReconnect = millis();
    Serial.println("⟳ Intentando reconectar WebSocket...");
    conectarWebSocket();
  }
  
  // Parpadeo LED según estado
  actualizarLEDEstado();
}

// =====================================================
// CONEXIÓN WIFI
// =====================================================

void conectarWiFi() {
  Serial.print("📡 Conectando WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(500);
    Serial.print(".");
    intentos++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi conectado exitosamente");
    Serial.print("   IP ESP32: ");
    Serial.println(WiFi.localIP());
    Serial.print("   RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    Serial.print("   Gateway: ");
    Serial.println(WiFi.gatewayIP());
    
    // Esperar un poco antes de conectar al servidor
    delay(1000);
    enviarRegistro();
  } else {
    Serial.println("\n✗ ERROR: No se pudo conectar al WiFi");
    Serial.println("   Reiniciando en 5 segundos...");
    delay(5000);
    ESP.restart();
  }
}

// =====================================================
// WEBSOCKET
// =====================================================

void conectarWebSocket() {
  Serial.print("🔌 Conectando WebSocket: ");
  Serial.print(SERVER_IP);
  Serial.print(":");
  Serial.println(WS_PORT);
  
  webSocket.beginSocketIO(SERVER_IP, WS_PORT, "/socket.io/?EIO=4");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED: {
      Serial.println("✗ WebSocket desconectado del servidor");
      serverConnected = false;
      break;
    }
      
    case WStype_CONNECTED: {
      Serial.println("✓ WebSocket conectado al servidor Node.js");
      serverConnected = true;
      
      // Enviar identificación
      String identMsg = "{\"type\":\"esp32_connected\",\"deviceId\":\"" + deviceId + "\",\"version\":\"2.0\"}";
      webSocket.sendTXT(identMsg);
      
      // Mensaje de bienvenida al servidor
      Serial.println("📤 Enviando identificación al servidor...");
      break;
    }
      
    case WStype_TEXT: {
      String mensaje = String((char*)payload);
      Serial.print("📥 Servidor → ESP32: ");
      Serial.println(mensaje);
      
      procesarComandoServidor(mensaje);
      break;
    }
    
    default:
      break;
  }
}

// =====================================================
// PROCESAMIENTO DE MENSAJES
// =====================================================

void procesarMensajeArduino(String mensaje) {
  Serial.print("📨 Arduino → Servidor: ");
  Serial.println(mensaje);
  
  // Detectar si Arduino está listo
  if (mensaje == "ARDUINO:READY") {
    arduinoReady = true;
    Serial.println("✓ Arduino reporta estado LISTO");
  }
  
  // Detectar alertas críticas y mostrarlas
  if (mensaje.startsWith("ALERT:")) {
    Serial.println("🚨 ¡ALERTA DETECTADA!");
  }
  
  // Enviar al servidor por WebSocket
  if (webSocket.isConnected()) {
    webSocket.sendTXT(mensaje);
  } else {
    // Si WebSocket no está disponible, enviar por HTTP
    Serial.println("⚠️ WebSocket no disponible, usando HTTP...");
    enviarMensajeHTTP(mensaje);
  }
}

void procesarComandoServidor(String mensaje) {
  // Comandos numéricos (luces)
  int comando = mensaje.toInt();
  if (comando > 0 && comando <= 99) {
    Serial.print("📤 Enviando comando al Arduino: ");
    Serial.println(comando);
    Serial2.println(comando);
    return;
  }
  
  // Comandos de texto en JSON
  if (mensaje.startsWith("{")) {
    // Buscar campo "command"
    int cmdIdx = mensaje.indexOf("\"command\":");
    if (cmdIdx != -1) {
      // Extraer comando (puede ser número o letra)
      int valStart = cmdIdx + 10;
      int valEnd = mensaje.indexOf(",", valStart);
      if (valEnd == -1) valEnd = mensaje.indexOf("}", valStart);
      
      String cmdValue = mensaje.substring(valStart, valEnd);
      cmdValue.trim();
      cmdValue.replace("\"", ""); // Eliminar comillas si es string
      
      Serial.print("📤 Comando JSON al Arduino: ");
      Serial.println(cmdValue);
      Serial2.println(cmdValue);
    }
  }
  
  // Comandos directos (para puerta, etc)
  if (mensaje == "A" || mensaje == "C" || mensaje == "S") {
    Serial.print("📤 Comando especial al Arduino: ");
    Serial.println(mensaje);
    Serial2.println(mensaje);
  }
}

// =====================================================
// COMUNICACIÓN HTTP
// =====================================================

void enviarRegistro() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/esp32/register";
  
  Serial.print("📡 Registrando en servidor: ");
  Serial.println(url);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String json = "{";
  json += "\"deviceId\":\"" + deviceId + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"version\":\"2.0\",";
  json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false");
  json += "}";
  
  int httpCode = http.POST(json);
  
  if (httpCode > 0) {
    Serial.print("✓ Registro exitoso. Código: ");
    Serial.println(httpCode);
    if (httpCode == 200) {
      String response = http.getString();
      Serial.print("   Respuesta: ");
      Serial.println(response);
    }
  } else {
    Serial.print("✗ Error en registro. Código: ");
    Serial.println(httpCode);
    Serial.print("   Error: ");
    Serial.println(http.errorToString(httpCode));
  }
  
  http.end();
}

void enviarHeartbeat() {
  if (webSocket.isConnected()) {
    String json = "{";
    json += "\"type\":\"heartbeat\",";
    json += "\"deviceId\":\"" + deviceId + "\",";
    json += "\"uptime\":" + String(millis() / 1000) + ",";
    json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + ",";
    json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false");
    json += "}";
    
    webSocket.sendTXT(json);
  } else {
    enviarEstadoHTTP("heartbeat");
  }
}

void enviarMensajeHTTP(String mensaje) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/esp32/message";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String json = "{";
  json += "\"deviceId\":\"" + deviceId + "\",";
  json += "\"message\":\"" + mensaje + "\"";
  json += "}";
  
  int httpCode = http.POST(json);
  
  if (httpCode > 0) {
    Serial.println("✓ Mensaje HTTP enviado");
  } else {
    Serial.print("✗ Error HTTP: ");
    Serial.println(http.errorToString(httpCode));
  }
  
  http.end();
}

void enviarEstadoHTTP(String estado) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/esp32/status";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String json = "{";
  json += "\"deviceId\":\"" + deviceId + "\",";
  json += "\"status\":\"" + estado + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"uptime\":" + String(millis() / 1000) + ",";
  json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false");
  json += "}";
  
  int httpCode = http.POST(json);
  http.end();
}

// =====================================================
// LED DE ESTADO
// =====================================================

void actualizarLEDEstado() {
  static unsigned long ultimoCambio = 0;
  static bool estadoLED = false;
  
  unsigned long intervalo;
  
  if (!WiFi.isConnected()) {
    intervalo = 200; // Parpadeo rápido: sin WiFi
  } else if (!serverConnected) {
    intervalo = 500; // Parpadeo medio: WiFi OK, sin servidor
  } else if (!arduinoReady) {
    intervalo = 1000; // Parpadeo lento: esperando Arduino
  } else {
    // Todo OK: LED encendido
    digitalWrite(LED_STATUS, HIGH);
    return;
  }
  
  if (millis() - ultimoCambio >= intervalo) {
    estadoLED = !estadoLED;
    digitalWrite(LED_STATUS, estadoLED);
    ultimoCambio = millis();
  }
}

// =====================================================
// MONITOREO Y DEBUG
// =====================================================

void mostrarEstado() {
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║         ESTADO DEL SISTEMA             ║");
  Serial.println("╠════════════════════════════════════════╣");
  Serial.print("║ WiFi: ");
  Serial.println(WiFi.isConnected() ? "✓ Conectado         ║" : "✗ Desconectado      ║");
  Serial.print("║ Servidor: ");
  Serial.println(serverConnected ? "✓ Conectado      ║" : "✗ Desconectado   ║");
  Serial.print("║ Arduino: ");
  Serial.println(arduinoReady ? "✓ Listo          ║" : "✗ No listo       ║");
  Serial.print("║ IP: ");
  Serial.print(WiFi.localIP().toString());
  Serial.println("       ║");
  Serial.print("║ RSSI: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm              ║");
  Serial.print("║ Uptime: ");
  Serial.print(millis() / 1000);
  Serial.println(" seg            ║");
  Serial.println("╚════════════════════════════════════════╝\n");
}