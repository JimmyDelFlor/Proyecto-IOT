const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Para servir archivos estáticos si es necesario

// =====================================================
// ESTADO DEL SISTEMA
// =====================================================
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
    door: { open: false, lastChange: null }
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

// =====================================================
// FUNCIONES DE PROCESAMIENTO
// =====================================================

function processArduinoMessage(message, deviceId = 'default') {
  console.log(`📨 [${deviceId}] Arduino:`, message);
  
  // Broadcast a todos los clientes web
  io.emit('arduino-message', { message, deviceId, timestamp: new Date().toISOString() });
  
  // Procesar diferentes tipos de mensajes
  if (message.startsWith('OK:')) {
    const parts = message.split(':');
    if (parts.length >= 3) {
      const zone = parts[1];
      const state = parts[2] === 'ON';
      
      if (zone === 'PUERTA') {
        systemState.sensors.door.open = state;
        systemState.sensors.door.lastChange = new Date().toISOString();
        io.emit('door-update', systemState.sensors.door);
      } else {
        updateLightState(zone, state, 'arduino');
      }
    }
  }
  
  // Datos de sensores: SENSORS:gas,temp,pir,puerta
  if (message.startsWith('SENSORS:')) {
    const data = message.substring(8).split(',');
    if (data.length >= 4) {
      // Gas
      const gasLevel = parseInt(data[0]);
      systemState.sensors.gas.level = gasLevel;
      systemState.sensors.gas.status = 
        gasLevel < 50 ? 'normal' :
        gasLevel < 150 ? 'bajo' :
        gasLevel < 250 ? 'medio' :
        gasLevel < 400 ? 'alto' : 'critico';
      systemState.sensors.gas.lastUpdate = new Date().toISOString();
      
      // Temperatura
      systemState.sensors.temperature.value = parseFloat(data[1]);
      systemState.sensors.temperature.status = 
        systemState.sensors.temperature.value >= 25 ? 'alta' : 'normal';
      systemState.sensors.temperature.lastUpdate = new Date().toISOString();
      
      // PIR (Movimiento)
      const motionDetected = data[2] === '1';
      if (motionDetected && !systemState.sensors.motion.detected) {
        systemState.sensors.motion.lastDetection = new Date().toISOString();
      }
      systemState.sensors.motion.detected = motionDetected;
      
      // Puerta
      systemState.sensors.door.open = data[3] === '1';
      
      // Emitir actualización de sensores
      io.emit('sensors-update', systemState.sensors);
    }
  }
  
  // Alertas
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
    console.log(`✓ [${deviceId}] Arduino está listo`);
    io.emit('system-status', { type: 'arduino_ready', deviceId });
  }
  
  // Agregar al historial
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
    
    console.log(`💡 ${key}: ${previousState ? 'ON' : 'OFF'} → ${state ? 'ON' : 'OFF'} (${source})`);
    
    // Emitir actualización de luces
    io.emit('lights-update', systemState.lights);
    
    // Agregar al historial
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
  
  // Mantener solo últimos 1000 eventos
  if (systemState.history.length > 1000) {
    systemState.history.shift();
  }
  
  // Emitir nuevo evento
  io.emit('new-event', event);
}

// =====================================================
// RUTAS HTTP API - ESP32
// =====================================================

// Registro de ESP32
app.post('/api/esp32/register', (req, res) => {
  const { deviceId, ip, rssi, arduinoReady } = req.body;
  
  console.log(`\n🔷 ESP32 REGISTRADO: ${deviceId}`);
  console.log(`   IP: ${ip} | RSSI: ${rssi} dBm | Arduino: ${arduinoReady ? 'Ready' : 'Not Ready'}`);
  
  systemState.esp32Devices[deviceId] = {
    ip,
    rssi,
    arduinoReady,
    lastSeen: new Date().toISOString(),
    connected: true
  };
  
  io.emit('esp32-registered', { deviceId, ...systemState.esp32Devices[deviceId] });
  
  res.json({ success: true, message: 'ESP32 registrado correctamente' });
});

// Mensaje desde ESP32
app.post('/api/esp32/message', (req, res) => {
  const { deviceId, message } = req.body;
  
  processArduinoMessage(message, deviceId);
  
  res.json({ success: true });
});

// Estado del ESP32
app.post('/api/esp32/status', (req, res) => {
  const { deviceId, status, ip, rssi, uptime, arduinoReady } = req.body;
  
  if (systemState.esp32Devices[deviceId]) {
    systemState.esp32Devices[deviceId] = {
      ...systemState.esp32Devices[deviceId],
      ip,
      rssi,
      uptime,
      arduinoReady,
      status,
      lastSeen: new Date().toISOString()
    };
  }
  
  res.json({ success: true });
});

// =====================================================
// RUTAS HTTP API - CONTROL
// =====================================================

// Estado del sistema completo
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

// Enviar comando
app.post('/api/command', async (req, res) => {
  const { command, deviceId = 'ESP32_GATEWAY_01' } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Campo command requerido' });
  }
  
  console.log(`📤 Enviando comando ${command} al dispositivo ${deviceId}`);
  
  // Emitir comando por Socket.IO al ESP32 conectado
io.emit('esp32-command', { command, deviceId });   // para el panel web
io.emit('message', JSON.stringify({ command }));   // para el ESP32

  
  systemState.statistics.totalCommands++;
  
  // Registrar en historial
  addToHistory({
    type: 'command_sent',
    command,
    deviceId,
    timestamp: new Date().toISOString(),
    source: 'api'
  });
  
  res.json({ success: true, command, deviceId });
});

// Historial
app.get('/api/history', (req, res) => {
  const { limit = 100, type } = req.query;
  
  let history = systemState.history;
  
  if (type) {
    history = history.filter(h => h.type === type);
  }
  
  history = history.slice(-parseInt(limit));
  
  res.json({ history, total: systemState.history.length });
});

// Limpiar historial
app.delete('/api/history', (req, res) => {
  systemState.history = [];
  res.json({ success: true, message: 'Historial limpiado' });
});

// =====================================================
// SISTEMA DE AUTOMATIZACIÓN
// =====================================================

// Modo automático
app.post('/api/auto-mode', (req, res) => {
  const { enabled } = req.body;
  systemState.autoMode = enabled;
  
  console.log(`🤖 Modo automático: ${enabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
  
  io.emit('auto-mode-changed', { enabled });
  
  res.json({ success: true, autoMode: systemState.autoMode });
});

// Programación
app.post('/api/schedule', (req, res) => {
  const { time, command, days, name } = req.body;
  
  const rule = {
    id: Date.now().toString(),
    time,
    command,
    days: days || [0,1,2,3,4,5,6],
    name: name || 'Regla sin nombre',
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
  const { id } = req.params;
  systemState.schedule = systemState.schedule.filter(r => r.id !== id);
  
  io.emit('schedule-updated', systemState.schedule);
  
  res.json({ success: true });
});

// Obtener sensores
app.get('/api/sensors', (req, res) => {
  res.json({ sensors: systemState.sensors });
});

// Obtener alertas
app.get('/api/alerts', (req, res) => {
  const { limit = 20 } = req.query;
  res.json({ alerts: systemState.alerts.slice(0, parseInt(limit)) });
});

// Limpiar alertas
app.delete('/api/alerts', (req, res) => {
  systemState.alerts = [];
  res.json({ success: true });
});

// Control de puerta
app.post('/api/door', (req, res) => {
  const { action, deviceId = 'ESP32_GATEWAY_01' } = req.body;
  
  if (action !== 'open' && action !== 'close') {
    return res.status(400).json({ error: 'Acción inválida. Use "open" o "close"' });
  }
  
  const command = action === 'open' ? 'A' : 'C';
  
  console.log(`🚪 ${action === 'open' ? 'Abriendo' : 'Cerrando'} puerta`);
  
  io.emit('esp32-command', { command, deviceId });   // para el panel web
io.emit('message', JSON.stringify({ command }));   // para el ESP32

  
  addToHistory({
    type: 'door_command',
    action,
    deviceId,
    timestamp: new Date().toISOString(),
    source: 'api'
  });
  
  res.json({ success: true, action, command });
});

// =====================================================
// INTELIGENCIA ARTIFICIAL - PREPARADO
// =====================================================

app.get('/api/ai/patterns', (req, res) => {
  const patterns = analyzePatterns(systemState.history);
  res.json({ patterns });
});

app.get('/api/ai/suggestions', (req, res) => {
  const suggestions = generateSuggestions(systemState);
  res.json({ suggestions });
});

app.get('/api/ai/predict', (req, res) => {
  const prediction = predictUsage(systemState.history);
  res.json({ prediction });
});

// =====================================================
// FUNCIONES IA (BÁSICAS - EXPANDIR DESPUÉS)
// =====================================================

function analyzePatterns(history) {
  const hourCounts = {};
  const zoneCounts = {};
  
  history.forEach(event => {
    if (event.type === 'light_change' && event.state === true) {
      const hour = new Date(event.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      zoneCounts[event.zone] = (zoneCounts[event.zone] || 0) + 1;
    }
  });
  
  return {
    mostActiveHours: Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({ hour: parseInt(hour), count })),
    mostUsedZones: Object.entries(zoneCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([zone, count]) => ({ zone, count })),
    totalEvents: history.length
  };
}

function generateSuggestions(state) {
  const suggestions = [];
  const now = new Date();
  const hour = now.getHours();
  
  if (hour >= 18 && hour <= 22 && !state.lights.exteriores) {
    suggestions.push({
      id: 'sec_1',
      type: 'security',
      priority: 'high',
      message: 'Hora de activar iluminación exterior',
      command: 1,
      icon: '🌙'
    });
  }
  
  if (hour >= 23 && Object.values(state.lights).some(l => l)) {
    suggestions.push({
      id: 'energy_1',
      type: 'energy_saving',
      priority: 'medium',
      message: 'Considera apagar luces para ahorrar energía',
      command: 18,
      icon: '⚡'
    });
  }
  
  if (hour >= 6 && hour <= 8 && !state.lights.cocina) {
    suggestions.push({
      id: 'routine_1',
      type: 'routine',
      priority: 'low',
      message: 'Hora del desayuno - iluminar cocina',
      command: 7,
      icon: '☕'
    });
  }
  
  return suggestions;
}

function predictUsage(history) {
  return {
    nextLikelyAction: 'Encender luces exteriores',
    confidence: 0.75,
    reason: 'Basado en patrones históricos',
    timeEstimate: '18:00 - 19:00'
  };
}

// =====================================================
// VERIFICADOR DE PROGRAMACIÓN
// =====================================================
setInterval(() => {
  if (!systemState.autoMode) return;
  
  const now = new Date();
  const currentTime = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
  const currentDay = now.getDay();
  
  systemState.schedule.forEach(async (rule) => {
    if (rule.enabled && rule.time === currentTime && rule.days.includes(currentDay)) {
      console.log(`⏰ Ejecutando: ${rule.name}`);
      
      io.emit('esp32-command', { command: rule.command, deviceId: 'ESP32_GATEWAY_01' });
      
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
// SOCKET.IO - COMUNICACIÓN TIEMPO REAL
// =====================================================

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);
  
  // Enviar estado actual
  socket.emit('lights-update', systemState.lights);
  socket.emit('esp32-devices', systemState.esp32Devices);
  socket.emit('system-stats', systemState.statistics);
  
  // Comando desde cliente web
  socket.on('send-command', (data) => {
    const { command, deviceId = 'ESP32_GATEWAY_01' } = data;
    console.log(`📤 Comando desde web: ${command} → ${deviceId}`);
    
    io.emit('esp32-command', { command, deviceId });   // notifica a la interfaz web
    io.emit('message', JSON.stringify({ command }));   // envía al ESP32

    
    systemState.statistics.totalCommands++;
  });
  
  // ESP32 enviando mensaje
  socket.on('esp32-message', (data) => {
    processArduinoMessage(data.message, data.deviceId);
  });
  
  // Heartbeat desde ESP32
  socket.on('heartbeat', (data) => {
    const { deviceId } = data;
    if (systemState.esp32Devices[deviceId]) {
      systemState.esp32Devices[deviceId].lastSeen = new Date().toISOString();
      systemState.esp32Devices[deviceId].connected = true;
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);
  });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SERVIDOR SMART HOME INICIADO');
  console.log('='.repeat(60));
  console.log(`📡 HTTP Server: http://0.0.0.0:${PORT}`);
  console.log(`🔌 Socket.IO: ws://0.0.0.0:${PORT}`);
  console.log(`⏰ Inicio: ${new Date().toLocaleString()}`);
  console.log('='.repeat(60) + '\n');
  console.log('Esperando conexión de ESP32...\n');
});

process.on('SIGINT', () => {
  console.log('\n⚠️ Cerrando servidor...');
  process.exit();
});