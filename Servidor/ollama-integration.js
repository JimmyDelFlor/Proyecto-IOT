// =====================================================
// OLLAMA INTEGRATION MODULE - FIXED VERSION
// =====================================================

// Usar fetch nativo en Node 18+ o require para versiones anteriores
let fetch;
try {
  // Node 18+ tiene fetch nativo
  fetch = globalThis.fetch;
} catch (e) {
  // Node < 18 necesita node-fetch
  fetch = require('node-fetch');
}

// Configuración Ollama
const OLLAMA_URL = process.env.OLLAMA_URL || 'https://unwainscotted-nonconsequentially-willene.ngrok-free.dev';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

// Contexto del sistema para Ollama
const SYSTEM_CONTEXT = `Eres un asistente virtual de una casa inteligente IoT. Tu trabajo es interpretar comandos en lenguaje natural y convertirlos en acciones específicas.

COMANDOS DISPONIBLES:
- Luces individuales (números impares encienden, pares apagan):
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

REGLAS CRÍTICAS:
1. Responde SOLO con un JSON válido, sin texto adicional
2. Si el usuario pide encender/apagar luces, devuelve: {"action": "command", "command": NÚMERO}
3. Si pide información de sensores, devuelve: {"action": "query", "sensor": "NOMBRE_SENSOR"}
4. Si pide abrir/cerrar puerta, devuelve: {"action": "door", "command": "A" o "C"}
5. Si es conversación general, devuelve: {"action": "chat", "response": "tu respuesta"}
6. NUNCA incluyas explicaciones fuera del JSON

EJEMPLOS:
Usuario: "enciende las luces de la sala"
Respuesta: {"action": "command", "command": 3}

Usuario: "apaga todo"
Respuesta: {"action": "command", "command": 18}

Usuario: "¿cuál es la temperatura?"
Respuesta: {"action": "query", "sensor": "temperature"}

Usuario: "abre la puerta"
Respuesta: {"action": "door", "command": "A"}

Usuario: "hola"
Respuesta: {"action": "chat", "response": "¡Hola! ¿Qué necesitas?"}`;

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
- Movimiento: ${systemState.sensors.motion.detected ? 'SÍ' : 'NO'}
- Puerta: ${systemState.sensors.door.open ? 'ABIERTA' : 'CERRADA'}

Usuario: ${userMessage}`;

   const response = await fetch(`${OLLAMA_URL}/api/generate`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',  // ← AGREGAR ESTO
    'User-Agent': 'SmartHome/1.0'          // ← Y ESTO
  },
  body: JSON.stringify({
    model: MODEL,
    prompt: contextMessage,
    system: SYSTEM_CONTEXT,
    stream: false,
    temperature: 0.2,
    options: {
      num_predict: 100
    }
  })
});

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawResponse = data.response.trim();

    console.log('🤖 Ollama raw:', rawResponse);

    // Intentar parsear JSON
    let parsedResponse;
    try {
      // Buscar JSON en la respuesta
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.warn('⚠️ Ollama no devolvió JSON válido');
      
      // Fallback: interpretar manualmente
      parsedResponse = fallbackParser(userMessage, rawResponse);
    }

    return parsedResponse;

  } catch (error) {
    console.error('❌ Error Ollama:', error.message);
    
    // Fallback si Ollama falla
    return fallbackParser(userMessage, '');
  }
}

// =====================================================
// PARSER DE FALLBACK (sin Ollama)
// =====================================================

function fallbackParser(message, aiResponse) {
  const msg = message.toLowerCase();
  
  // Detectar encender/prender/activar
  if (msg.match(/encien|prend|activ/)) {
    if (msg.includes('todo') || msg.includes('todas')) return { action: 'command', command: 17 };
    if (msg.includes('exterior')) return { action: 'command', command: 1 };
    if (msg.includes('sala') || msg.includes('comedor')) return { action: 'command', command: 3 };
    if (msg.includes('cochera') || msg.includes('garage')) return { action: 'command', command: 5 };
    if (msg.includes('cocina')) return { action: 'command', command: 7 };
    if (msg.includes('cuarto') || msg.includes('dormitorio')) return { action: 'command', command: 9 };
    if (msg.includes('baño') || msg.includes('banio')) return { action: 'command', command: 11 };
    if (msg.includes('pasadizo') || msg.includes('pasillo')) return { action: 'command', command: 13 };
    if (msg.includes('lavanderia') || msg.includes('lavandería')) return { action: 'command', command: 15 };
  }
  
  // Detectar apagar/desactivar
  if (msg.match(/apag|desactiv|desconect/)) {
    if (msg.includes('todo') || msg.includes('todas')) return { action: 'command', command: 18 };
    if (msg.includes('exterior')) return { action: 'command', command: 2 };
    if (msg.includes('sala') || msg.includes('comedor')) return { action: 'command', command: 4 };
    if (msg.includes('cochera') || msg.includes('garage')) return { action: 'command', command: 6 };
    if (msg.includes('cocina')) return { action: 'command', command: 8 };
    if (msg.includes('cuarto') || msg.includes('dormitorio')) return { action: 'command', command: 10 };
    if (msg.includes('baño') || msg.includes('banio')) return { action: 'command', command: 12 };
    if (msg.includes('pasadizo') || msg.includes('pasillo')) return { action: 'command', command: 14 };
    if (msg.includes('lavanderia') || msg.includes('lavandería')) return { action: 'command', command: 16 };
  }
  
  // Detectar puerta
  if (msg.includes('abre') || msg.includes('abrir')) {
    if (msg.includes('puerta')) return { action: 'door', command: 'A' };
  }
  if (msg.includes('cierra') || msg.includes('cerrar')) {
    if (msg.includes('puerta')) return { action: 'door', command: 'C' };
  }
  
  // Detectar consultas de sensores
  if (msg.match(/temperatura|cuántos grados|qué temperatura/)) {
    return { action: 'query', sensor: 'temperature' };
  }
  if (msg.match(/gas|fuga|huele/)) {
    return { action: 'query', sensor: 'gas' };
  }
  if (msg.match(/movimiento|alguien|persona/)) {
    return { action: 'query', sensor: 'motion' };
  }
  if (msg.match(/puerta.*abierta|puerta.*cerrada|estado.*puerta/)) {
    return { action: 'query', sensor: 'door' };
  }
  
  // Si no se detecta nada, chat
  return {
    action: 'chat',
    response: aiResponse || 'No entendí tu solicitud. Intenta: "enciende las luces de la sala" o "¿cuál es la temperatura?"'
  };
}

// =====================================================
// FUNCIÓN: Verificar disponibilidad de Ollama
// =====================================================

async function checkOllamaStatus() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': 'true',  // ← AGREGAR
        'User-Agent': 'SmartHome/1.0'          // ← AGREGAR
      },
      signal: AbortSignal.timeout(5000) // Aumentar timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        models: data.models.map(m => m.name),
        url: OLLAMA_URL,
        model: MODEL
      };
    }
    return { available: false, status: response.status };
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