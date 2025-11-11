// =====================================================================
// ARDUINO UNO - SISTEMA DOMÓTICO COMPLETO
// Recibe comandos del ESP32 y envía estados de sensores
// =====================================================================

#include <Servo.h>

// --- PINES DE LUCES ---
const int pinExteriores = 4;
const int pinSalaComedor = 5;
const int pinCochera = 6;
const int pinCocina = 7;
const int pinCuarto = 8;
const int pinBanio = 9;
const int pinPasadizo = 10;
const int pinLavanderia = 11;

// --- SENSOR DE GAS MQ-6 ---
const int pinSensorGas = A0;
const int pinLedGas = 13;
const int pinBuzzerGas = 12;

// --- SENSOR PIR ---
const int pinPIR = 2;
const int pinLedPIR = 3;

// --- SENSOR LM35 ---
const int pinTemp = A1;
const int pinLedTemp = 11;  // Comparte con lavandería
const int umbralTemp = 25;

// --- SERVO PUERTA ---
Servo puertaGaraje;
int pinServo = 6;  // Comparte físicamente con cochera
int posicionCerrada = 0;
int posicionAbierta = 90;
bool puertaAbierta = false;
bool enMovimiento = false;
int velocidadServo = 25;

// --- VARIABLES SENSORES ---
int valorSensor = 0;
int valorLimpio = 0;
int nivelGas = 0;
const int UMBRAL_BAJO = 50;
const int UMBRAL_MEDIO = 150;
const int UMBRAL_ALTO = 250;
const int UMBRAL_CRITICO = 400;
unsigned long ultimoParpadeo = 0;
bool estadoLEDGas = false;
int frecuenciaParpadeo = 0;

bool movimientoDetectado = false;
float temperatura = 0;

// --- ESTADOS LUCES ---
bool estadoExteriores = false;
bool estadoSalaComedor = false;
bool estadoCochera = false;
bool estadoCocina = false;
bool estadoCuarto = false;
bool estadoBanio = false;
bool estadoPasadizo = false;
bool estadoLavanderia = false;

// --- TIEMPOS PARA ENVÍO ---
unsigned long ultimoEnvioSensores = 0;
const unsigned long intervaloSensores = 2000; // Cada 2 segundos

void setup() {
  Serial.begin(115200);
  Serial.println("ARDUINO:READY");
  
  // Configurar pines de luces
  pinMode(pinExteriores, OUTPUT);
  pinMode(pinSalaComedor, OUTPUT);
  pinMode(pinCochera, OUTPUT);
  pinMode(pinCocina, OUTPUT);
  pinMode(pinCuarto, OUTPUT);
  pinMode(pinBanio, OUTPUT);
  pinMode(pinPasadizo, OUTPUT);
  pinMode(pinLavanderia, OUTPUT);
  
  // Sensor de gas
  pinMode(pinLedGas, OUTPUT);
  pinMode(pinBuzzerGas, OUTPUT);
  calibrarSensorGas();
  
  // Sensor PIR
  pinMode(pinPIR, INPUT);
  pinMode(pinLedPIR, OUTPUT);
  
  // Sensor temperatura
  pinMode(pinLedTemp, OUTPUT);
  
  // Servo
  puertaGaraje.attach(pinServo);
  puertaGaraje.write(posicionCerrada);
  
  apagarTodas();
}

void loop() {
  // Leer comandos desde ESP32
  if (Serial.available() > 0) {
    String comando = Serial.readStringUntil('\n');
    comando.trim();
    
    if (comando.length() > 0) {
      procesarComando(comando);
    }
  }
  
  // Actualizar sensores
  leerSensorGas();
  leerSensorPIR();
  leerSensorTemp();
  mantenerPosicionPuerta();
  
  // Enviar datos de sensores periódicamente
  if (millis() - ultimoEnvioSensores >= intervaloSensores) {
    enviarEstadoSensores();
    ultimoEnvioSensores = millis();
  }
  
  delay(100);
}

// =====================================================================
// PROCESAMIENTO DE COMANDOS
// =====================================================================

void procesarComando(String cmd) {
  int comando = cmd.toInt();
  
  // Si es un carácter (puerta o estado)
  if (comando == 0 && cmd.length() == 1) {
    char c = cmd.charAt(0);
    
    if (c == 'A') {
      abrirPuerta();
      return;
    } else if (c == 'C') {
      cerrarPuerta();
      return;
    } else if (c == 'S') {
      enviarEstadoCompleto();
      return;
    }
  }
  
  // Comandos numéricos de luces
  switch (comando) {
    case 1:
      controlarLuz(pinExteriores, true);
      estadoExteriores = true;
      enviarConfirmacion("Exteriores", true);
      break;
    case 2:
      controlarLuz(pinExteriores, false);
      estadoExteriores = false;
      enviarConfirmacion("Exteriores", false);
      break;
    case 3:
      controlarLuz(pinSalaComedor, true);
      estadoSalaComedor = true;
      enviarConfirmacion("SalaComedor", true);
      break;
    case 4:
      controlarLuz(pinSalaComedor, false);
      estadoSalaComedor = false;
      enviarConfirmacion("SalaComedor", false);
      break;
    case 5:
      controlarLuz(pinCochera, true);
      estadoCochera = true;
      enviarConfirmacion("Cochera", true);
      break;
    case 6:
      controlarLuz(pinCochera, false);
      estadoCochera = false;
      enviarConfirmacion("Cochera", false);
      break;
    case 7:
      controlarLuz(pinCocina, true);
      estadoCocina = true;
      enviarConfirmacion("Cocina", true);
      break;
    case 8:
      controlarLuz(pinCocina, false);
      estadoCocina = false;
      enviarConfirmacion("Cocina", false);
      break;
    case 9:
      controlarLuz(pinCuarto, true);
      estadoCuarto = true;
      enviarConfirmacion("Cuarto", true);
      break;
    case 10:
      controlarLuz(pinCuarto, false);
      estadoCuarto = false;
      enviarConfirmacion("Cuarto", false);
      break;
    case 11:
      controlarLuz(pinBanio, true);
      estadoBanio = true;
      enviarConfirmacion("Banio", true);
      break;
    case 12:
      controlarLuz(pinBanio, false);
      estadoBanio = false;
      enviarConfirmacion("Banio", false);
      break;
    case 13:
      controlarLuz(pinPasadizo, true);
      estadoPasadizo = true;
      enviarConfirmacion("Pasadizo", true);
      break;
    case 14:
      controlarLuz(pinPasadizo, false);
      estadoPasadizo = false;
      enviarConfirmacion("Pasadizo", false);
      break;
    case 15:
      controlarLuz(pinLavanderia, true);
      estadoLavanderia = true;
      enviarConfirmacion("Lavanderia", true);
      break;
    case 16:
      controlarLuz(pinLavanderia, false);
      estadoLavanderia = false;
      enviarConfirmacion("Lavanderia", false);
      break;
    case 17:
      encenderTodas();
      Serial.println("OK:TODAS_ENCENDIDAS");
      break;
    case 18:
      apagarTodas();
      Serial.println("OK:TODAS_APAGADAS");
      break;
    case 99:
      enviarEstadoCompleto();
      break;
    default:
      Serial.println("ERROR:COMANDO_INVALIDO:" + String(comando));
      break;
  }
}

// =====================================================================
// CONTROL DE LUCES
// =====================================================================

void controlarLuz(int pin, bool estado) {
  digitalWrite(pin, estado ? HIGH : LOW);
}

void encenderTodas() {
  digitalWrite(pinExteriores, HIGH);
  digitalWrite(pinSalaComedor, HIGH);
  digitalWrite(pinCochera, HIGH);
  digitalWrite(pinCocina, HIGH);
  digitalWrite(pinCuarto, HIGH);
  digitalWrite(pinBanio, HIGH);
  digitalWrite(pinPasadizo, HIGH);
  digitalWrite(pinLavanderia, HIGH);
  
  estadoExteriores = true;
  estadoSalaComedor = true;
  estadoCochera = true;
  estadoCocina = true;
  estadoCuarto = true;
  estadoBanio = true;
  estadoPasadizo = true;
  estadoLavanderia = true;
}

void apagarTodas() {
  digitalWrite(pinExteriores, LOW);
  digitalWrite(pinSalaComedor, LOW);
  digitalWrite(pinCochera, LOW);
  digitalWrite(pinCocina, LOW);
  digitalWrite(pinCuarto, LOW);
  digitalWrite(pinBanio, LOW);
  digitalWrite(pinPasadizo, LOW);
  digitalWrite(pinLavanderia, LOW);
  
  estadoExteriores = false;
  estadoSalaComedor = false;
  estadoCochera = false;
  estadoCocina = false;
  estadoCuarto = false;
  estadoBanio = false;
  estadoPasadizo = false;
  estadoLavanderia = false;
}

void enviarConfirmacion(String zona, bool estado) {
  Serial.print("OK:");
  Serial.print(zona);
  Serial.print(":");
  Serial.println(estado ? "ON" : "OFF");
}

// =====================================================================
// SENSOR DE GAS MQ-6
// =====================================================================

void calibrarSensorGas() {
  long suma = 0;
  int lecturas = 50;
  
  for (int i = 0; i < lecturas; i++) {
    suma += analogRead(pinSensorGas);
    delay(100);
  }
  valorLimpio = suma / lecturas;
  Serial.print("GAS_CALIBRADO:");
  Serial.println(valorLimpio);
}

void leerSensorGas() {
  valorSensor = analogRead(pinSensorGas);
  nivelGas = max(0, valorSensor - valorLimpio);
  
  if (nivelGas < UMBRAL_BAJO) {
    digitalWrite(pinLedGas, LOW);
    noTone(pinBuzzerGas);
    frecuenciaParpadeo = 0;
  } else if (nivelGas < UMBRAL_MEDIO) {
    frecuenciaParpadeo = 1000;
    noTone(pinBuzzerGas);
  } else if (nivelGas < UMBRAL_ALTO) {
    frecuenciaParpadeo = 250;
    noTone(pinBuzzerGas);
  } else if (nivelGas < UMBRAL_CRITICO) {
    frecuenciaParpadeo = 150;
    if (millis() % 1000 < 500) tone(pinBuzzerGas, 1500, 100);
    else noTone(pinBuzzerGas);
  } else {
    frecuenciaParpadeo = 100;
    tone(pinBuzzerGas, 2000);
    digitalWrite(pinLedGas, HIGH);
  }
  
  if (nivelGas < UMBRAL_CRITICO && frecuenciaParpadeo > 0) {
    unsigned long tiempoActual = millis();
    if (tiempoActual - ultimoParpadeo >= frecuenciaParpadeo) {
      estadoLEDGas = !estadoLEDGas;
      digitalWrite(pinLedGas, estadoLEDGas);
      ultimoParpadeo = tiempoActual;
    }
  }
  
  // Enviar alerta si supera umbral crítico
  static bool alertaEnviada = false;
  if (nivelGas >= UMBRAL_CRITICO && !alertaEnviada) {
    Serial.println("ALERT:GAS_CRITICO:" + String(nivelGas));
    alertaEnviada = true;
  } else if (nivelGas < UMBRAL_CRITICO) {
    alertaEnviada = false;
  }
}

// =====================================================================
// SENSOR PIR
// =====================================================================

void leerSensorPIR() {
  int estado = digitalRead(pinPIR);
  
  if (estado == HIGH) {
    if (!movimientoDetectado) {
      movimientoDetectado = true;
      digitalWrite(pinLedPIR, HIGH);
      Serial.println("ALERT:MOVIMIENTO_DETECTADO");
    }
  } else {
    if (movimientoDetectado) {
      movimientoDetectado = false;
      digitalWrite(pinLedPIR, LOW);
      Serial.println("INFO:MOVIMIENTO_CESADO");
    }
  }
}

// =====================================================================
// SENSOR LM35
// =====================================================================

void leerSensorTemp() {
  int lectura = analogRead(pinTemp);
  float voltaje = (5.0 / 1024.0) * lectura;
  temperatura = voltaje * 100;
  
  if (temperatura >= umbralTemp) {
    digitalWrite(pinLedTemp, HIGH);
    
    static bool alertaTempEnviada = false;
    if (!alertaTempEnviada) {
      Serial.println("ALERT:TEMPERATURA_ALTA:" + String(temperatura, 1));
      alertaTempEnviada = true;
    }
  } else {
    digitalWrite(pinLedTemp, LOW);
  }
}

// =====================================================================
// SERVO PUERTA
// =====================================================================

void abrirPuerta() {
  if (puertaAbierta) {
    Serial.println("INFO:PUERTA_YA_ABIERTA");
    return;
  }
  
  enMovimiento = true;
  Serial.println("INFO:ABRIENDO_PUERTA");
  
  for (int pos = posicionCerrada; pos <= posicionAbierta; pos++) {
    puertaGaraje.write(pos);
    delay(velocidadServo);
  }
  
  puertaGaraje.write(posicionAbierta);
  puertaAbierta = true;
  enMovimiento = false;
  Serial.println("OK:PUERTA:ABIERTA");
}

void cerrarPuerta() {
  if (!puertaAbierta) {
    Serial.println("INFO:PUERTA_YA_CERRADA");
    return;
  }
  
  enMovimiento = true;
  Serial.println("INFO:CERRANDO_PUERTA");
  
  for (int pos = posicionAbierta; pos >= posicionCerrada; pos--) {
    puertaGaraje.write(pos);
    delay(velocidadServo);
  }
  
  puertaGaraje.write(posicionCerrada);
  puertaAbierta = false;
  enMovimiento = false;
  Serial.println("OK:PUERTA:CERRADA");
}

void mantenerPosicionPuerta() {
  static unsigned long ultimo = 0;
  if (millis() - ultimo > 2000) {
    if (!enMovimiento) {
      if (puertaAbierta) puertaGaraje.write(posicionAbierta);
      else puertaGaraje.write(posicionCerrada);
    }
    ultimo = millis();
  }
}

// =====================================================================
// ENVÍO DE ESTADOS
// =====================================================================

void enviarEstadoSensores() {
  // Formato: SENSORS:gas,temp,pir,puerta
  Serial.print("SENSORS:");
  Serial.print(nivelGas);
  Serial.print(",");
  Serial.print(temperatura, 1);
  Serial.print(",");
  Serial.print(movimientoDetectado ? "1" : "0");
  Serial.print(",");
  Serial.println(puertaAbierta ? "1" : "0");
}

void enviarEstadoCompleto() {
  // Estado de luces
  Serial.print("STATUS:");
  Serial.print(estadoExteriores ? "1" : "0");
  Serial.print(",");
  Serial.print(estadoSalaComedor ? "1" : "0");
  Serial.print(",");
  Serial.print(estadoCochera ? "1" : "0");
  Serial.print(",");
  Serial.print(estadoCocina ? "1" : "0");
  Serial.print(",");
  Serial.print(estadoCuarto ? "1" : "0");
  Serial.print(",");
  Serial.print(estadoBanio ? "1" : "0");
  Serial.print(",");
  Serial.print(estadoPasadizo ? "1" : "0");
  Serial.print(",");
  Serial.println(estadoLavanderia ? "1" : "0");
  
  // Sensores
  delay(50);
  enviarEstadoSensores();
}