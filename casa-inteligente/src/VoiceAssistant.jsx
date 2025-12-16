import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, MessageSquare, Bot, User, Loader, Volume2 } from 'lucide-react';

export default function VoiceAssistant({ serverUrl, socket }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy tu asistente de casa inteligente. Di "JARVIS" al ESP32 o escribe aquí. Prueba: "enciende las luces de la sala"' }
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [micPermission, setMicPermission] = useState('prompt');
  const [esp32Listening, setEsp32Listening] = useState(false);
  const [incomingTranscript, setIncomingTranscript] = useState(null); // Nueva transcripción
  
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recognitionTimeoutRef = useRef(null);

  // =====================================================
  // ESCUCHAR TRANSCRIPCIONES DEL SERVIDOR
  // =====================================================
  
  useEffect(() => {
    if (!socket) return;
    
    // Escuchar transcripciones desde Drive/Colab/ESP32
    socket.on('voice-transcript-received', (data) => {
      console.log('📝 Transcripción recibida:', data);
      
      // Mostrar notificación visual
      setIncomingTranscript(data.transcript);
      
      // Agregar al chat como mensaje del usuario
      addMessage('user', `🎤 ${data.transcript}`);
      
      // Enviar automáticamente a Ollama después de 500ms
      setTimeout(() => {
        handleSendMessage(data.transcript);
        setIncomingTranscript(null);
      }, 500);
    });
    
    return () => {
      socket.off('voice-transcript-received');
    };
  }, [socket]);

  // =====================================================
  // INICIALIZACIÓN - Web Speech API (micrófono web)
  // =====================================================
  
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-ES';
      recognitionRef.current.maxAlternatives = 1;
      
      recognitionRef.current.onstart = () => {
        console.log('🎤 Reconocimiento iniciado');
        setIsListening(true);
        
        recognitionTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            addMessage('assistant', '⏱️ Tiempo agotado. No detecté ningún audio.');
          }
        }, 10000);
      };
      
      recognitionRef.current.onresult = (event) => {
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
        }
        
        const transcript = event.results[0][0].transcript;
        console.log('🎤 Reconocido:', transcript);
        setInput(transcript);
        setIsListening(false);
        
        setTimeout(() => handleSendMessage(transcript), 300);
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Error reconocimiento:', event.error);
        setIsListening(false);
        
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
        }
        
        if (event.error === 'no-speech') {
          addMessage('assistant', '🎤 No detecté tu voz. Intenta de nuevo.');
        } else if (event.error === 'not-allowed') {
          setMicPermission('denied');
          addMessage('assistant', '❌ Necesito permiso para usar el micrófono.');
        } else if (event.error !== 'aborted') {
          addMessage('assistant', `❌ Error: ${event.error}`);
        }
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
        }
      };
    }
    
    // Verificar estado de Ollama
    checkOllamaStatus();
    const interval = setInterval(checkOllamaStatus, 30000);
    
    return () => {
      clearInterval(interval);
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current);
      }
    };
  }, []);

  // Scroll automático
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // =====================================================
  // FUNCIONES
  // =====================================================

  const checkOllamaStatus = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/assistant/status`);
      const data = await res.json();
      setOllamaStatus(data);
    } catch (error) {
      setOllamaStatus({ available: false });
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      addMessage('assistant', '❌ Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }
    
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      addMessage('assistant', '⏸️ Reconocimiento detenido.');
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => {
              recognitionRef.current.start();
              addMessage('assistant', '🎤 Escuchando... Habla ahora.');
            })
            .catch(() => {
              addMessage('assistant', '❌ No puedo acceder al micrófono.');
              setIsListening(false);
            });
        } else {
          recognitionRef.current.start();
          addMessage('assistant', '🎤 Escuchando... Habla ahora.');
        }
      } catch (error) {
        if (error.name === 'InvalidStateError') {
          recognitionRef.current.stop();
          setTimeout(() => {
            recognitionRef.current.start();
            addMessage('assistant', '🎤 Escuchando... Habla ahora.');
          }, 100);
        } else {
          addMessage('assistant', '❌ Error al iniciar el micrófono.');
          setIsListening(false);
        }
      }
    }
  };

  const addMessage = (role, content) => {
    setMessages(prev => [...prev, { 
      role, 
      content, 
      timestamp: new Date().toLocaleTimeString() 
    }]);
  };

  const handleSendMessage = async (messageText = null) => {
    const text = messageText || input.trim();
    
    if (!text) return;
    
    // Si no es una transcripción automática, agregar mensaje del usuario
    if (!messageText) {
      addMessage('user', text);
    }
    
    setInput('');
    setIsProcessing(true);

    try {
      const response = await fetch(`${serverUrl}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!response.ok) {
        throw new Error('Error en servidor');
      }

      const data = await response.json();
      
      // Agregar respuesta del asistente
      addMessage('assistant', data.response || 'Comando ejecutado');
      
      // Síntesis de voz (opcional)
      if ('speechSynthesis' in window && data.response) {
        const utterance = new SpeechSynthesisUtterance(data.response);
        utterance.lang = 'es-ES';
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      }

    } catch (error) {
      console.error('Error:', error);
      addMessage('assistant', '❌ Error al procesar. Verifica que el servidor esté activo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickExamples = [
    '💡 Enciende las luces de la sala',
    '🌙 Apaga todo',
    '🌡️ ¿Cuál es la temperatura?',
    '🚪 Abre la puerta principal'
  ];

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <>
      {/* Notificación de transcripción entrante */}
      {incomingTranscript && (
        <div className="transcript-notification">
          <Volume2 size={20} className="pulse-icon" />
          <span>Procesando: "{incomingTranscript}"</span>
        </div>
      )}

      {/* Botón flotante */}
      <button 
        onClick={() => setShowAssistant(!showAssistant)}
        className="assistant-fab"
        title="Asistente Virtual"
      >
        <Bot size={28} />
        {!ollamaStatus?.available && <span className="status-dot offline"></span>}
      </button>

      {/* Panel del asistente */}
      {showAssistant && (
        <div className="assistant-panel">
          <div className="assistant-header">
            <div className="header-info">
              <Bot size={24} />
              <div>
                <h3>Asistente Virtual</h3>
                <span className={`status ${ollamaStatus?.available ? 'online' : 'offline'}`}>
                  {ollamaStatus?.available ? '🟢 Ollama Online' : '🔴 Ollama Offline'}
                </span>
              </div>
            </div>
            <button onClick={() => setShowAssistant(false)} className="close-btn">✕</button>
          </div>

          {/* Mensajes */}
          <div className="messages-container">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                </div>
                <div className="message-content">
                  <p>{msg.content}</p>
                  {msg.timestamp && <span className="timestamp">{msg.timestamp}</span>}
                </div>
              </div>
            ))}
            
            {isProcessing && (
              <div className="message assistant processing">
                <div className="message-avatar">
                  <Loader size={20} className="spin" />
                </div>
                <div className="message-content">
                  <p>Procesando...</p>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Ejemplos rápidos */}
          {messages.length === 1 && (
            <div className="quick-examples">
              <p>Prueba estos comandos:</p>
              <div className="examples-grid">
                {quickExamples.map((ex, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleSendMessage(ex.substring(2))}
                    className="example-btn"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="assistant-input">
            {isListening && (
              <div className="listening-indicator">
                <div className="pulse-ring"></div>
                <div className="pulse-ring delay-1"></div>
                <div className="pulse-ring delay-2"></div>
                <span>Escuchando desde navegador...</span>
              </div>
            )}
            
            <div>
              <button 
                onClick={toggleListening}
                className={`mic-btn ${isListening ? 'listening' : ''}`}
                disabled={isProcessing}
                title={isListening ? 'Detener' : 'Hablar (navegador)'}
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isListening ? '🎤 Escuchando...' : 'Escribe, usa micrófono o di "JARVIS"...'}
                disabled={isProcessing || isListening}
              />
              
              <button 
                onClick={() => handleSendMessage()}
                className="send-btn"
                disabled={!input.trim() || isProcessing}
                title="Enviar"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .transcript-notification {
          position: fixed;
          top: 2rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(124, 58, 237, 0.95));
          border: 1px solid rgba(139, 92, 246, 0.5);
          border-radius: 16px;
          backdrop-filter: blur(20px);
          color: white;
          font-weight: 600;
          box-shadow: 0 12px 48px rgba(139, 92, 246, 0.6);
          z-index: 10000;
          animation: slideDown 0.3s ease-out;
        }
        
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        
        .pulse-icon {
          animation: pulse-scale 1s infinite;
        }
        
        @keyframes pulse-scale {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        
        .assistant-fab {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8b5cf6, #ec4899);
          border: none;
          color: white;
          cursor: pointer;
          box-shadow: 0 8px 32px rgba(139, 92, 246, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          z-index: 999;
        }
        
        .assistant-fab:hover {
          transform: scale(1.1);
          box-shadow: 0 12px 48px rgba(139, 92, 246, 0.6);
        }
        
        .status-dot {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid white;
        }
        
        .status-dot.offline {
          background: #ef4444;
          animation: pulse 2s infinite;
        }
        
        .assistant-panel {
          position: fixed;
          bottom: 6rem;
          right: 2rem;
          width: 420px;
          max-width: calc(100vw - 4rem);
          height: 600px;
          max-height: calc(100vh - 10rem);
          background: linear-gradient(135deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.98));
          backdrop-filter: blur(20px);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          z-index: 998;
          animation: slideUp 0.3s ease-out;
        }
        
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        .assistant-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid rgba(71, 85, 105, 0.3);
        }
        
        .header-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .header-info h3 {
          margin: 0;
          font-size: 1.25rem;
          background: linear-gradient(135deg, #60a5fa, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .header-info .status {
          font-size: 0.75rem;
          color: #94a3b8;
        }
        
        .close-btn {
          background: rgba(51, 65, 85, 0.5);
          border: none;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1.25rem;
          transition: all 0.2s;
        }
        
        .close-btn:hover {
          background: rgba(71, 85, 105, 0.8);
        }
        
        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .message {
          display: flex;
          gap: 0.75rem;
          animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .message.user {
          flex-direction: row-reverse;
        }
        
        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .message.user .message-avatar {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
        }
        
        .message.assistant .message-avatar {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        }
        
        .message.processing .message-avatar {
          background: linear-gradient(135deg, #f59e0b, #d97706);
        }
        
        .message-content {
          flex: 1;
          background: rgba(51, 65, 85, 0.5);
          padding: 0.875rem 1rem;
          border-radius: 12px;
          max-width: 85%;
        }
        
        .message.user .message-content {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1));
        }
        
        .message-content p {
          margin: 0;
          line-height: 1.5;
          color: #e2e8f0;
        }
        
        .timestamp {
          display: block;
          font-size: 0.7rem;
          color: #64748b;
          margin-top: 0.5rem;
        }
        
        .spin {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .quick-examples {
          padding: 0 1rem 1rem;
          border-bottom: 1px solid rgba(71, 85, 105, 0.3);
        }
        
        .quick-examples p {
          font-size: 0.875rem;
          color: #94a3b8;
          margin-bottom: 0.75rem;
        }
        
        .examples-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        
        .example-btn {
          padding: 0.75rem;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 10px;
          color: #a78bfa;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        
        .example-btn:hover {
          background: rgba(139, 92, 246, 0.2);
          border-color: rgba(139, 92, 246, 0.5);
          transform: translateY(-2px);
        }
        
        .assistant-input {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
          border-top: 1px solid rgba(71, 85, 105, 0.3);
        }
        
        .listening-indicator {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.75rem;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.05));
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          color: #ef4444;
          font-weight: 600;
          font-size: 0.9rem;
        }
        
        .pulse-ring {
          position: absolute;
          left: 1rem;
          width: 12px;
          height: 12px;
          border: 2px solid #ef4444;
          border-radius: 50%;
          animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        
        .pulse-ring.delay-1 {
          animation-delay: 0.3s;
        }
        
        .pulse-ring.delay-2 {
          animation-delay: 0.6s;
        }
        
        @keyframes pulse-ring {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
        
        .assistant-input > div:last-of-type {
          display: flex;
          gap: 0.75rem;
        }
        
        .mic-btn, .send-btn {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
        }
        
        .mic-btn {
          background: rgba(51, 65, 85, 0.5);
          color: white;
        }
        
        .mic-btn:hover {
          background: rgba(71, 85, 105, 0.8);
        }
        
        .mic-btn.listening {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          animation: pulse-mic 1s infinite;
        }
        
        @keyframes pulse-mic {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        
        .mic-btn:disabled, .send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .send-btn {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: white;
        }
        
        .send-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
        }
        
        .assistant-input input {
          flex: 1;
          background: rgba(51, 65, 85, 0.5);
          border: 1px solid rgba(71, 85, 105, 0.5);
          border-radius: 12px;
          padding: 0 1rem;
          color: white;
          font-size: 0.95rem;
        }
        
        .assistant-input input:focus {
          outline: none;
          border-color: rgba(139, 92, 246, 0.5);
        }
        
        .assistant-input input::placeholder {
          color: #64748b;
        }
        
        @media (max-width: 768px) {
          .assistant-panel {
            bottom: 1rem;
            right: 1rem;
            width: calc(100vw - 2rem);
            height: calc(100vh - 8rem);
          }
          
          .assistant-fab {
            bottom: 1rem;
            right: 1rem;
          }
          
          .transcript-notification {
            left: 1rem;
            right: 1rem;
            transform: none;
            width: auto;
          }
        }
      `}</style>
    </>
  );
}