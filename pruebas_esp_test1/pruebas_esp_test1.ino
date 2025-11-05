// ============================================
// ESP32 - CLIENTE QUE SE CONECTA AL SERVIDOR
// Envía datos al servidor Node.js y recibe comandos
// ============================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>

// --- CONFIGURACIÓN WIFI ---
const char* ssid = "";       // ← CAMBIAR
const char* password = ""; // ← CAMBIAR


// --- CONFIGURACIÓN SERVIDOR NODE.JS ---
const char* SERVER_IP = "";  // ← CAMBIAR: IP del servidor Node.js
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
String deviceId = "ESP32_GATEWAY_01";

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== ESP32 GATEWAY CLIENT ===");
  
  // Iniciar Serial2 para Arduino
  Serial2.begin(BAUD_RATE, SERIAL_8N1, RXD2, TXD2);
  Serial.println("✓ Serial2 iniciado para Arduino");
  
  // Conectar WiFi
  conectarWiFi();
  
  // Conectar WebSocket al servidor
  conectarWebSocket();
  
  Serial.println("\n=== Sistema Iniciado ===");
}

void loop() {
  webSocket.loop();
  
  // Leer mensajes del Arduino
  if (Serial2.available()) {
    String mensaje = Serial2.readStringUntil('\n');
    mensaje.trim();
    
    if (mensaje.length() > 0) {
      Serial.println("Arduino → Servidor: " + mensaje);
      
      // Verificar si Arduino está listo
      if (mensaje == "ARDUINO:READY") {
        arduinoReady = true;
        enviarEstadoHTTP("ready");
      }
      
      // Enviar mensaje al servidor por WebSocket
      if (webSocket.isConnected()) {
        webSocket.sendTXT(mensaje);
      } else {
        // Si WebSocket no está conectado, enviar por HTTP
        enviarMensajeHTTP(mensaje);
      }
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
    Serial.println("Intentando reconectar WebSocket...");
    conectarWebSocket();
  }
}

void conectarWiFi() {
  Serial.print("Conectando WiFi: ");
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
    Serial.println("\n✓ WiFi conectado");
    Serial.print("IP ESP32: ");
    Serial.println(WiFi.localIP());
    Serial.print("RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    
    // Notificar al servidor que estamos conectados
    delay(1000); // Esperar un poco para que el servidor esté listo
    enviarRegistro();
  } else {
    Serial.println("\n✗ Error WiFi - Reiniciando...");
    delay(5000);
    ESP.restart();
  }
}

void conectarWebSocket() {
  Serial.print("Conectando WebSocket al servidor: ");
  Serial.print(SERVER_IP);
  Serial.print(":");
  Serial.println(WS_PORT);
  
  // Conectar al path /socket.io/ con protocolo Socket.IO
  webSocket.beginSocketIO(SERVER_IP, WS_PORT, "/socket.io/?EIO=4");
  
  // Configurar eventos
  webSocket.onEvent(webSocketEvent);
  
  // Configurar reconexión automática
  webSocket.setReconnectInterval(5000);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("✗ WebSocket desconectado");
      break;
      
    case WStype_CONNECTED: {
      Serial.println("✓ WebSocket conectado al servidor");
      
      // Enviar identificación
      String identMsg = "{\"type\":\"esp32_connected\",\"deviceId\":\"" + deviceId + "\"}";
      webSocket.sendTXT(identMsg);
      break;
    }
      
    case WStype_TEXT: {
      String mensaje = String((char*)payload);
      Serial.println("Servidor → ESP32: " + mensaje);
      
      // Procesar comandos del servidor
      procesarComandoServidor(mensaje);
      break;
    }
    
    default:
      break;
  }
}

void procesarComandoServidor(String mensaje) {
  // Si es un comando numérico, enviarlo al Arduino
  int comando = mensaje.toInt();
  if (comando > 0 && comando <= 99) {
    Serial.println("Enviando comando al Arduino: " + String(comando));
    Serial2.println(comando);
  }
  
  // También procesar comandos JSON
  if (mensaje.startsWith("{")) {
    // Aquí puedes parsear JSON si necesitas comandos más complejos
    // Por ahora, buscar el campo "command"
    int cmdIdx = mensaje.indexOf("\"command\":");
    if (cmdIdx != -1) {
      int numStart = cmdIdx + 10;
      int numEnd = mensaje.indexOf(",", numStart);
      if (numEnd == -1) numEnd = mensaje.indexOf("}", numStart);
      
      String cmdStr = mensaje.substring(numStart, numEnd);
      cmdStr.trim();
      int cmd = cmdStr.toInt();
      
      if (cmd > 0) {
        Serial.println("Comando desde JSON: " + String(cmd));
        Serial2.println(cmd);
      }
    }
  }
}

void enviarRegistro() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/esp32/register";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String json = "{";
  json += "\"deviceId\":\"" + deviceId + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false");
  json += "}";
  
  int httpCode = http.POST(json);
  
  if (httpCode > 0) {
    Serial.println("✓ Registro enviado al servidor: " + String(httpCode));
  } else {
    Serial.println("✗ Error al registrar: " + http.errorToString(httpCode));
  }
  
  http.end();
}

void enviarHeartbeat() {
  // Enviar por WebSocket si está conectado
  if (webSocket.isConnected()) {
    String json = "{";
    json += "\"type\":\"heartbeat\",";
    json += "\"deviceId\":\"" + deviceId + "\",";
    json += "\"uptime\":" + String(millis() / 1000) + ",";
    json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false");
    json += "}";
    
    webSocket.sendTXT(json);
  } else {
    // Enviar por HTTP como fallback
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
    Serial.println("✓ Mensaje enviado por HTTP: " + String(httpCode));
  } else {
    Serial.println("✗ Error HTTP: " + http.errorToString(httpCode));
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