const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const WebSocket = require('ws');


const app = express();
const server = http.createServer(app);

// Socket.IO para clientes web (React)
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// WebSocket raw para ESP32
const wss = new WebSocket.Server({ server, path: '/raw' });

// Middleware
app.use(cors());
app.use(express.json());

// =====================================================
// ESTADO DEL SISTEMA
// =====================================================
const rawWsClients = {};

let systemState = {
  esp32Devices: {},
  lights: {
    exteriores: false,
    salaComedor: false,
    cochera: false,
    cocina: false,
    cuarto: false,
    banio: false,
    pasadizo: false,
    lavanderia: false
  },
  sensors: {
    gas: { level: 0, status: 'normal', lastUpdate: null },
    temperature: { value: 0, status: 'normal', lastUpdate: null },
    motion: { detected: false, lastDetection: null, securityMode: false },
    doorMain: { open: false, lastChange: null },      // ← NUEVO
    doorGarage: { open: false, lastChange: null }     // ← NUEVO
  },
  alerts: [],
  lastUpdate: null,
  history: [],
  autoMode: false,
  schedule: [],
  statistics: {
    totalCommands: 0,
    totalEvents: 0,
    uptime: Date.now()
  }
};

let pendingTranscripts = [];
// =====================================================
// WEBSOCKET RAW PARA ESP32
// =====================================================

wss.on('connection', (ws, req) => {
  console.log('🔌 WebSocket raw conectado (ESP32)');
  let deviceId = null;

  ws.on('message', (msg) => {
    try {
      const text = msg.toString();
      const data = JSON.parse(text);
      
      // Identificación inicial del ESP32
      if (data.type === 'esp32_connected' && data.deviceId) {
        deviceId = data.deviceId;
        rawWsClients[deviceId] = ws;
        
        systemState.esp32Devices[deviceId] = {
          ...(systemState.esp32Devices[deviceId] || {}),
          socketType: 'raw',
          lastSeen: new Date().toISOString(),
          connected: true
        };
        
        console.log(`✅ ESP32 identificado: ${deviceId}`);
        ws.send(JSON.stringify({ type: 'server_ack', ok: true }));
        return;
      }

      // Heartbeat
      if (data.type === 'heartbeat' && data.deviceId) {
        if (systemState.esp32Devices[data.deviceId]) {
          systemState.esp32Devices[data.deviceId].lastSeen = new Date().toISOString();
        }
        return;
      }

      // Mensaje del Arduino
      if (data.message && data.deviceId) {
        processArduinoMessage(data.message, data.deviceId);
      }
      
    } catch (e) {
      // No es JSON, puede ser mensaje directo
      const text = msg.toString();
      const foundId = Object.keys(rawWsClients).find(k => rawWsClients[k] === ws);
      if (foundId && (text.startsWith('SENSORS:') || text.startsWith('ALERT:') || text.startsWith('OK:'))) {
        processArduinoMessage(text, foundId);
      }
    }
  });

  ws.on('close', () => {
    if (deviceId) {
      delete rawWsClients[deviceId];
      console.log(`🔌 ESP32 desconectado: ${deviceId}`);
      if (systemState.esp32Devices[deviceId]) {
        systemState.esp32Devices[deviceId].connected = false;
      }
    }
  });

  ws.on('error', (error) => {
    console.error('Error WebSocket:', error.message);
  });
});

// =====================================================
// FUNCIONES DE PROCESAMIENTO
// =====================================================

function processArduinoMessage(message, deviceId = 'default') {
  console.log(`📨 [${deviceId}] ${message}`);
  
  io.emit('arduino-message', { message, deviceId, timestamp: new Date().toISOString() });
  
  // Procesar OK: (confirmaciones)
  if (message.startsWith('OK:')) {
    const parts = message.split(':');
    if (parts.length >= 3) {
      const zone = parts[1];
      const state = parts[2] === 'ON';
      
      // ← NUEVO: Detectar puertas
      if (zone === 'PUERTA_PRINCIPAL' || zone === 'DOOR_MAIN') {
        systemState.sensors.doorMain.open = state;
        systemState.sensors.doorMain.lastChange = new Date().toISOString();
        io.emit('door-update', { doorType: 'main', ...systemState.sensors.doorMain });
      } else if (zone === 'PUERTA_COCHERA' || zone === 'DOOR_GARAGE') {
        systemState.sensors.doorGarage.open = state;
        systemState.sensors.doorGarage.lastChange = new Date().toISOString();
        io.emit('door-update', { doorType: 'garage', ...systemState.sensors.doorGarage });
      } else {
        updateLightState(zone, state, 'arduino');
      }
    }
  }
  // En el servidor, dentro de processArduinoMessage:
if (message === 'OK:TODAS_ENCENDIDAS') {
  Object.keys(systemState.lights).forEach(key => {
    systemState.lights[key] = true;
  });
  systemState.lastUpdate = new Date().toISOString();
  io.emit('lights-update', systemState.lights);
  console.log('💡 Todas las luces: ON');
}

if (message === 'OK:TODAS_APAGADAS') {
  Object.keys(systemState.lights).forEach(key => {
    systemState.lights[key] = false;
  });
  systemState.lastUpdate = new Date().toISOString();
  io.emit('lights-update', systemState.lights);
  console.log('💡 Todas las luces: OFF');
}
  
  // Procesar SENSORS: (datos de sensores)
   if (message.startsWith('SENSORS:')) {
    const data = message.substring(8).split(',');
    if (data.length >= 5) { // ← Ahora son 5 valores
      const gasLevel = parseInt(data[0]) || 0;
      systemState.sensors.gas.level = gasLevel;
      systemState.sensors.gas.status = 
        gasLevel < 50 ? 'normal' :
        gasLevel < 150 ? 'bajo' :
        gasLevel < 250 ? 'medio' :
        gasLevel < 400 ? 'alto' : 'critico';
      systemState.sensors.gas.lastUpdate = new Date().toISOString();
      
      systemState.sensors.temperature.value = parseFloat(data[1]) || 0;
      systemState.sensors.temperature.status = 
        systemState.sensors.temperature.value >= 25 ? 'alta' : 'normal';
      systemState.sensors.temperature.lastUpdate = new Date().toISOString();
      
      const motionDetected = data[2] === '1';
      if (motionDetected && !systemState.sensors.motion.detected) {
        systemState.sensors.motion.lastDetection = new Date().toISOString();
        
        if (systemState.sensors.motion.securityMode) {
          const alert = {
            type: 'MOVIMIENTO_DETECTADO',
            value: 'Sensor PIR activado',
            timestamp: new Date().toISOString(),
            id: Date.now().toString()
          };
          systemState.alerts.unshift(alert);
          if (systemState.alerts.length > 50) systemState.alerts.pop();
          io.emit('new-alert', alert);
        }
      }
      systemState.sensors.motion.detected = motionDetected;
      
      // ← NUEVO: Dos puertas
      systemState.sensors.doorMain.open = data[3] === '1';
      systemState.sensors.doorGarage.open = data[4] === '1';
      
      io.emit('sensors-update', systemState.sensors);
    }
  }
  
  // Procesar ALERT:
  if (message.startsWith('ALERT:')) {
    const alertData = message.substring(6);
    const [type, ...valueParts] = alertData.split(':');
    const value = valueParts.join(':');
    
    const alert = {
      type,
      value,
      timestamp: new Date().toISOString(),
      id: Date.now().toString()
    };
    
    systemState.alerts.unshift(alert);
    if (systemState.alerts.length > 50) systemState.alerts.pop();
    
    io.emit('new-alert', alert);
    console.log(`🚨 ALERTA: ${type} - ${value}`);
  }
  
  if (message === 'ARDUINO:READY') {
    console.log(`✓ [${deviceId}] Arduino LISTO`);
    io.emit('system-status', { type: 'arduino_ready', deviceId });
  }
  
  addToHistory({
    type: 'arduino_message',
    message,
    deviceId,
    timestamp: new Date().toISOString()
  });
  
  systemState.statistics.totalEvents++;
}

function updateLightState(zoneName, state, source = 'unknown') {
  const zoneMap = {
    'Exteriores': 'exteriores',
    'SalaComedor': 'salaComedor',
    'Cochera': 'cochera',
    'Cocina': 'cocina',
    'Cuarto': 'cuarto',
    'Banio': 'banio',
    'Pasadizo': 'pasadizo',
    'Lavanderia': 'lavanderia'
  };
  
  const key = zoneMap[zoneName] || zoneName;
  
  if (key in systemState.lights) {
    const previousState = systemState.lights[key];
    systemState.lights[key] = state;
    systemState.lastUpdate = new Date().toISOString();
    
    console.log(`💡 ${key}: ${state ? 'ON' : 'OFF'} (${source})`);
    
    io.emit('lights-update', systemState.lights);
    
    addToHistory({
      type: 'light_change',
      zone: key,
      state,
      previousState,
      source,
      timestamp: new Date().toISOString()
    });
  }
}

function addToHistory(event) {
  systemState.history.push(event);
  if (systemState.history.length > 1000) systemState.history.shift();
  io.emit('new-event', event);
}

function sendCommandToDevice(deviceId, command) {
  const ws = rawWsClients[deviceId];
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      const msg = JSON.stringify({ command });
      ws.send(msg);
      console.log(`✅ Enviado a ${deviceId}: ${command}`);
      return true;
    } catch (e) {
      console.log('✖ Error:', e.message);
    }
  } else {
    console.log(`⚠️ ${deviceId} no conectado`);
  }
  return false;
}

// =====================================================
// RUTAS HTTP - ESP32
// =====================================================

app.post('/api/esp32/register', (req, res) => {
  const { deviceId, ip, rssi, arduinoReady, version } = req.body;
  
  const existing = systemState.esp32Devices[deviceId];
  if (existing && existing.lastSeen) {
    const timeSince = Date.now() - new Date(existing.lastSeen).getTime();
    if (timeSince < 5000) {
      systemState.esp32Devices[deviceId] = {
        ...existing, ip, rssi, arduinoReady, version,
        lastSeen: new Date().toISOString(), connected: true
      };
      return res.json({ success: true, message: 'Actualizado' });
    }
  }
  
  console.log(`🔷 ESP32: ${deviceId} | IP: ${ip} | RSSI: ${rssi} dBm`);
  
  systemState.esp32Devices[deviceId] = {
    ip, rssi, arduinoReady, version,
    lastSeen: new Date().toISOString(), connected: true
  };
  
  io.emit('esp32-registered', { deviceId, ...systemState.esp32Devices[deviceId] });
  res.json({ success: true, message: 'Registrado' });
});

app.post('/api/esp32/message', (req, res) => {
  const { deviceId, message } = req.body;
  processArduinoMessage(message, deviceId);
  res.json({ success: true });
});

app.post('/api/esp32/status', (req, res) => {
  const { deviceId, status, ip, rssi, uptime, arduinoReady } = req.body;
  
  if (systemState.esp32Devices[deviceId]) {
    systemState.esp32Devices[deviceId] = {
      ...systemState.esp32Devices[deviceId],
      ip, rssi, uptime, arduinoReady, status,
      lastSeen: new Date().toISOString()
    };
  }
  res.json({ success: true });
});

// =====================================================
// RUTAS HTTP - CONTROL
// =====================================================

app.get('/api/status', (req, res) => {
  res.json({
    esp32Devices: systemState.esp32Devices,
    lights: systemState.lights,
    sensors: systemState.sensors,
    alerts: systemState.alerts.slice(0, 10),
    lastUpdate: systemState.lastUpdate,
    autoMode: systemState.autoMode,
    statistics: {
      ...systemState.statistics,
      uptimeSeconds: Math.floor((Date.now() - systemState.statistics.uptime) / 1000)
    },
    historyCount: systemState.history.length
  });
});

app.post('/api/command', (req, res) => {
  const { command, deviceId = 'ESP32_GATEWAY_01' } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Comando requerido' });
  }
  
  console.log(`📤 Comando ${command} → ${deviceId}`);
  
  const sent = sendCommandToDevice(deviceId, command);
  systemState.statistics.totalCommands++;
  
  addToHistory({
    type: 'command_sent',
    command, deviceId,
    timestamp: new Date().toISOString(),
    source: 'api'
  });
  
  res.json({ success: true, command, sent });
});

app.post('/api/door', (req, res) => {
  const { action, doorType = 'main', deviceId = 'ESP32_GATEWAY_01' } = req.body;
  
  if (action !== 'open' && action !== 'close') {
    return res.status(400).json({ error: 'Acción inválida' });
  }
  
  // Comandos para diferentes puertas
  let command;
  if (doorType === 'main') {
    command = action === 'open' ? 'A' : 'C';  // Puerta principal
  } else if (doorType === 'garage') {
    command = action === 'open' ? 'G' : 'H';  // Puerta cochera (G=open, H=close)
  } else {
    return res.status(400).json({ error: 'Tipo de puerta inválido' });
  }
  
  console.log(`🚪 Puerta ${doorType}: ${action} (comando: ${command})`);
  
  const sent = sendCommandToDevice(deviceId, command);
  
  addToHistory({
    type: 'door_command',
    action,
    doorType,
    deviceId,
    timestamp: new Date().toISOString(),
    source: 'api'
  });
  
  res.json({ success: true, action, doorType, command, sent });
});

app.post('/api/security-mode', (req, res) => {
  const { enabled } = req.body;
  systemState.sensors.motion.securityMode = enabled;
  
  console.log(`🔒 Modo seguridad: ${enabled ? 'ON' : 'OFF'}`);
  io.emit('security-mode-changed', { enabled });
  
  addToHistory({
    type: 'security_mode_change',
    enabled,
    timestamp: new Date().toISOString(),
    source: 'api'
  });
  
  res.json({ success: true, securityMode: enabled });
});

app.get('/api/history', (req, res) => {
  const { limit = 100, type } = req.query;
  let history = systemState.history;
  if (type) history = history.filter(h => h.type === type);
  history = history.slice(-parseInt(limit));
  res.json({ history, total: systemState.history.length });
});

app.delete('/api/history', (req, res) => {
  systemState.history = [];
  res.json({ success: true });
});

app.post('/api/auto-mode', (req, res) => {
  const { enabled } = req.body;
  systemState.autoMode = enabled;
  console.log(`🤖 Auto: ${enabled ? 'ON' : 'OFF'}`);
  io.emit('auto-mode-changed', { enabled });
  res.json({ success: true, autoMode: enabled });
});

app.post('/api/schedule', (req, res) => {
  const { time, command, days, name } = req.body;
  const rule = {
    id: Date.now().toString(),
    time, command,
    days: days || [0,1,2,3,4,5,6],
    name: name || 'Regla',
    enabled: true,
    created: new Date().toISOString()
  };
  systemState.schedule.push(rule);
  io.emit('schedule-updated', systemState.schedule);
  res.json({ success: true, rule });
});

app.get('/api/schedule', (req, res) => {
  res.json({ schedule: systemState.schedule });
});

app.delete('/api/schedule/:id', (req, res) => {
  systemState.schedule = systemState.schedule.filter(r => r.id !== req.params.id);
  io.emit('schedule-updated', systemState.schedule);
  res.json({ success: true });
});

app.get('/api/sensors', (req, res) => {
  res.json({ sensors: systemState.sensors });
});

app.get('/api/alerts', (req, res) => {
  const { limit = 20 } = req.query;
  res.json({ alerts: systemState.alerts.slice(0, parseInt(limit)) });
});

app.delete('/api/alerts', (req, res) => {
  systemState.alerts = [];
  res.json({ success: true });
});

// IA (básico)
app.get('/api/ai/patterns', (req, res) => {
  const hourCounts = {};
  systemState.history.forEach(e => {
    if (e.type === 'light_change' && e.state) {
      const h = new Date(e.timestamp).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    }
  });
  const mostActiveHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, count]) => ({ hour: parseInt(hour), count }));
  res.json({ patterns: { mostActiveHours, totalEvents: systemState.history.length } });
});

app.get('/api/ai/suggestions', (req, res) => {
  const suggestions = [];
  const hour = new Date().getHours();
  
  if (hour >= 18 && hour <= 22 && !systemState.lights.exteriores) {
    suggestions.push({
      id: 'sec_1', type: 'security', priority: 'high',
      message: 'Activar iluminación exterior', command: 1, icon: '🌙'
    });
  }
  
  if (hour >= 23 && Object.values(systemState.lights).some(l => l)) {
    suggestions.push({
      id: 'energy_1', type: 'energy_saving', priority: 'medium',
      message: 'Apagar luces para ahorrar', command: 18, icon: '⚡'
    });
  }
  
  res.json({ suggestions });
});

app.get('/api/ai/predict', (req, res) => {
  res.json({
    prediction: {
      nextLikelyAction: 'Encender exteriores',
      confidence: 0.75,
      reason: 'Patrones históricos',
      timeEstimate: '18:00 - 19:00'
    }
  });
});


// Estado de Ollama
app.get('/api/assistant/status', async (req, res) => {
  const status = await ollama.checkOllamaStatus();
  res.json(status);
});
// =====================================================
// SOCKET.IO - CLIENTES WEB
// =====================================================

io.on('connection', (socket) => {
  console.log('🔌 Cliente web:', socket.id);
  
  socket.emit('lights-update', systemState.lights);
  socket.emit('sensors-update', systemState.sensors);
  socket.emit('esp32-devices', systemState.esp32Devices);
  socket.emit('system-stats', systemState.statistics);
  
  socket.on('send-command', (data) => {
    const { command, deviceId = 'ESP32_GATEWAY_01' } = data;
    console.log(`📤 Web → ${deviceId}: ${command}`);
    sendCommandToDevice(deviceId, command);
    systemState.statistics.totalCommands++;
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente web desconectado');
  });
});

// =====================================================
// PROGRAMACIÓN AUTOMÁTICA
// =====================================================

setInterval(() => {
  if (!systemState.autoMode) return;
  
  const now = new Date();
  const time = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
  const day = now.getDay();
  
  systemState.schedule.forEach(rule => {
    if (rule.enabled && rule.time === time && rule.days.includes(day)) {
      console.log(`⏰ Ejecutando: ${rule.name}`);
      sendCommandToDevice('ESP32_GATEWAY_01', rule.command);
      
      addToHistory({
        type: 'scheduled_command',
        rule: rule.name,
        command: rule.command,
        timestamp: new Date().toISOString(),
        source: 'schedule'
      });
    }
  });
}, 60000);
// =====================================================
// RUTAS HTTP - ASISTENTE OLLAMA
// =====================================================

// Importar módulo Ollama (asegúrate de tener ollama-integration.js en la misma carpeta)
let ollama;
try {
  ollama = require('./ollama-integration');
  console.log('✓ Módulo Ollama cargado');
} catch (error) {
  console.warn('⚠️ No se pudo cargar ollama-integration.js:', error.message);
  console.warn('   El asistente de IA no estará disponible');
}

// Ruta para procesar comandos del asistente
app.post('/api/assistant', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }
  
  if (!ollama) {
    return res.status(503).json({ 
      success: false,
      error: 'Módulo Ollama no disponible',
      response: 'El asistente de IA no está configurado correctamente.'
    });
  }
  
  try {
    console.log(`🤖 Usuario: ${message}`);
    
    // Procesar con Ollama
    const action = await ollama.processWithOllama(message, systemState);
    
    console.log(`🎯 Acción interpretada:`, action);
    
    // Ejecutar acción según el tipo
    let executed = false;
    
    if (action.action === 'command' && action.command !== undefined) {
      executed = sendCommandToDevice('ESP32_GATEWAY_01', action.command);
      systemState.statistics.totalCommands++;
      
      addToHistory({
        type: 'assistant_command',
        message,
        action: action.action,
        command: action.command,
        timestamp: new Date().toISOString(),
        source: 'ollama'
      });
    } else if (action.action === 'door' && action.command) {
      executed = sendCommandToDevice('ESP32_GATEWAY_01', action.command);
      
      addToHistory({
        type: 'assistant_door',
        message,
        action: action.action,
        command: action.command,
        timestamp: new Date().toISOString(),
        source: 'ollama'
      });
    }
    
    // Generar respuesta en lenguaje natural
    const response = ollama.generateNaturalResponse(action, systemState);
    
    res.json({
      success: true,
      action: action.action,
      response,
      executed,
      raw: action
    });
    
  } catch (error) {
    console.error('❌ Error Ollama:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al procesar con IA',
      details: error.message,
      response: '❌ Error al procesar con IA. Verifica que Ollama esté ejecutándose.'
    });
  }
});

// Ruta para verificar estado de Ollama
app.get('/api/assistant/status', async (req, res) => {
  if (!ollama) {
    return res.json({ 
      available: false, 
      error: 'Módulo Ollama no cargado',
      message: 'Asegúrate de crear el archivo ollama-integration.js'
    });
  }
  
  try {
    const status = await ollama.checkOllamaStatus();
    res.json(status);
  } catch (error) {
    res.json({ 
      available: false, 
      error: error.message 
    });
  }
});

// =====================================================
// RUTAS HTTP - VOZ (ESP32)
// =====================================================

// Recibir transcripción del ESP32
app.post('/api/voice/transcript', async (req, res) => {
  const { deviceId, transcript, timestamp } = req.body;
  
  if (!transcript) {
    return res.status(400).json({ error: 'Transcript requerido' });
  }
  
  console.log(`🎤 [${deviceId}] Transcripción: "${transcript}"`);
  
  try {
    // Emitir a clientes web que se está procesando voz
    io.emit('voice-transcript', {
      deviceId,
      transcript,
      timestamp: new Date().toISOString(),
      processing: true
    });
    
    // Procesar con Ollama (igual que texto)
    let action;
    let response;
    
    if (ollama) {
      action = await ollama.processWithOllama(transcript, systemState);
      console.log(`🎯 Acción interpretada:`, action);
      
      // Ejecutar acción
      let executed = false;
      
      if (action.action === 'command' && action.command !== undefined) {
        executed = sendCommandToDevice(deviceId || 'ESP32_GATEWAY_01', action.command);
        systemState.statistics.totalCommands++;
      } else if (action.action === 'door' && action.command) {
        executed = sendCommandToDevice(deviceId || 'ESP32_GATEWAY_01', action.command);
      }
      
      // Generar respuesta
      response = ollama.generateNaturalResponse(action, systemState);
      
      // Registrar en historial
      addToHistory({
        type: 'voice_command',
        deviceId,
        transcript,
        action: action.action,
        command: action.command || action.sensor,
        response,
        timestamp: new Date().toISOString(),
        source: 'esp32_voice'
      });
      
      // Emitir resultado a clientes web
      io.emit('voice-processed', {
        deviceId,
        transcript,
        action: action.action,
        response,
        executed,
        timestamp: new Date().toISOString()
      });
      
      // Enviar respuesta de voz al ESP32 (opcional)
      const ws = rawWsClients[deviceId];
      if (ws && ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify({
          type: 'voice_response',
          response,
          action: action.action
        }));
      }
      
      res.json({
        success: true,
        transcript,
        action: action.action,
        response,
        executed
      });
      
    } else {
      // Sin Ollama, responder con mensaje genérico
      res.json({
        success: true,
        transcript,
        response: 'Comando de voz recibido pero Ollama no está disponible'
      });
    }
    
  } catch (error) {
    console.error('❌ Error procesando voz:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Recibir eventos de voz (wake word, etc)
app.post('/api/voice/event', (req, res) => {
  const { deviceId, event, timestamp } = req.body;
  
  console.log(`🎤 [${deviceId}] Evento de voz: ${event}`);
  
  // Emitir a clientes web
  io.emit('voice-event', {
    deviceId,
    event,
    timestamp: new Date().toISOString()
  });
  
  // Si es wake word, notificar especialmente
  if (event === 'wake_word_detected') {
    io.emit('wake-word-detected', {
      deviceId,
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({ success: true });
});

// Endpoint para subir audio raw y procesarlo con STT
// (Para implementación futura con Whisper o similar)
app.post('/api/voice/stt', async (req, res) => {
  // Este endpoint recibiría audio raw del ESP32
  // y lo procesaría con un servicio STT
  
  // Ejemplo con Whisper local:
  // const audioBuffer = req.body;
  // const transcript = await processWithWhisper(audioBuffer);
  
  res.status(501).json({
    error: 'STT no implementado aún',
    message: 'Por ahora, envía el texto transcrito directamente'
  });
});
// =====================================================
// ENDPOINT: Transcripción desde Drive/Colab → Chat directo
// =====================================================

app.post('/api/voice/transcript-drive', async (req, res) => {
  const { deviceId, transcript, source } = req.body;
  
  if (!transcript) {
    return res.status(400).json({ error: 'Transcript requerido' });
  }
  
  console.log(`\n📝 Transcripción desde ${source || 'Drive'}`);
  console.log(`   Device: ${deviceId}`);
  console.log(`   Texto: "${transcript}"`);
  
  try {
    // NO procesar con Ollama aquí, solo reenviar a clientes web
    // El React recibirá esto y lo procesará con su propio flujo
    
    // Emitir a TODOS los clientes web conectados
    io.emit('voice-transcript-received', {
      deviceId: deviceId || 'ESP32_GATEWAY_01',
      transcript,
      timestamp: new Date().toISOString(),
      source: source || 'google_drive'
    });
    
    console.log('✅ Transcripción reenviada a clientes web');
    
    // Registrar en historial (opcional)
    addToHistory({
      type: 'voice_transcript',
      deviceId,
      transcript,
      timestamp: new Date().toISOString(),
      source: source || 'google_drive'
    });
    
    res.json({
      success: true,
      transcript,
      message: 'Transcripción enviada a clientes web'
    });
    
  } catch (error) {
    console.error('❌ Error procesando transcripción:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// ENDPOINT: Recibir transcripción y encolarla
// =====================================================

app.post('/api/voice/transcript-drive', async (req, res) => {
  const { deviceId, transcript, source } = req.body;
  
  if (!transcript) {
    return res.status(400).json({ error: 'Transcript requerido' });
  }
  
  console.log(`\n📝 Transcripción desde ${source || 'Drive'}`);
  console.log(`   Device: ${deviceId}`);
  console.log(`   Texto: "${transcript}"`);
  
  try {
    // Agregar a cola de pendientes
    const transcriptData = {
      deviceId: deviceId || 'ESP32_GATEWAY_01',
      transcript,
      timestamp: new Date().toISOString(),
      source: source || 'google_drive',
      id: Date.now().toString()
    };
    
    pendingTranscripts.push(transcriptData);
    
    // Limitar tamaño de cola
    if (pendingTranscripts.length > 20) {
      pendingTranscripts.shift();
    }
    
    console.log(`✅ Transcripción encolada (${pendingTranscripts.length} pendientes)`);
    
    // También emitir por Socket.IO si hay clientes conectados
    io.emit('voice-transcript-received', transcriptData);
    
    // Registrar en historial
    addToHistory({
      type: 'voice_transcript',
      deviceId: transcriptData.deviceId,
      transcript,
      timestamp: transcriptData.timestamp,
      source: transcriptData.source
    });
    
    res.json({
      success: true,
      transcript,
      message: 'Transcripción encolada'
    });
    
  } catch (error) {
    console.error('❌ Error procesando transcripción:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// ENDPOINT: Obtener transcripciones pendientes (polling)
// =====================================================

app.get('/api/voice/pending-transcripts', (req, res) => {
  // Devolver todas las transcripciones pendientes
  const transcripts = [...pendingTranscripts];
  
  // Limpiar cola después de enviar
  pendingTranscripts = [];
  
  res.json({
    transcripts,
    count: transcripts.length
  });
});

// =====================================================
// ENDPOINT: Recibir transcripción del ESP32 directo
// =====================================================

app.post('/api/voice/transcript', async (req, res) => {
  const { deviceId, transcript, timestamp } = req.body;
  
  if (!transcript) {
    return res.status(400).json({ error: 'Transcript requerido' });
  }
  
  console.log(`🎤 [${deviceId}] Transcripción: "${transcript}"`);
  
  try {
    // Encolar igual que Drive
    const transcriptData = {
      deviceId: deviceId || 'ESP32_GATEWAY_01',
      transcript,
      timestamp: new Date().toISOString(),
      source: 'esp32_direct',
      id: Date.now().toString()
    };
    
    pendingTranscripts.push(transcriptData);
    
    if (pendingTranscripts.length > 20) {
      pendingTranscripts.shift();
    }
    
    console.log(`✅ Transcripción encolada`);
    
    // Emitir por Socket.IO
    io.emit('voice-transcript-received', transcriptData);
    
    res.json({
      success: true,
      transcript,
      message: 'Transcripción encolada'
    });
    
  } catch (error) {
    console.error('❌ Error procesando voz:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// =====================================================
// ENDPOINT: Transcripción desde Drive/Colab
// =====================================================

app.post('/api/voice/transcript-drive', async (req, res) => {
  const { deviceId, transcript, source } = req.body;
  
  if (!transcript) {
    return res.status(400).json({ error: 'Transcript requerido' });
  }
  
  console.log(`\n📝 Transcripción desde ${source || 'Drive'}`);
  console.log(`   Device: ${deviceId}`);
  console.log(`   Texto: "${transcript}"`);
  
  try {
    // Procesar con Ollama
    if (!ollama) {
      return res.json({
        success: true,
        transcript,
        message: 'Transcripción recibida pero Ollama no disponible'
      });
    }
    
    const action = await ollama.processWithOllama(transcript, systemState);
    console.log(`🎯 Acción: ${action.action}`);
    
    // Ejecutar comando
    let executed = false;
    
    if (action.action === 'command' && action.command !== undefined) {
      executed = sendCommandToDevice(deviceId, action.command);
      systemState.statistics.totalCommands++;
    } else if (action.action === 'door' && action.command) {
      executed = sendCommandToDevice(deviceId, action.command);
    }
    
    // Generar respuesta
    const response = ollama.generateNaturalResponse(action, systemState);
    
    // Registrar en historial
    addToHistory({
      type: 'voice_drive_command',
      deviceId,
      transcript,
      action: action.action,
      command: action.command,
      response,
      timestamp: new Date().toISOString(),
      source: source || 'google_drive'
    });
    
    // Emitir a clientes web
    io.emit('voice-drive-processed', {
      deviceId,
      transcript,
      action: action.action,
      response,
      executed,
      timestamp: new Date().toISOString()
    });
    
    // Enviar respuesta al ESP32 (si está conectado por WebSocket)
    const ws = rawWsClients[deviceId];
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'drive_stt_response',
        transcript,
        response,
        action: action.action,
        executed
      }));
    }
    
    res.json({
      success: true,
      transcript,
      action: action.action,
      response,
      executed
    });
    
  } catch (error) {
    console.error('❌ Error procesando transcripción:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// =====================================================
// EVENTOS SOCKET.IO - VOZ
// =====================================================

// Agregar al bloque io.on('connection', ...) existente:

io.on('connection', (socket) => {
  // ... código existente ...
  
  // Escuchar cuando el usuario hace click en "activar voz" desde web
  socket.on('activate-voice-listening', (data) => {
    const { deviceId = 'ESP32_GATEWAY_01' } = data;
    console.log(`🎤 Activar escucha de voz en ${deviceId}`);
    
    // Enviar comando al ESP32 para forzar activación
    const ws = rawWsClients[deviceId];
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'activate_listening'
      }));
    }
  }); });
// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SERVIDOR SMART HOME V3');
  console.log('='.repeat(60));
  console.log(`📡 HTTP: http://0.0.0.0:${PORT}`);
  console.log(`🔌 Socket.IO: ws://0.0.0.0:${PORT}`);
  console.log(`🌐 WebSocket raw: ws://0.0.0.0:${PORT}/raw`);
  console.log('='.repeat(60) + '\n');
});

process.on('SIGINT', () => {
  console.log('\n⚠️ Cerrando...');
  process.exit();
});