// =====================================================
// OLLAMA INTEGRATION MODULE
// Agregar al servidor Node.js existente
// =====================================================

const fetch = require('node-fetch'); // Necesitas: npm install node-fetch@2

// Configuración Ollama
const OLLAMA_URL = 'http://localhost:11434'; // URL de tu Ollama local
const MODEL = 'llama3.2'; // Modelo a usar (ajustar según disponibilidad)

// Contexto del sistema para Ollama
const SYSTEM_CONTEXT = `Eres un asistente virtual de una casa inteligente IoT. Tu trabajo es interpretar comandos en lenguaje natural y convertirlos en acciones específicas.

COMANDOS DISPONIBLES:
- Luces individuales: 1-16 (números pares apagan, impares encienden)
  * Exteriores: ON=1, OFF=2
  * Sala/Comedor: ON=3, OFF=4
  * Cochera: ON=5, OFF=6
  * Cocina: ON=7, OFF=8
  * Cuarto: ON=9, OFF=10
  * Baño: ON=11, OFF=12
  * Pasadizo: ON=13, OFF=14
  * Lavandería: ON=15, OFF=16
- Todas las luces: ON=17, OFF=18
- Puerta: ABRIR=A, CERRAR=C

SENSORES DISPONIBLES:
- gas: nivel de gas (MQ-6)
- temperature: temperatura en °C
- motion: detección de movimiento (PIR)
- door: estado de puerta (abierta/cerrada)

REGLAS:
1. Responde SOLO con un JSON válido
2. Si el usuario pide encender/apagar luces, devuelve: {"action": "command", "command": NÚMERO}
3. Si pide información de sensores, devuelve: {"action": "query", "sensor": "NOMBRE_SENSOR"}
4. Si pide abrir/cerrar puerta, devuelve: {"action": "door", "command": "A" o "C"}
5. Si es conversación general o no entiendes, devuelve: {"action": "chat", "response": "tu respuesta"}
6. NUNCA incluyas explicaciones fuera del JSON

EJEMPLOS:
Usuario: "enciende las luces de la sala"
Respuesta: {"action": "command", "command": 3, "zone": "salaComedor"}

Usuario: "apaga todo"
Respuesta: {"action": "command", "command": 18}

Usuario: "¿cuál es la temperatura?"
Respuesta: {"action": "query", "sensor": "temperature"}

Usuario: "abre la puerta"
Respuesta: {"action": "door", "command": "A"}

Usuario: "hola cómo estás"
Respuesta: {"action": "chat", "response": "¡Hola! Estoy aquí para ayudarte con tu casa inteligente. ¿Qué necesitas?"}`;

// =====================================================
// FUNCIÓN PRINCIPAL: Procesar comando con Ollama
// =====================================================

async function processWithOllama(userMessage, systemState) {
  try {
    // Agregar contexto del estado actual
    const contextMessage = `Estado actual del sistema:
- Luces encendidas: ${Object.entries(systemState.lights).filter(([k,v]) => v).map(([k]) => k).join(', ') || 'ninguna'}
- Temperatura: ${systemState.sensors.temperature.value}°C
- Gas: nivel ${systemState.sensors.gas.level} (${systemState.sensors.gas.status})
- Movimiento detectado: ${systemState.sensors.motion.detected ? 'SÍ' : 'NO'}
- Puerta: ${systemState.sensors.door.open ? 'ABIERTA' : 'CERRADA'}

Usuario: ${userMessage}`;

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt: contextMessage,
        system: SYSTEM_CONTEXT,
        stream: false,
        temperature: 0.3, // Baja temperatura para respuestas más deterministas
        options: {
          num_predict: 150 // Limitar tokens
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    const rawResponse = data.response.trim();

    console.log('🤖 Ollama raw:', rawResponse);

    // Intentar parsear JSON
    let parsedResponse;
    try {
      // Limpiar respuesta (a veces Ollama agrega texto extra)
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.warn('⚠️ Ollama no devolvió JSON válido, usando fallback');
      parsedResponse = {
        action: 'chat',
        response: rawResponse || 'No entendí tu solicitud. ¿Puedes reformularla?'
      };
    }

    return parsedResponse;

  } catch (error) {
    console.error('❌ Error Ollama:', error.message);
    return {
      action: 'error',
      response: 'Error al procesar con IA. ¿Está Ollama ejecutándose?'
    };
  }
}

// =====================================================
// FUNCIÓN: Verificar disponibilidad de Ollama
// =====================================================

async function checkOllamaStatus() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      timeout: 3000
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        models: data.models.map(m => m.name)
      };
    }
    return { available: false };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

// =====================================================
// FUNCIÓN: Generar respuesta en lenguaje natural
// =====================================================

function generateNaturalResponse(action, systemState) {
  const responses = {
    command: {
      1: '🏠 Encendiendo luces exteriores',
      2: '🏠 Apagando luces exteriores',
      3: '🛋️ Encendiendo sala/comedor',
      4: '🛋️ Apagando sala/comedor',
      5: '🚗 Encendiendo cochera',
      6: '🚗 Apagando cochera',
      7: '🍳 Encendiendo cocina',
      8: '🍳 Apagando cocina',
      9: '🛏️ Encendiendo cuarto',
      10: '🛏️ Apagando cuarto',
      11: '🚿 Encendiendo baño',
      12: '🚿 Apagando baño',
      13: '🚪 Encendiendo pasadizo',
      14: '🚪 Apagando pasadizo',
      15: '👕 Encendiendo lavandería',
      16: '👕 Apagando lavandería',
      17: '💡 Encendiendo todas las luces',
      18: '🌙 Apagando todas las luces'
    },
    door: {
      A: '🚪 Abriendo puerta...',
      C: '🚪 Cerrando puerta...'
    },
    query: {
      temperature: `🌡️ La temperatura actual es ${systemState.sensors.temperature.value.toFixed(1)}°C`,
      gas: `💨 Nivel de gas: ${systemState.sensors.gas.level} (${systemState.sensors.gas.status})`,
      motion: `👁️ Movimiento: ${systemState.sensors.motion.detected ? 'Detectado' : 'No detectado'}`,
      door: `🚪 Puerta: ${systemState.sensors.door.open ? 'Abierta' : 'Cerrada'}`
    }
  };

  if (action.action === 'command' && responses.command[action.command]) {
    return responses.command[action.command];
  }
  if (action.action === 'door' && responses.door[action.command]) {
    return responses.door[action.command];
  }
  if (action.action === 'query' && responses.query[action.sensor]) {
    return responses.query[action.sensor];
  }
  
  return action.response || '✓ Comando ejecutado';
}

module.exports = {
  processWithOllama,
  checkOllamaStatus,
  generateNaturalResponse
};

// =====================================================
// INSTRUCCIONES DE INTEGRACIÓN:
// =====================================================
/*

1. Instalar Ollama en tu sistema:
   - Linux/Mac: curl https://ollama.ai/install.sh | sh
   - Windows: Descargar de https://ollama.ai
   
2. Descargar modelo:
   ollama pull llama3.2
   
3. Agregar al server.js principal:

   const ollama = require('./ollama-integration');
   
   // Ruta para el asistente
   app.post('/api/assistant', async (req, res) => {
     const { message } = req.body;
     
     if (!message) {
       return res.status(400).json({ error: 'Mensaje requerido' });
     }
     
     try {
       // Procesar con Ollama
       const action = await ollama.processWithOllama(message, systemState);
       
       // Ejecutar acción
       let executed = false;
       if (action.action === 'command') {
         executed = sendCommandToDevice('ESP32_GATEWAY_01', action.command);
       } else if (action.action === 'door') {
         executed = sendCommandToDevice('ESP32_GATEWAY_01', action.command);
       }
       
       // Generar respuesta
       const response = ollama.generateNaturalResponse(action, systemState);
       
       res.json({
         success: true,
         action: action.action,
         response,
         executed,
         raw: action
       });
       
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });
   
   // Estado de Ollama
   app.get('/api/assistant/status', async (req, res) => {
     const status = await ollama.checkOllamaStatus();
     res.json(status);
   });

4. Instalar dependencia:
   npm install node-fetch@2

*/