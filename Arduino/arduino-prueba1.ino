// =====================================================================
// ARDUINO UNO - SISTEMA DOMÓTICO COMPLETO
// Recibe comandos del ESP32 y envía estados de sensores
// =====================================================================

#include <Servo.h>

// --- PINES DE LUCES ---
const int pinExteriores   = 22;
const int pinSalaComedor  = 23;
const int pinCochera      = 24;
const int pinCocina       = 25;
const int pinCuarto       = 26;
const int pinBanio        = 27;
const int pinPasadizo     = 28;
const int pinLavanderia   = 29;

// --- SENSOR DE GAS MQ-6 ---
const int pinSensorGas = A0;
const int pinLedGas    = 30;
const int pinBuzzerGas = 31;

// --- SENSOR PIR ---
const int pinPIR    = 32;
const int pinLedPIR = 33;

// --- SENSOR LM35 ---
const int pinTemp    = A1;
const int pinLedTemp = 34;
const int umbralTemp = 25;

// =====================================================================
// NUEVO: SERVOS - 2 PUERTAS
// =====================================================================
Servo puertaGaraje;      // Servo original (cochera)
Servo puertaPrincipal;   // ← NUEVO: Servo puerta principal

const int pinServoGaraje = 35;     // Pin original
const int pinServoPrincipal = 36;  // ← NUEVO: Pin servo principal

// Puerta Garaje (original)
int posicionCerradaGaraje = 0;
int posicionAbiertaGaraje = 90;
bool puertaGarajeAbierta = false;
bool enMovimientoGaraje = false;

// ← NUEVO: Puerta Principal
int posicionCerradaPrincipal = 0;
int posicionAbiertaPrincipal = 90;
bool puertaPrincipalAbierta = false;
bool enMovimientoPrincipal = false;

int velocidadServo = 25;
// =====================================================================

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
const unsigned long intervaloSensores = 2000;

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
  
  // ← NUEVO: Configurar ambos servos
  puertaGaraje.attach(pinServoGaraje);
  puertaGaraje.write(posicionCerradaGaraje);
  
  puertaPrincipal.attach(pinServoPrincipal);
  puertaPrincipal.write(posicionCerradaPrincipal);
  
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
  mantenerPosicionPuertas(); // ← MODIFICADO: Ahora mantiene ambas
  
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
    
    // ← MODIFICADO: Comandos de puertas
    if (c == 'A') {
      abrirPuertaPrincipal();  // A = Abrir Principal
      return;
    } else if (c == 'C') {
      cerrarPuertaPrincipal(); // C = Cerrar Principal
      return;
    } else if (c == 'G') {
      abrirPuertaGaraje();     // G = Abrir Garaje
      return;
    } else if (c == 'H') {
      cerrarPuertaGaraje();    // H = Cerrar Garaje (cHerrar)
      return;
    } else if (c == 'S') {
      enviarEstadoCompleto();
      return;
    }
  }
  
  // Comandos numéricos de luces (SIN CAMBIOS)
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
// CONTROL DE LUCES (SIN CAMBIOS)
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
// SENSOR DE GAS MQ-6 (SIN CAMBIOS)
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
  
  static bool alertaEnviada = false;
  if (nivelGas >= UMBRAL_CRITICO && !alertaEnviada) {
    Serial.println("ALERT:GAS_CRITICO:" + String(nivelGas));
    alertaEnviada = true;
  } else if (nivelGas < UMBRAL_CRITICO) {
    alertaEnviada = false;
  }
}

// =====================================================================
// SENSOR PIR (SIN CAMBIOS)
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
// SENSOR LM35 (SIN CAMBIOS)
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
// NUEVO: SERVOS - 2 PUERTAS
// =====================================================================

// --- PUERTA PRINCIPAL ---
void abrirPuertaPrincipal() {
  if (puertaPrincipalAbierta) {
    Serial.println("INFO:PUERTA_PRINCIPAL_YA_ABIERTA");
    return;
  }
  
  enMovimientoPrincipal = true;
  Serial.println("INFO:ABRIENDO_PUERTA_PRINCIPAL");
  
  for (int pos = posicionCerradaPrincipal; pos <= posicionAbiertaPrincipal; pos++) {
    puertaPrincipal.write(pos);
    delay(velocidadServo);
  }
  
  puertaPrincipal.write(posicionAbiertaPrincipal);
  puertaPrincipalAbierta = true;
  enMovimientoPrincipal = false;
  Serial.println("OK:PUERTA_PRINCIPAL:ON");
}

void cerrarPuertaPrincipal() {
  if (!puertaPrincipalAbierta) {
    Serial.println("INFO:PUERTA_PRINCIPAL_YA_CERRADA");
    return;
  }
  
  enMovimientoPrincipal = true;
  Serial.println("INFO:CERRANDO_PUERTA_PRINCIPAL");
  
  for (int pos = posicionAbiertaPrincipal; pos >= posicionCerradaPrincipal; pos--) {
    puertaPrincipal.write(pos);
    delay(velocidadServo);
  }
  
  puertaPrincipal.write(posicionCerradaPrincipal);
  puertaPrincipalAbierta = false;
  enMovimientoPrincipal = false;
  Serial.println("OK:PUERTA_PRINCIPAL:OFF");
}

// --- PUERTA GARAJE (RENOMBRADO) ---
void abrirPuertaGaraje() {
  if (puertaGarajeAbierta) {
    Serial.println("INFO:PUERTA_GARAJE_YA_ABIERTA");
    return;
  }
  
  enMovimientoGaraje = true;
  Serial.println("INFO:ABRIENDO_PUERTA_GARAJE");
  
  for (int pos = posicionCerradaGaraje; pos <= posicionAbiertaGaraje; pos++) {
    puertaGaraje.write(pos);
    delay(velocidadServo);
  }
  
  puertaGaraje.write(posicionAbiertaGaraje);
  puertaGarajeAbierta = true;
  enMovimientoGaraje = false;
  Serial.println("OK:PUERTA_COCHERA:ON");
}

void cerrarPuertaGaraje() {
  if (!puertaGarajeAbierta) {
    Serial.println("INFO:PUERTA_GARAJE_YA_CERRADA");
    return;
  }
  
  enMovimientoGaraje = true;
  Serial.println("INFO:CERRANDO_PUERTA_GARAJE");
  
  for (int pos = posicionAbiertaGaraje; pos >= posicionCerradaGaraje; pos--) {
    puertaGaraje.write(pos);
    delay(velocidadServo);
  }
  
  puertaGaraje.write(posicionCerradaGaraje);
  puertaGarajeAbierta = false;
  enMovimientoGaraje = false;
  Serial.println("OK:PUERTA_COCHERA:OFF");
}

// ← MODIFICADO: Mantener posición de ambas puertas
void mantenerPosicionPuertas() {
  static unsigned long ultimo = 0;
  if (millis() - ultimo > 2000) {
    if (!enMovimientoGaraje) {
      if (puertaGarajeAbierta) puertaGaraje.write(posicionAbiertaGaraje);
      else puertaGaraje.write(posicionCerradaGaraje);
    }
    
    if (!enMovimientoPrincipal) {
      if (puertaPrincipalAbierta) puertaPrincipal.write(posicionAbiertaPrincipal);
      else puertaPrincipal.write(posicionCerradaPrincipal);
    }
    
    ultimo = millis();
  }
}

// =====================================================================
// ENVÍO DE ESTADOS
// =====================================================================

void enviarEstadoSensores() {
  // ← MODIFICADO: Formato ahora incluye 2 puertas
  // SENSORS:gas,temp,pir,puertaPrincipal,puertaCochera
  Serial.print("SENSORS:");
  Serial.print(nivelGas);
  Serial.print(",");
  Serial.print(temperatura, 1);
  Serial.print(",");
  Serial.print(movimientoDetectado ? "1" : "0");
  Serial.print(",");
  Serial.print(puertaPrincipalAbierta ? "1" : "0");  // ← Puerta principal
  Serial.print(",");
  Serial.println(puertaGarajeAbierta ? "1" : "0");   // ← Puerta cochera
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