// ============================================
// ARDUINO UNO - CONTROLADOR DE LUCES
// Recibe comandos por Serial desde ESP32
// ============================================

// --- Asignación de pines por zona ---
const int pinExteriores = 4;
const int pinSalaComedor = 5;
const int pinCochera = 6;
const int pinCocina = 7;
const int pinCuarto = 8;
const int pinBanio = 9;
const int pinPasadizo = 10;
const int pinLavanderia = 11;

// Estados actuales de las luces
bool estadoExteriores = false;
bool estadoSalaComedor = false;
bool estadoCochera = false;
bool estadoCocina = false;
bool estadoCuarto = false;
bool estadoBanio = false;
bool estadoPasadizo = false;
bool estadoLavanderia = false;

void setup() {
  // Configurar pines como salida
  pinMode(pinExteriores, OUTPUT);
  pinMode(pinSalaComedor, OUTPUT);
  pinMode(pinCochera, OUTPUT);
  pinMode(pinCocina, OUTPUT);
  pinMode(pinCuarto, OUTPUT);
  pinMode(pinBanio, OUTPUT);
  pinMode(pinPasadizo, OUTPUT);
  pinMode(pinLavanderia, OUTPUT);
  
  // Apagar todas las luces al inicio
  apagarTodas();
  
  // Iniciar comunicación serial con ESP32
  Serial.begin(115200); // Velocidad alta para comunicación con ESP32
  
  // Enviar confirmación de inicio
  Serial.println("ARDUINO:READY");
}

void loop() {
  // Verificar si hay datos disponibles desde ESP32
  if (Serial.available() > 0) {
    String comando = Serial.readStringUntil('\n');
    comando.trim(); // Eliminar espacios en blanco
    
    if (comando.length() > 0) {
      procesarComando(comando);
    }
  }
}

// --- Procesar comandos recibidos ---
void procesarComando(String cmd) {
  int comando = cmd.toInt();
  
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
      
    case 99: // Comando especial para obtener estado
      enviarEstadoCompleto();
      break;
      
    default:
      Serial.println("ERROR:COMANDO_INVALIDO:" + String(comando));
      break;
  }
}

// --- Controlar una luz específica ---
void controlarLuz(int pin, bool estado) {
  digitalWrite(pin, estado ? HIGH : LOW);
}

// --- Encender todas las luces ---
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

// --- Apagar todas las luces ---
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

// --- Enviar confirmación al ESP32 ---
void enviarConfirmacion(String zona, bool estado) {
  Serial.print("OK:");
  Serial.print(zona);
  Serial.print(":");
  Serial.println(estado ? "ON" : "OFF");
}

// --- Enviar estado completo de todas las luces ---
void enviarEstadoCompleto() {
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
}