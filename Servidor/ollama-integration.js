// =====================================================
// OLLAMA INTEGRATION MODULE - CON 2 PUERTAS
// =====================================================

let fetch;
try {
  fetch = globalThis.fetch;
} catch (e) {
  fetch = require('node-fetch');
}

// Configuración Ollama
const OLLAMA_URL = process.env.OLLAMA_URL || 'https://unwainscotted-nonconsequentially-willene.ngrok-free.dev';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

// =====================================================
// CONTEXTO ACTUALIZADO CON 2 PUERTAS
// =====================================================

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
- Puertas:
  * Puerta Principal: ABRIR=A, CERRAR=C
  * Puerta Cochera: ABRIR=G, CERRAR=H

SENSORES DISPONIBLES:
- gas: nivel de gas (MQ-6)
- temperature: temperatura en °C
- motion: detección de movimiento (PIR)
- doorMain: estado puerta principal (abierta/cerrada)
- doorGarage: estado puerta cochera (abierta/cerrada)

REGLAS CRÍTICAS:
1. Responde SOLO con un JSON válido, sin texto adicional
2. Si el usuario pide encender/apagar luces, devuelve: {"action": "command", "command": NÚMERO}
3. Si pide información de sensores, devuelve: {"action": "query", "sensor": "NOMBRE_SENSOR"}
4. Si pide abrir/cerrar puerta, devuelve: {"action": "door", "command": "LETRA", "doorType": "main" o "garage"}
5. Si es conversación general, devuelve: {"action": "chat", "response": "tu respuesta"}
6. NUNCA incluyas explicaciones fuera del JSON

EJEMPLOS:
Usuario: "enciende las luces de la sala"
Respuesta: {"action": "command", "command": 3}

Usuario: "apaga todo"
Respuesta: {"action": "command", "command": 18}

Usuario: "¿cuál es la temperatura?"
Respuesta: {"action": "query", "sensor": "temperature"}

Usuario: "abre la puerta principal"
Respuesta: {"action": "door", "command": "A", "doorType": "main"}

Usuario: "cierra la puerta de la cochera"
Respuesta: {"action": "door", "command": "H", "doorType": "garage"}

Usuario: "abre la cochera"
Respuesta: {"action": "door", "command": "G", "doorType": "garage"}

Usuario: "hola"
Respuesta: {"action": "chat", "response": "¡Hola! ¿Qué necesitas?"}`;

// =====================================================
// FUNCIÓN PRINCIPAL: Procesar comando con Ollama
// =====================================================

async function processWithOllama(userMessage, systemState) {
  try {
    // ← ACTUALIZADO: Contexto con 2 puertas
    const contextMessage = `Estado actual del sistema:
- Luces encendidas: ${Object.entries(systemState.lights).filter(([k,v]) => v).map(([k]) => k).join(', ') || 'ninguna'}
- Temperatura: ${systemState.sensors.temperature.value}°C
- Gas: nivel ${systemState.sensors.gas.level} (${systemState.sensors.gas.status})
- Movimiento: ${systemState.sensors.motion.detected ? 'SÍ' : 'NO'}
- Puerta Principal: ${systemState.sensors.doorMain?.open ? 'ABIERTA' : 'CERRADA'}
- Puerta Cochera: ${systemState.sensors.doorGarage?.open ? 'ABIERTA' : 'CERRADA'}

Usuario: ${userMessage}`;

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'SmartHome/1.0'
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

    let parsedResponse;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.warn('⚠️ Ollama no devolvió JSON válido');
      parsedResponse = fallbackParser(userMessage, rawResponse);
    }

    return parsedResponse;

  } catch (error) {
    console.error('❌ Error Ollama:', error.message);
    return fallbackParser(userMessage, '');
  }
}

// =====================================================
// PARSER DE FALLBACK - ACTUALIZADO CON 2 PUERTAS
// =====================================================

function fallbackParser(message, aiResponse) {
  const msg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  console.log(`🔍 Fallback parser: "${msg}"`);
  
  // Detectar encender/prender/activar
  if (msg.match(/encien|prend|activ/)) {
    if (msg.includes('todo') || msg.includes('todas')) return { action: 'command', command: 17 };
    if (msg.includes('exterior')) return { action: 'command', command: 1 };
    if (msg.includes('sala') || msg.includes('comedor')) return { action: 'command', command: 3 };
    if (msg.includes('cochera') || msg.includes('garage')) return { action: 'command', command: 5 };
    if (msg.includes('cocina')) return { action: 'command', command: 7 };
    if (msg.includes('cuarto') || msg.includes('dormitorio')) return { action: 'command', command: 9 };
    if (msg.includes('bano') || msg.includes('banio')) return { action: 'command', command: 11 };
    if (msg.includes('pasadizo') || msg.includes('pasillo')) return { action: 'command', command: 13 };
    if (msg.includes('lavanderia')) return { action: 'command', command: 15 };
  }
  
  // Detectar apagar/desactivar
  if (msg.match(/apag|desactiv|desconect/)) {
    if (msg.includes('todo') || msg.includes('todas')) return { action: 'command', command: 18 };
    if (msg.includes('exterior')) return { action: 'command', command: 2 };
    if (msg.includes('sala') || msg.includes('comedor')) return { action: 'command', command: 4 };
    if (msg.includes('cochera') || msg.includes('garage')) return { action: 'command', command: 6 };
    if (msg.includes('cocina')) return { action: 'command', command: 8 };
    if (msg.includes('cuarto') || msg.includes('dormitorio')) return { action: 'command', command: 10 };
    if (msg.includes('bano') || msg.includes('banio')) return { action: 'command', command: 12 };
    if (msg.includes('pasadizo') || msg.includes('pasillo')) return { action: 'command', command: 14 };
    if (msg.includes('lavanderia')) return { action: 'command', command: 16 };
  }
  
  // =====================================================
  // NUEVO: DETECTAR PUERTAS (2 PUERTAS)
  // =====================================================
  
  // Abrir puertas
  if (msg.match(/abr/)) {
    // Puerta Principal
    if (msg.match(/principal|entrada|casa|frente/)) {
      console.log('✓ Detectado: Abrir puerta principal');
      return { action: 'door', command: 'A', doorType: 'main' };
    }
    // Puerta Cochera
    if (msg.match(/cochera|garage|garaje|coche|auto/)) {
      console.log('✓ Detectado: Abrir puerta cochera');
      return { action: 'door', command: 'G', doorType: 'garage' };
    }
    // Si solo dice "abre la puerta", asumir principal
    if (msg.match(/puerta/)) {
      console.log('✓ Detectado: Abrir puerta (asumiendo principal)');
      return { action: 'door', command: 'A', doorType: 'main' };
    }
  }
  
  // Cerrar puertas
  if (msg.match(/cerr/)) {
    // Puerta Principal
    if (msg.match(/principal|entrada|casa|frente/)) {
      console.log('✓ Detectado: Cerrar puerta principal');
      return { action: 'door', command: 'C', doorType: 'main' };
    }
    // Puerta Cochera
    if (msg.match(/cochera|garage|garaje|coche|auto/)) {
      console.log('✓ Detectado: Cerrar puerta cochera');
      return { action: 'door', command: 'H', doorType: 'garage' };
    }
    // Si solo dice "cierra la puerta", asumir principal
    if (msg.match(/puerta/)) {
      console.log('✓ Detectado: Cerrar puerta (asumiendo principal)');
      return { action: 'door', command: 'C', doorType: 'main' };
    }
  }
  
  // =====================================================
  // DETECTAR CONSULTAS DE SENSORES
  // =====================================================
  
  if (msg.match(/temperatura|grados|calor|frio/)) {
    return { action: 'query', sensor: 'temperature' };
  }
  if (msg.match(/gas|fuga|huele/)) {
    return { action: 'query', sensor: 'gas' };
  }
  if (msg.match(/movimiento|alguien|persona/)) {
    return { action: 'query', sensor: 'motion' };
  }
  
  // Consultas de puertas
  if (msg.match(/puerta.*(principal|entrada).*abierta|principal.*abierta/)) {
    return { action: 'query', sensor: 'doorMain' };
  }
  if (msg.match(/puerta.*(cochera|garage).*abierta|cochera.*abierta/)) {
    return { action: 'query', sensor: 'doorGarage' };
  }
  if (msg.match(/puerta.*abierta|estado.*puerta/)) {
    return { action: 'query', sensor: 'doorMain' }; // Por defecto principal
  }
  
  // Si no se detecta nada, chat
  console.log('✓ Ninguna acción detectada, modo chat');
  return {
    action: 'chat',
    response: aiResponse || 'No entendí tu solicitud. Intenta: "enciende las luces de la sala", "abre la puerta principal" o "¿cuál es la temperatura?"'
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
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'SmartHome/1.0'
      },
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ollama disponible. Modelos:', data.models.map(m => m.name).join(', '));
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
// GENERAR RESPUESTA - ACTUALIZADO CON 2 PUERTAS
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
    // ← ACTUALIZADO: Respuestas para 2 puertas
    door: {
      A: '🏠 Abriendo puerta principal...',
      C: '🏠 Cerrando puerta principal...',
      G: '🚗 Abriendo puerta cochera...',
      H: '🚗 Cerrando puerta cochera...'
    },
    query: {
      temperature: `🌡️ La temperatura actual es ${systemState.sensors.temperature.value.toFixed(1)}°C`,
      gas: `💨 Nivel de gas: ${systemState.sensors.gas.level} (${systemState.sensors.gas.status})`,
      motion: `👁️ Movimiento: ${systemState.sensors.motion.detected ? 'Detectado' : 'No detectado'}`,
      doorMain: `🏠 Puerta Principal: ${systemState.sensors.doorMain?.open ? 'Abierta' : 'Cerrada'}`,
      doorGarage: `🚗 Puerta Cochera: ${systemState.sensors.doorGarage?.open ? 'Abierta' : 'Cerrada'}`
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