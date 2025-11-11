import React, { useState, useEffect, useRef } from 'react';
import { Power, Lightbulb, Home, Car, Utensils, Bed, ShowerHead, DoorOpen, Shirt, Wifi, WifiOff, Brain, Clock, TrendingUp, Zap, AlertCircle, CheckCircle, Activity, BarChart3, Thermometer, Wind, Eye, DoorClosed, AlertTriangle, Bell } from 'lucide-react';
import io from 'socket.io-client';

const SERVER_URL = 'http://localhost:5000';

export default function App() {
  const [connected, setConnected] = useState(false);
  const [lights, setLights] = useState({
    exteriores: false, salaComedor: false, cochera: false, cocina: false,
    cuarto: false, banio: false, pasadizo: false, lavanderia: false
  });
  const [sensors, setSensors] = useState({
    gas: { level: 0, status: 'normal' },
    temperature: { value: 0, status: 'normal' },
    motion: { detected: false },
    door: { open: false }
  });
  const [alerts, setAlerts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [autoMode, setAutoMode] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [patterns, setPatterns] = useState(null);
  const [statistics, setStatistics] = useState({ totalCommands: 0, totalEvents: 0, uptimeSeconds: 0 });
  const [showNotification, setShowNotification] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(SERVER_URL);
    
    socketRef.current.on('connect', () => {
      setConnected(true);
      showToast('Conectado al servidor', 'success');
      fetchSystemData();
    });

    socketRef.current.on('disconnect', () => {
      setConnected(false);
      showToast('Desconectado', 'error');
    });

    socketRef.current.on('lights-update', setLights);
    socketRef.current.on('sensors-update', setSensors);
    socketRef.current.on('door-update', (door) => setSensors(prev => ({ ...prev, door })));
    
    socketRef.current.on('new-alert', (alert) => {
      setAlerts(prev => [alert, ...prev.slice(0, 9)]);
      showToast(`⚠️ ${alert.type}: ${alert.value}`, 'warning');
    });
    
    socketRef.current.on('arduino-message', (data) => {
      addMessage(data.message, 'info');
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const fetchSystemData = async () => {
    try {
      const [statusRes, suggestionsRes, patternsRes, alertsRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/status`),
        fetch(`${SERVER_URL}/api/ai/suggestions`),
        fetch(`${SERVER_URL}/api/ai/patterns`),
        fetch(`${SERVER_URL}/api/alerts`)
      ]);

      const statusData = await statusRes.json();
      const suggestionsData = await suggestionsRes.json();
      const patternsData = await patternsRes.json();
      const alertsData = await alertsRes.json();

      setLights(statusData.lights);
      setSensors(statusData.sensors);
      setAutoMode(statusData.autoMode);
      setStatistics(statusData.statistics);
      setSuggestions(suggestionsData.suggestions);
      setPatterns(patternsData.patterns);
      setAlerts(alertsData.alerts);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const sendCommand = (command) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('send-command', { command });
    }
  };

  const controlDoor = async (action) => {
    try {
      await fetch(`${SERVER_URL}/api/door`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      showToast(`Puerta: ${action === 'open' ? 'Abriendo' : 'Cerrando'}`, 'info');
    } catch (error) {
      showToast('Error al controlar puerta', 'error');
    }
  };

  const toggleAutoMode = async () => {
    try {
      const newMode = !autoMode;
      await fetch(`${SERVER_URL}/api/auto-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newMode })
      });
      setAutoMode(newMode);
      showToast(`IA ${newMode ? 'activada' : 'desactivada'}`, 'success');
    } catch (error) {
      showToast('Error', 'error');
    }
  };

  const applySuggestion = (suggestion) => {
    sendCommand(suggestion.command);
    showToast(`Aplicando: ${suggestion.message}`, 'success');
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
  };

  const showToast = (msg, type = 'info') => {
    setShowNotification({ msg, type });
    setTimeout(() => setShowNotification(null), 3000);
  };

  const addMessage = (msg, type = 'info') => {
    setMessages(prev => [...prev.slice(-9), { msg, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const toggleLight = (zone, onCmd, offCmd) => {
    const newState = !lights[zone];
    setLights(prev => ({ ...prev, [zone]: newState }));
    sendCommand(newState ? onCmd : offCmd);
  };

  const toggleAll = (state) => {
    setLights(Object.keys(lights).reduce((acc, key) => ({ ...acc, [key]: state }), {}));
    sendCommand(state ? 17 : 18);
  };

  const zones = [
    { key: 'exteriores', name: 'Exteriores', icon: Home, onCmd: 1, offCmd: 2, color: 'cyan' },
    { key: 'salaComedor', name: 'Sala', icon: Home, onCmd: 3, offCmd: 4, color: 'purple' },
    { key: 'cochera', name: 'Cochera', icon: Car, onCmd: 5, offCmd: 6, color: 'gray' },
    { key: 'cocina', name: 'Cocina', icon: Utensils, onCmd: 7, offCmd: 8, color: 'orange' },
    { key: 'cuarto', name: 'Cuarto', icon: Bed, onCmd: 9, offCmd: 10, color: 'blue' },
    { key: 'banio', name: 'Baño', icon: ShowerHead, onCmd: 11, offCmd: 12, color: 'teal' },
    { key: 'pasadizo', name: 'Pasadizo', icon: DoorOpen, onCmd: 13, offCmd: 14, color: 'yellow' },
    { key: 'lavanderia', name: 'Lavandería', icon: Shirt, onCmd: 15, offCmd: 16, color: 'pink' }
  ];

  const lightsOn = Object.values(lights).filter(Boolean).length;

  return (
    <div className="app">
      {showNotification && (
        <div className={`toast toast-${showNotification.type}`}>
          {showNotification.type === 'success' && <CheckCircle size={20} />}
          {showNotification.type === 'error' && <AlertCircle size={20} />}
          {showNotification.type === 'warning' && <AlertTriangle size={20} />}
          {showNotification.type === 'info' && <Activity size={20} />}
          <span>{showNotification.msg}</span>
        </div>
      )}

      <div className="grid-container">
        {/* HEADER */}
        <div className="header">
          <div className="header-content">
            <div>
              <h1>Smart Home Control</h1>
              <p>Sistema Inteligente Domótico</p>
            </div>
            <div className="header-controls">
              <button onClick={toggleAutoMode} className={`btn-control ${autoMode ? 'active' : ''}`}>
                <Brain size={20} />
                <span>{autoMode ? 'IA ON' : 'IA OFF'}</span>
              </button>
              <div className={`status ${connected ? 'online' : 'offline'}`}>
                {connected ? <Wifi size={20} /> : <WifiOff size={20} />}
                <div className="dot"></div>
                <span>{connected ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          </div>
          
          <div className="stats">
            <div className="stat blue"><Lightbulb size={20} /><div><strong>{lightsOn}/8</strong><span>Luces</span></div></div>
            <div className="stat purple"><Activity size={20} /><div><strong>{statistics.totalCommands}</strong><span>Comandos</span></div></div>
            <div className="stat green"><TrendingUp size={20} /><div><strong>{statistics.totalEvents}</strong><span>Eventos</span></div></div>
            <div className="stat orange"><Clock size={20} /><div><strong>{Math.floor(statistics.uptimeSeconds / 60)}m</strong><span>Uptime</span></div></div>
          </div>
        </div>

        {/* SIDEBAR LEFT - SENSORS */}
        <div className="sidebar-left">
          <div className="card">
            <h2><Activity size={20} /> Sensores</h2>
            
            {/* Gas Sensor */}
            <div className={`sensor-card gas-${sensors.gas.status}`}>
              <Wind size={32} />
              <div>
                <strong>Gas MQ-6</strong>
                <p className="sensor-value">{sensors.gas.level}</p>
                <span className={`badge badge-${sensors.gas.status}`}>{sensors.gas.status.toUpperCase()}</span>
              </div>
            </div>

            {/* Temperature */}
            <div className={`sensor-card temp-${sensors.temperature.status}`}>
              <Thermometer size={32} />
              <div>
                <strong>Temperatura</strong>
                <p className="sensor-value">{sensors.temperature.value.toFixed(1)}°C</p>
                <span className={`badge badge-${sensors.temperature.status}`}>{sensors.temperature.status.toUpperCase()}</span>
              </div>
            </div>

            {/* Motion */}
            <div className={`sensor-card motion-${sensors.motion.detected ? 'detected' : 'normal'}`}>
              <Eye size={32} />
              <div>
                <strong>Movimiento PIR</strong>
                <p className="sensor-value">{sensors.motion.detected ? 'Detectado' : 'Sin movimiento'}</p>
                <span className={`badge ${sensors.motion.detected ? 'badge-critico' : 'badge-normal'}`}>
                  {sensors.motion.detected ? 'ACTIVO' : 'NORMAL'}
                </span>
              </div>
            </div>

            {/* Door Control */}
            <div className="door-control">
              <h3><DoorClosed size={20} /> Control de Puerta</h3>
              <div className={`door-status ${sensors.door.open ? 'open' : 'closed'}`}>
                {sensors.door.open ? <DoorOpen size={48} /> : <DoorClosed size={48} />}
                <strong>{sensors.door.open ? 'ABIERTA' : 'CERRADA'}</strong>
              </div>
              <div className="door-buttons">
                <button onClick={() => controlDoor('open')} className="btn-door open">Abrir</button>
                <button onClick={() => controlDoor('close')} className="btn-door close">Cerrar</button>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="card alerts">
              <h2><Bell size={20} /> Alertas Recientes</h2>
              <div className="alerts-list">
                {alerts.slice(0, 5).map(alert => (
                  <div key={alert.id} className="alert-item">
                    <AlertTriangle size={16} />
                    <div>
                      <strong>{alert.type}</strong>
                      <span>{alert.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CENTER - LIGHTS */}
        <div className="center">
          <div className="controls">
            <button onClick={() => toggleAll(true)} className="btn-main green">
              <Power size={24} />
              <span>Encender Todas</span>
            </button>
            <button onClick={() => toggleAll(false)} className="btn-main red">
              <Power size={24} />
              <span>Apagar Todas</span>
            </button>
          </div>

          <div className="lights-grid">
            {zones.map(({ key, name, icon: Icon, onCmd, offCmd, color }) => (
              <button key={key} onClick={() => toggleLight(key, onCmd, offCmd)} 
                className={`light ${lights[key] ? 'on' : 'off'} color-${color}`}>
                <div className="light-icon">
                  {lights[key] ? <Lightbulb size={32} /> : <Icon size={32} />}
                </div>
                <strong>{name}</strong>
                <span>{lights[key] ? '● ON' : '○ OFF'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* SIDEBAR RIGHT - AI & ACTIVITY */}
        <div className="sidebar-right">
          {suggestions.length > 0 && (
            <div className="card suggestions">
              <h2><Brain size={20} /> IA Sugerencias</h2>
              {suggestions.map(s => (
                <div key={s.id} className="suggestion">
                  <div><span className="icon">{s.icon}</span><strong>{s.message}</strong><small>{s.type}</small></div>
                  <button onClick={() => applySuggestion(s)} className="btn-apply">Aplicar</button>
                </div>
              ))}
            </div>
          )}

          {patterns?.mostActiveHours?.length > 0 && (
            <div className="card patterns">
              <h2><BarChart3 size={20} /> Patrones</h2>
              <div className="patterns-grid">
                {patterns.mostActiveHours.map((h, i) => (
                  <div key={i} className="pattern"><Clock size={20} /><strong>{h.hour}:00</strong><span>{h.count}x</span></div>
                ))}
              </div>
            </div>
          )}

          <div className="card activity">
            <h2><Activity size={20} /> Actividad <button onClick={fetchSystemData} className="btn-refresh"><Zap size={16} /></button></h2>
            <div className="log">
              {messages.length === 0 ? <p>Sin eventos...</p> : messages.map((m, i) => (
                <div key={i} className={`log-entry ${m.type}`}>
                  <span className="time">{m.timestamp}</span>
                  <span>{m.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: #0a0e1a; color: #fff; }
        
        .app { min-height: 100vh; padding: 1.5rem; }
        
        .grid-container {
          display: grid;
          grid-template-columns: 320px 1fr 320px;
          grid-template-rows: auto 1fr;
          gap: 1.5rem;
          max-width: 1920px;
          margin: 0 auto;
        }
        
        .header { grid-column: 1 / -1; background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9)); backdrop-filter: blur(20px); border: 1px solid rgba(71, 85, 105, 0.3); border-radius: 24px; padding: 2rem; }
        .sidebar-left { grid-column: 1; }
        .center { grid-column: 2; }
        .sidebar-right { grid-column: 3; }
        
        .header-content { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .header h1 { font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; }
        .header p { color: #94a3b8; margin-top: 0.5rem; }
        
        .header-controls { display: flex; gap: 1rem; }
        .btn-control { display: flex; align-items: center; gap: 0.5rem; padding: 0.875rem 1.5rem; border: none; border-radius: 12px; background: rgba(51, 65, 85, 0.6); color: #fff; font-weight: 600; cursor: pointer; transition: all 0.3s; }
        .btn-control.active { background: linear-gradient(135deg, #8b5cf6, #ec4899); box-shadow: 0 8px 32px rgba(139, 92, 246, 0.4); }
        
        .status { display: flex; align-items: center; gap: 0.5rem; padding: 0.875rem 1.5rem; border-radius: 12px; font-weight: 600; }
        .status.online { background: linear-gradient(135deg, #10b981, #059669); }
        .status.offline { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: pulse 2s infinite; }
        
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
        .stat { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); }
        .stat.blue { background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1)); }
        .stat.purple { background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(124, 58, 237, 0.1)); }
        .stat.green { background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1)); }
        .stat.orange { background: linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.1)); }
        .stat strong { font-size: 1.75rem; display: block; }
        .stat span { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
        
        .card { background: rgba(30, 41, 59, 0.5); backdrop-filter: blur(20px); border: 1px solid rgba(71, 85, 105, 0.3); border-radius: 20px; padding: 1.5rem; margin-bottom: 1.5rem; }
        .card h2 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; margin-bottom: 1rem; }
        
        .sensor-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; border-radius: 16px; margin-bottom: 1rem; border: 2px solid; transition: all 0.3s; }
        .sensor-card strong { display: block; font-size: 1rem; }
        .sensor-value { font-size: 1.5rem; font-weight: 700; margin: 0.25rem 0; }
        
        .gas-normal { background: rgba(16, 185, 129, 0.1); border-color: #10b981; }
        .gas-bajo { background: rgba(251, 191, 36, 0.1); border-color: #fbbf24; }
        .gas-medio { background: rgba(249, 115, 22, 0.1); border-color: #f97316; }
        .gas-alto { background: rgba(239, 68, 68, 0.1); border-color: #ef4444; }
        .gas-critico { background: rgba(220, 38, 38, 0.2); border-color: #dc2626; animation: pulse-glow 1s infinite; }
        
        .temp-normal { background: rgba(59, 130, 246, 0.1); border-color: #3b82f6; }
        .temp-alta { background: rgba(239, 68, 68, 0.1); border-color: #ef4444; }
        
        .motion-normal { background: rgba(100, 116, 139, 0.1); border-color: #64748b; }
        .motion-detected { background: rgba(239, 68, 68, 0.1); border-color: #ef4444; animation: pulse-glow 1s infinite; }
        
        .badge { padding: 0.25rem 0.75rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; }
        .badge-normal { background: #10b981; color: #fff; }
        .badge-bajo { background: #fbbf24; color: #000; }
        .badge-medio { background: #f97316; color: #fff; }
        .badge-alto { background: #ef4444; color: #fff; }
        .badge-critico { background: #dc2626; color: #fff; animation: pulse 1s infinite; }
        
        .door-control { margin-top: 1rem; }
        .door-control h3 { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; margin-bottom: 1rem; }
        .door-status { text-align: center; padding: 1.5rem; border-radius: 16px; margin-bottom: 1rem; border: 2px solid; }
        .door-status.open { background: rgba(16, 185, 129, 0.1); border-color: #10b981; }
        .door-status.closed { background: rgba(100, 116, 139, 0.1); border-color: #64748b; }
        .door-status strong { display: block; margin-top: 0.5rem; font-size: 1.25rem; }
        .door-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .btn-door { padding: 0.875rem; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s; }
        .btn-door.open { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }
        .btn-door.close { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; }
        .btn-door:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
        
        .alerts-list { max-height: 300px; overflow-y: auto; }
        .alert-item { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.875rem; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 12px; margin-bottom: 0.75rem; }
        .alert-item strong { display: block; color: #ef4444; font-size: 0.9rem; }
        .alert-item span { display: block; color: #94a3b8; font-size: 0.8rem; }
        
        .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
        .btn-main { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 1.5rem; border: none; border-radius: 20px; font-weight: 700; font-size: 1.1rem; color: #fff; cursor: pointer; transition: all 0.3s; }
        .btn-main.green { background: linear-gradient(135deg, #10b981, #059669); }
        .btn-main.red { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .btn-main:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4); }
        
        .lights-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
        .light { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1.75rem 1.25rem; border: 1px solid rgba(71, 85, 105, 0.3); border-radius: 20px; cursor: pointer; transition: all 0.5s; background: rgba(30, 41, 59, 0.5); }
        .light:hover { transform: translateY(-4px); }
        .light.on { box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4); }
        .light-icon { width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 16px; }
        .light.off .light-icon { background: rgba(51, 65, 85, 0.5); color: #94a3b8; }
        .light strong { font-size: 1.1rem; }
        .light span { font-size: 0.875rem; }
        
        .light.on.color-cyan { background: linear-gradient(135deg, #06b6d4, #0891b2); color: #fff; }
        .light.on.color-cyan .light-icon { background: rgba(255, 255, 255, 0.2); }
        .light.on.color-purple { background: linear-gradient(135deg, #a855f7, #9333ea); color: #fff; }
        .light.on.color-purple .light-icon { background: rgba(255, 255, 255, 0.2); }
        .light.on.color-gray { background: linear-gradient(135deg, #6b7280, #4b5563); color: #fff; }
        .light.on.color-gray .light-icon { background: rgba(255, 255, 255, 0.2); }
        .light.on.color-orange { background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; }
        .light.on.color-orange .light-icon { background: rgba(255, 255, 255, 0.2); }
        .light.on.color-blue { background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; }
        .light.on.color-blue .light-icon { background: rgba(255, 255, 255, 0.2); }
        .light.on.color-teal { background: linear-gradient(135deg, #14b8a6, #0d9488); color: #fff; }
        .light.on.color-teal .light-icon { background: rgba(255, 255, 255, 0.2); }
        .light.on.color-yellow { background: linear-gradient(135deg, #eab308, #ca8a04); color: #fff; }
        .light.on.color-yellow .light-icon { background: rgba(255, 255, 255, 0.2); }
        .light.on.color-pink { background: linear-gradient(135deg, #ec4899, #db2777); color: #fff; }
        .light.on.color-pink .light-icon { background: rgba(255, 255, 255, 0.2); }
        
        .suggestions .suggestion { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; background: rgba(51, 65, 85, 0.4); border: 1px solid rgba(71, 85, 105, 0.3); border-radius: 14px; margin-bottom: 0.75rem; }
        .suggestion .icon { font-size: 1.5rem; margin-right: 0.5rem; }
        .suggestion strong { display: block; font-size: 0.95rem; }
        .suggestion small { display: block; color: #94a3b8; font-size: 0.75rem; margin-top: 0.25rem; }
        .btn-apply { padding: 0.5rem 1rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border: none; border-radius: 10px; color: #fff; font-weight: 600; cursor: pointer; }
        
        .patterns-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
        .pattern { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; background: rgba(51, 65, 85, 0.4); border: 1px solid rgba(71, 85, 105, 0.3); border-radius: 12px; }
        .pattern strong { font-size: 1.25rem; }
        .pattern span { font-size: 0.75rem; color: #94a3b8; }
        
        .log { max-height: 300px; overflow-y: auto; background: rgba(15, 23, 42, 0.5); border-radius: 12px; padding: 1rem; }
        .log p { color: #64748b; text-align: center; padding: 2rem; }
        .log-entry { display: flex; gap: 0.75rem; padding: 0.5rem; border-radius: 8px; margin-bottom: 0.5rem; transition: background 0.2s; }
        .log-entry:hover { background: rgba(51, 65, 85, 0.3); }
        .log-entry .time { color: #64748b; font-size: 0.75rem; min-width: 60px; }
        .log-entry.error { color: #ef4444; }
        .log-entry.success { color: #10b981; }
        .log-entry.warning { color: #f59e0b; }
        .log-entry.info { color: #3b82f6; }
        
        .btn-refresh { padding: 0.375rem 0.75rem; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; color: #3b82f6; cursor: pointer; margin-left: auto; transition: all 0.2s; }
        .btn-refresh:hover { background: rgba(59, 130, 246, 0.3); }
        
        .toast { position: fixed; top: 2rem; right: 2rem; display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.5rem; border-radius: 12px; backdrop-filter: blur(20px); border: 1px solid; font-weight: 600; animation: slideIn 0.3s ease-out; z-index: 1000; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); }
        .toast-success { background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981; }
        .toast-error { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444; }
        .toast-warning { background: rgba(245, 158, 11, 0.2); border-color: #f59e0b; color: #f59e0b; }
        .toast-info { background: rgba(59, 130, 246, 0.2); border-color: #3b82f6; color: #3b82f6; }
        
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          50% { box-shadow: 0 0 20px 10px rgba(239, 68, 68, 0); }
        }
        
        /* Scrollbar personalizado */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.5); border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.8); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 1); }
        
        /* Responsive */
        @media (max-width: 1400px) {
          .grid-container { grid-template-columns: 280px 1fr 280px; }
        }
        
        @media (max-width: 1200px) {
          .grid-container {
            grid-template-columns: 1fr;
            grid-template-rows: auto;
          }
          .header { grid-column: 1; }
          .sidebar-left { grid-column: 1; }
          .center { grid-column: 1; }
          .sidebar-right { grid-column: 1; }
        }
        
        @media (max-width: 768px) {
          .app { padding: 1rem; }
          .header h1 { font-size: 2rem; }
          .stats { grid-template-columns: repeat(2, 1fr); }
          .controls { grid-template-columns: 1fr; }
          .lights-grid { grid-template-columns: repeat(2, 1fr); }
          .patterns-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}