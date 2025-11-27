// ============================================
// ESP32 - GATEWAY FINAL + VOICE MODULE
// ============================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <driver/i2s.h>  // ← NUEVO: Para INMP441

// --- WIFI ---
const char* ssid = "TU_WIFI_SSID";
const char* password = "TU_WIFI_PASSWORD";

// --- SERVIDOR ---
const char* SERVER_IP = "10.145.65.93";
const int SERVER_PORT = 5000;

// --- SERIAL ARDUINO ---
#define RXD2 16
#define TXD2 17
#define BAUD_RATE 115200

// --- INMP441 I2S (NUEVO) ---
#define I2S_WS 15    // LRCLK
#define I2S_SD 32    // DOUT
#define I2S_SCK 14   // BCLK
#define I2S_PORT I2S_NUM_0
#define SAMPLE_RATE 16000
#define BUFFER_SIZE 512

// --- WEBSOCKET ---
WebSocketsClient webSocket;

// --- VARIABLES ORIGINALES ---
unsigned long lastHeartbeat = 0;
unsigned long lastReconnect = 0;
bool arduinoReady = false;
bool serverConnected = false;
bool registeredHTTP = false;
String deviceId = "ESP32_GATEWAY_01";

// --- VARIABLES VOZ (NUEVO) ---
bool isListening = false;
unsigned long listenStartTime = 0;
const unsigned long LISTEN_TIMEOUT = 5000; // 5 segundos
int16_t audioBuffer[BUFFER_SIZE];
String capturedCommand = "";
const int WAKE_WORD_THRESHOLD = 1200; // Ajustar según tu micrófono

// --- LEDS ---
const int LED_STATUS = 2;
const int LED_VOICE = 4;  // ← NUEVO: LED indicador de voz (opcional)

// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(200);
  
  Serial.println("\n╔═══════════════════════════════╗");
  Serial.println("║  ESP32 GATEWAY v3.1 + VOICE   ║");
  Serial.println("╚═══════════════════════════════╝");
  
  pinMode(LED_STATUS, OUTPUT);
  pinMode(LED_VOICE, OUTPUT);  // ← NUEVO
  
  Serial2.begin(BAUD_RATE, SERIAL_8N1, RXD2, TXD2);
  Serial.println("✓ Serial2 OK (115200)");
  
  setupI2S();  // ← NUEVO: Configurar micrófono
  
  conectarWiFi();
  conectarWebSocket();
  
  Serial.println("\n✅ Sistema iniciado");
  Serial.println("💬 Di algo fuerte para activar el asistente de voz\n");
}

// =====================================================
// LOOP
// =====================================================

void loop() {
  webSocket.loop();
  
  // Leer Arduino (ORIGINAL)
  if (Serial2.available()) {
    String msg = Serial2.readStringUntil('\n');
    msg.trim();
    if (msg.length() > 0) {
      enviarMensajeArduino(msg);
    }
  }
  
  // Debug manual (ORIGINAL)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      Serial.print("🔧 Manual → Arduino: ");
      Serial.println(cmd);
      Serial2.println(cmd);
    }
  }
  
  // ==========================================
  // NUEVO: PROCESAMIENTO DE VOZ
  // ==========================================
  if (!isListening) {
    // Modo detección de wake word
    if (detectWakeWord()) {
      activateListening();
    }
  } else {
    // Modo captura de comando
    if (millis() - listenStartTime > LISTEN_TIMEOUT) {
      deactivateListening();
    } else {
      captureAudio();
    }
  }
  // ==========================================
  
  // Heartbeat cada 20 segundos (ORIGINAL)
  if (millis() - lastHeartbeat > 20000) {
    lastHeartbeat = millis();
    enviarHeartbeat();
  }
  
  // Reconectar si necesario (ORIGINAL)
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
// NUEVO: FUNCIONES I2S (INMP441)
// =====================================================

void setupI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = BUFFER_SIZE,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  if (err == ESP_OK) {
    err = i2s_set_pin(I2S_PORT, &pin_config);
    if (err == ESP_OK) {
      Serial.println("✓ I2S OK (INMP441)");
    } else {
      Serial.println("✗ I2S Pin Config FAIL");
    }
  } else {
    Serial.println("✗ I2S Driver Install FAIL");
  }
}

bool detectWakeWord() {
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, audioBuffer, BUFFER_SIZE * sizeof(int16_t), &bytesRead, 10);
  
  if (bytesRead == 0) return false;
  
  // Calcular energía promedio del audio
  long energy = 0;
  int samples = bytesRead / sizeof(int16_t);
  
  for (int i = 0; i < samples; i++) {
    energy += abs(audioBuffer[i]);
  }
  
  int avgEnergy = energy / samples;
  
  // Si supera el umbral, asumir wake word
  if (avgEnergy > WAKE_WORD_THRESHOLD) {
    Serial.print("🔊 Audio detectado (energía: ");
    Serial.print(avgEnergy);
    Serial.println(")");
    return true;
  }
  
  return false;
}

void captureAudio() {
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, audioBuffer, BUFFER_SIZE * sizeof(int16_t), &bytesRead, 10);
  
  if (bytesRead > 0) {
    // Mostrar progreso
    static int dots = 0;
    if (++dots % 20 == 0) {
      Serial.print(".");
    }
  }
}

void activateListening() {
  isListening = true;
  listenStartTime = millis();
  capturedCommand = "";
  digitalWrite(LED_VOICE, HIGH);
  
  Serial.println("\n🎤 ACTIVADO - Escuchando...");
  
  // Notificar al servidor
  if (webSocket.isConnected()) {
    String json = "{\"type\":\"voice_event\",\"deviceId\":\"" + deviceId + "\",\"event\":\"wake_word_detected\"}";
    webSocket.sendTXT(json);
  }
}

void deactivateListening() {
  isListening = false;
  digitalWrite(LED_VOICE, LOW);
  
  Serial.println("\n⏹️ Fin de escucha");
  
  // Simular comando capturado (mientras no tengas STT real)
  // En producción, aquí irían los datos de audio procesados
  
  // Por ahora, solo notificar al servidor que terminó
  if (webSocket.isConnected()) {
    String json = "{\"type\":\"voice_event\",\"deviceId\":\"" + deviceId + "\",\"event\":\"listening_ended\"}";
    webSocket.sendTXT(json);
  }
}

// =====================================================
// WIFI (ORIGINAL)
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
// WEBSOCKET (ORIGINAL)
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
      
      // Identificarse (agregar capacidad de voz)
      String id = "{\"type\":\"esp32_connected\",\"deviceId\":\"" + deviceId + "\",\"capabilities\":\"voice\"}";
      webSocket.sendTXT(id);
      Serial.println("📤 ID enviado (con voz)");
      
      // Registrar por HTTP
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
// MENSAJES ARDUINO (ORIGINAL)
// =====================================================

void enviarMensajeArduino(String msg) {
  if (msg.startsWith("SENSORS:")) {
    // No loguear sensores
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
  
  if (webSocket.isConnected()) {
    String json = "{\"deviceId\":\"" + deviceId + "\",\"message\":\"" + msg + "\"}";
    webSocket.sendTXT(json);
  }
}

// =====================================================
// HTTP Y HEARTBEAT (ORIGINAL)
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
  json += "\"version\":\"3.1\",";  // ← Actualizado
  json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false") + ",";
  json += "\"voiceEnabled\":true";  // ← NUEVO
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
  json += "\"arduinoReady\":" + String(arduinoReady ? "true" : "false") + ",";
  json += "\"voiceActive\":" + String(isListening ? "true" : "false");  // ← NUEVO
  json += "}";
  
  webSocket.sendTXT(json);
  Serial.println("💓 Heartbeat");
}

// =====================================================
// LED (MODIFICADO)
// =====================================================

void actualizarLED() {
  static unsigned long last = 0;
  static bool estado = false;
  
  unsigned long intervalo;
  
  // LED de estado (igual que antes)
  if (!WiFi.isConnected()) {
    intervalo = 200;
  } else if (!serverConnected) {
    intervalo = 500;
  } else if (!arduinoReady) {
    intervalo = 1000;
  } else {
    digitalWrite(LED_STATUS, HIGH);
    
    // NUEVO: LED de voz parpadea cuando está escuchando
    if (isListening) {
      if (millis() - last >= 100) {
        estado = !estado;
        digitalWrite(LED_VOICE, estado);
        last = millis();
      }
    }
    return;
  }
  
  if (millis() - last >= intervalo) {
    estado = !estado;
    digitalWrite(LED_STATUS, estado);
    last = millis();
  }
}

// =====================================================
// INSTRUCCIONES DE USO
// =====================================================

/*
CONEXIONES INMP441:
- VDD  → 3.3V
- GND  → GND
- SD   → GPIO 32
- WS   → GPIO 15
- SCK  → GPIO 14
- L/R  → GND

LED VOZ (OPCIONAL):
- LED+ → GPIO 4 → Resistencia 220Ω → GND

CALIBRAR UMBRAL:
1. Sube el código
2. Abre Serial Monitor (115200 baud)
3. Haz ruido/habla cerca del micrófono
4. Observa los valores de "energía"
5. Ajusta WAKE_WORD_THRESHOLD (~70% del máximo que veas)

PRÓXIMOS PASOS:
- Este código detecta audio y notifica al servidor
- Para STT real, agrega código que envíe el audio al servidor
- O implementa un modelo ML de wake word (ESP-SR, Porcupine)
*/