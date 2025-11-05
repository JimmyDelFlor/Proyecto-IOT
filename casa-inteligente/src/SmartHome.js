import React, { useState, useEffect, useRef } from 'react';
import { Power, Lightbulb, Home, Car, Utensils, Bed, ShowerHead, DoorOpen, Shirt, Wifi, WifiOff, Brain, Clock, TrendingUp } from 'lucide-react';
import io from 'socket.io-client';

// ⚠️ CAMBIAR ESTA IP/URL POR LA DE TU SERVIDOR NODE.JS
const SERVER_URL = 'http://localhost:5000';

export default function App() {
  const [connected, setConnected] = useState(false);
  const [lights, setLights] = useState({
    exteriores: false,
    salaComedor: false,
    cochera: false,
    cocina: false,
    cuarto: false,
    banio: false,
    pasadizo: false,
    lavanderia: false
  });
  const [messages, setMessages] = useState([]);
  const [autoMode, setAutoMode] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [patterns, setPatterns] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Conectar Socket.IO
    socketRef.current = io(SERVER_URL);
    
    socketRef.current.on('connect', () => {
      console.log('✓ Conectado al servidor');
      setConnected(true);
      addMessage('Conectado al servidor', 'success');
      fetchSystemData();
    });

    socketRef.current.on('disconnect', () => {
      console.log('✗ Desconectado del servidor');
      setConnected(false);
      addMessage('Desconectado del servidor', 'error');
    });

    socketRef.current.on('lights-update', (lightsState) => {
      setLights(lightsState);
    });

    socketRef.current.on('arduino-message', (msg) => {
      addMessage(msg, 'info');
    });

    socketRef.current.on('esp32-status', (status) => {
      if (!status.connected) {
        addMessage('ESP32 desconectado', 'warning');
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const fetchSystemData = async () => {
    try {
      const statusRes = await fetch(`${SERVER_URL}/api/status`);
      const statusData = await statusRes.json();
      setLights(statusData.lights);
      setAutoMode(statusData.autoMode);

      const suggestionsRes = await fetch(`${SERVER_URL}/api/ai/suggestions`);
      const suggestionsData = await suggestionsRes.json();
      setSuggestions(suggestionsData.suggestions);

      const patternsRes = await fetch(`${SERVER_URL}/api/ai/patterns`);
      const patternsData = await patternsRes.json();
      setPatterns(patternsData.patterns);
    } catch (error) {
      console.error('Error al obtener datos:', error);
    }
  };

  const sendCommand = async (command) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('send-command', command);
    } else {
      try {
        await fetch(`${SERVER_URL}/api/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command })
        });
      } catch (error) {
        console.error('Error al enviar comando:', error);
        addMessage('Error al enviar comando', 'error');
      }
    }
  };

  const toggleAutoMode = async () => {
    try {
      const newMode = !autoMode;
      const response = await fetch(`${SERVER_URL}/api/auto-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newMode })
      });
      const data = await response.json();
      setAutoMode(data.autoMode);
      addMessage(`Modo automático ${newMode ? 'activado' : 'desactivado'}`, 'success');
    } catch (error) {
      console.error('Error al cambiar modo:', error);
    }
  };

  const applySuggestion = (suggestion) => {
    sendCommand(suggestion.command);
    addMessage(`Aplicando: ${suggestion.message}`, 'success');
  };

  const addMessage = (msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages(prev => [...prev.slice(-9), { msg, type, timestamp }]);
  };

  const toggleLight = (zone, onCmd, offCmd) => {
    const newState = !lights[zone];
    setLights(prev => ({ ...prev, [zone]: newState }));
    sendCommand(newState ? onCmd : offCmd);
  };

  const toggleAll = (state) => {
    const newLights = Object.keys(lights).reduce((acc, key) => {
      acc[key] = state;
      return acc;
    }, {});
    setLights(newLights);
    sendCommand(state ? 17 : 18);
  };

  const zones = [
    { key: 'exteriores', name: 'Exteriores', icon: Home, onCmd: 1, offCmd: 2, color: '#06b6d4' },
    { key: 'salaComedor', name: 'Sala-Comedor', icon: Home, onCmd: 3, offCmd: 4, color: '#8b5cf6' },
    { key: 'cochera', name: 'Cochera', icon: Car, onCmd: 5, offCmd: 6, color: '#64748b' },
    { key: 'cocina', name: 'Cocina', icon: Utensils, onCmd: 7, offCmd: 8, color: '#f59e0b' },
    { key: 'cuarto', name: 'Cuarto', icon: Bed, onCmd: 9, offCmd: 10, color: '#3b82f6' },
    { key: 'banio', name: 'Baño', icon: ShowerHead, onCmd: 11, offCmd: 12, color: '#10b981' },
    { key: 'pasadizo', name: 'Pasadizo', icon: DoorOpen, onCmd: 13, offCmd: 14, color: '#f97316' },
    { key: 'lavanderia', name: 'Lavandería', icon: Shirt, onCmd: 15, offCmd: 16, color: '#a855f7' }
  ];

  const lightsOn = Object.values(lights).filter(Boolean).length;
  const totalLights = Object.keys(lights).length;

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        {/* Header */}
        <div style={styles.header}>
          <div style={isMobile ? styles.headerContentMobile : styles.headerContent}>
            <div>
              <h1 style={isMobile ? styles.titleMobile : styles.title}>Control de Luces Inteligente</h1>
              <p style={isMobile ? styles.subtitleMobile : styles.subtitle}>Sistema con IA y Automatización</p>
              
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>
                    <Lightbulb size={16} color="#06b6d4" />
                    <span>ACTIVAS</span>
                  </div>
                  <p style={isMobile ? styles.statValueMobile : styles.statValue}>{lightsOn}/{totalLights}</p>
                </div>
                
                <div style={{...styles.statCard, borderColor: '#8b5cf6'}}>
                  <div style={styles.statLabel}>
                    <span style={{fontSize: '14px'}}>📊</span>
                    <span>MENSAJES</span>
                  </div>
                  <p style={isMobile ? styles.statValueMobile : styles.statValue}>{messages.length}</p>
                </div>
              </div>
            </div>
            
            <div style={styles.controlsContainer}>
              <div style={styles.buttonRow}>
                <button
                  onClick={toggleAutoMode}
                  style={autoMode ? {...styles.autoButtonActive, fontSize: isMobile ? '14px' : '16px', padding: isMobile ? '12px 16px' : '16px 20px'} : {...styles.autoButton, fontSize: isMobile ? '14px' : '16px', padding: isMobile ? '12px 16px' : '16px 20px'}}
                >
                  <Brain size={isMobile ? 18 : 20} />
                  <span>{autoMode ? 'Auto ON' : 'Auto OFF'}</span>
                </button>
                
                <div style={{...(connected ? styles.statusOnline : styles.statusOffline), fontSize: isMobile ? '14px' : '16px', padding: isMobile ? '12px 16px' : '16px 20px'}}>
                  {connected ? <Wifi size={isMobile ? 18 : 20} /> : <WifiOff size={isMobile ? 18 : 20} />}
                  <div style={styles.statusDot}></div>
                  <span>{connected ? 'Online' : 'Offline'}</span>
                </div>
              </div>
              
              <div style={styles.buttonRow}>
                <button onClick={() => toggleAll(true)} style={{...styles.buttonOn, fontSize: isMobile ? '14px' : '16px', padding: isMobile ? '12px 16px' : '16px 20px'}}>
                  <Power size={isMobile ? 16 : 18} />
                  <span>{isMobile ? 'ON' : 'Encender Todas'}</span>
                </button>
                
                <button onClick={() => toggleAll(false)} style={{...styles.buttonOff, fontSize: isMobile ? '14px' : '16px', padding: isMobile ? '12px 16px' : '16px 20px'}}>
                  <Power size={isMobile ? 16 : 18} />
                  <span>{isMobile ? 'OFF' : 'Apagar Todas'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={isMobile ? styles.mainGridMobile : isTablet ? styles.mainGridTablet : styles.mainGrid}>
          {/* Lights Grid */}
          <div style={isMobile ? styles.lightsGridMobile : isTablet ? styles.lightsGridTablet : styles.lightsGrid}>
            {zones.map(({ key, name, icon: Icon, onCmd, offCmd, color }) => {
              const isOn = lights[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleLight(key, onCmd, offCmd)}
                  style={isOn ? {...styles.lightCard, ...styles.lightCardOn, background: color, boxShadow: `0 20px 40px ${color}40`} : styles.lightCard}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <div style={styles.lightIcon}>
                    {isOn ? <Lightbulb size={32} color="#fff" /> : <Icon size={32} color="#94a3b8" />}
                  </div>
                  <div style={styles.lightInfo}>
                    <p style={styles.lightName}>{name}</p>
                    <p style={isOn ? styles.lightStatusOn : styles.lightStatusOff}>
                      {isOn ? 'ENCENDIDA' : 'APAGADA'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sidebar */}
          <div style={styles.sidebar}>
            {/* AI Suggestions */}
            {suggestions && suggestions.length > 0 && (
              <div style={styles.suggestionsCard}>
                <div style={styles.cardHeader}>
                  <div style={styles.iconBadge}>
                    <Brain size={20} color="#fff" />
                  </div>
                  <h2 style={styles.cardTitle}>Sugerencias Inteligentes</h2>
                </div>
                <div style={styles.suggestionsContent}>
                  {suggestions.map((suggestion, i) => (
                    <div key={i} style={styles.suggestion}>
                      <div style={styles.suggestionInfo}>
                        <p style={styles.suggestionText}>{suggestion.message}</p>
                        <p style={styles.suggestionType}>Tipo: {suggestion.type}</p>
                      </div>
                      <button
                        onClick={() => applySuggestion(suggestion)}
                        style={styles.suggestionButton}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      >
                        Aplicar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Patterns */}
            {patterns && patterns.mostActiveHours && patterns.mostActiveHours.length > 0 && (
              <div style={styles.patternsCard}>
                <div style={styles.cardHeader}>
                  <div style={{...styles.iconBadge, background: 'linear-gradient(135deg, #06b6d4, #3b82f6)'}}>
                    <TrendingUp size={20} color="#fff" />
                  </div>
                  <h2 style={styles.cardTitle}>Patrones de Uso</h2>
                </div>
                <div style={styles.patternsContent}>
                  {patterns.mostActiveHours.map((hour, i) => (
                    <div key={i} style={styles.patternItem}>
                      <div style={styles.patternInfo}>
                        <Clock size={24} color="#06b6d4" />
                        <div>
                          <p style={styles.patternHour}>{hour.hour}:00</p>
                          <p style={styles.patternCount}>{hour.count} activaciones</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Activity Log */}
        <div style={styles.logCard}>
          <div style={styles.logHeader}>
            <div style={styles.cardHeader}>
              <div style={{...styles.iconBadge, background: 'linear-gradient(135deg, #10b981, #14b8a6)'}}>
                <span style={{fontSize: '20px'}}>📋</span>
              </div>
              <h2 style={styles.cardTitle}>Registro de Actividad</h2>
            </div>
            <button 
              onClick={fetchSystemData}
              style={styles.refreshButton}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.1)'}
            >
              🔄 Actualizar
            </button>
          </div>
          <div style={styles.logContent}>
            {messages.length === 0 ? (
              <p style={styles.logEmpty}>Esperando eventos...</p>
            ) : (
              messages.map((item, i) => (
                <div key={i} style={styles.logItem}>
                  <span style={styles.logTime}>[{item.timestamp}]</span>
                  <span style={{
                    ...styles.logMessage,
                    color: item.type === 'error' ? '#f87171' : 
                           item.type === 'success' ? '#10b981' : 
                           item.type === 'warning' ? '#f59e0b' : '#06b6d4'
                  }}>
                    {item.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  wrapper: {
    maxWidth: '1600px',
    margin: '0 auto'
  },
  header: {
    background: 'rgba(30, 41, 59, 0.4)',
    backdropFilter: 'blur(20px)',
    borderRadius: '24px',
    padding: '32px',
    marginBottom: '24px',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  headerContent: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    alignItems: 'center'
  },
  title: {
    fontSize: '48px',
    fontWeight: '900',
    background: 'linear-gradient(90deg, #06b6d4, #8b5cf6, #d946ef)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: '8px'
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '18px',
    marginBottom: '24px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginTop: '24px'
  },
  statCard: {
    background: 'rgba(6, 182, 212, 0.1)',
    backdropFilter: 'blur(10px)',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid rgba(6, 182, 212, 0.2)'
  },
  statLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#06b6d4',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    marginBottom: '4px'
  },
  statValue: {
    fontSize: '28px',
    fontWeight: '900',
    color: '#fff',
    margin: 0
  },
  controlsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  buttonRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  autoButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderRadius: '16px',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(51, 65, 85, 0.3)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.3s'
  },
  autoButtonActive: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderRadius: '16px',
    border: 'none',
    background: 'linear-gradient(135deg, #d946ef, #8b5cf6)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 10px 30px rgba(217, 70, 239, 0.3)',
    transition: 'all 0.3s'
  },
  statusOnline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #10b981, #14b8a6)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)'
  },
  statusOffline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #ef4444, #f43f5e)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    boxShadow: '0 10px 30px rgba(239, 68, 68, 0.4)'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#fff',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
  },
  buttonOn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 20px',
    borderRadius: '16px',
    border: 'none',
    background: 'linear-gradient(135deg, #10b981, #14b8a6)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)',
    transition: 'all 0.3s'
  },
  buttonOff: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 20px',
    borderRadius: '16px',
    border: 'none',
    background: 'linear-gradient(135deg, #f43f5e, #ec4899)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 10px 30px rgba(244, 63, 94, 0.3)',
    transition: 'all 0.3s'
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '24px',
    marginBottom: '24px'
  },
  lightsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px'
  },
  lightCard: {
    padding: '24px',
    borderRadius: '16px',
    border: '2px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(30, 41, 59, 0.3)',
    cursor: 'pointer',
    transition: 'all 0.5s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px'
  },
  lightCardOn: {
    border: 'none',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
  },
  lightIcon: {
    padding: '16px',
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)'
  },
  lightInfo: {
    textAlign: 'center'
  },
  lightName: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#fff',
    marginBottom: '4px'
  },
  lightStatusOn: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: '0.05em'
  },
  lightStatusOff: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: '0.05em'
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  suggestionsCard: {
    background: 'rgba(139, 92, 246, 0.1)',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  patternsCard: {
    background: 'rgba(30, 41, 59, 0.4)',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px'
  },
  iconBadge: {
    padding: '8px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #d946ef, #8b5cf6)',
    boxShadow: '0 8px 16px rgba(217, 70, 239, 0.3)'
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: '900',
    color: '#fff',
    margin: 0
  },
  suggestionsContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  suggestion: {
    background: 'rgba(30, 41, 59, 0.4)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  suggestionInfo: {
    marginBottom: '8px'
  },
  suggestionText: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    marginBottom: '4px'
  },
  suggestionType: {
    fontSize: '12px',
    color: '#94a3b8'
  },
  suggestionButton: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #d946ef, #8b5cf6)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(217, 70, 239, 0.3)',
    transition: 'opacity 0.3s'
  },
  patternsContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  patternItem: {
    background: 'rgba(51, 65, 85, 0.3)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    transition: 'border-color 0.3s'
  },
  patternInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  patternHour: {
    fontSize: '24px',
    fontWeight: '900',
    color: '#fff',
    margin: 0
  },
  patternCount: {
    fontSize: '12px',
    color: '#94a3b8',
    margin: 0
  },
  logCard: {
    background: 'rgba(30, 41, 59, 0.4)',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  refreshButton: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(6, 182, 212, 0.3)',
    background: 'rgba(6, 182, 212, 0.1)',
    color: '#06b6d4',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.3s'
  },
  logContent: {
    background: 'rgba(15, 23, 42, 0.5)',
    borderRadius: '12px',
    padding: '16px',
    fontFamily: 'monospace',
    fontSize: '14px',
    maxHeight: '300px',
    overflowY: 'auto'
  },
  logEmpty: {
    color: '#64748b',
    textAlign: 'center',
    padding: '32px 0'
  },
  logItem: {
    display: 'flex',
    gap: '12px',
    padding: '8px',
    borderRadius: '8px',
    marginBottom: '8px',
    transition: 'background 0.3s'
  },
  logTime: {
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '700'
  },
  logMessage: {
    flex: 1,
    fontSize: '14px'
  }
};