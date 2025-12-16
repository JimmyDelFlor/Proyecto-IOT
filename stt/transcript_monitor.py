#!/usr/bin/env python3
"""
Monitor de Transcripciones de Google Drive
Detecta nuevos archivos .txt y los envía al servidor Node.js
VERSIÓN SIMPLIFICADA: Solo reenvía, el React procesa con Ollama
"""

import os
import time
import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# =====================================================
# CONFIGURACIÓN
# =====================================================

# Ruta local donde montas Google Drive
# Windows: "G:/Mi unidad/ESP32_AUDIO/transcripts"
# Mac: "/Users/tu_usuario/Google Drive/ESP32_AUDIO/transcripts"
# Linux: "/home/usuario/Google Drive/ESP32_AUDIO/transcripts"
TRANSCRIPTS_DIR = "G:/Mi unidad/ESP32_AUDIO/transcripts"

# Servidor Node.js
SERVER_URL = "http://10.134.23.93:5000"
DEVICE_ID = "ESP32_GATEWAY_01"

# =====================================================
# HANDLER
# =====================================================

class TranscriptHandler(FileSystemEventHandler):
    def __init__(self):
        self.processed = set()
        self.last_process_time = {}
    
    def on_created(self, event):
        if event.is_directory:
            return
        
        if event.src_path.endswith('.txt'):
            self.process_transcript(event.src_path)
    
    def on_modified(self, event):
        if event.is_directory:
            return
        
        if event.src_path.endswith('.txt'):
            # Evitar procesar múltiples veces en modificaciones rápidas
            now = time.time()
            if event.src_path in self.last_process_time:
                if now - self.last_process_time[event.src_path] < 2:
                    return  # Muy pronto desde última vez
            
            self.last_process_time[event.src_path] = now
            self.process_transcript(event.src_path)
    
    def process_transcript(self, filepath):
        """Procesa nueva transcripción"""
        filename = os.path.basename(filepath)
        
        # Evitar procesar múltiples veces
        if filepath in self.processed:
            return
        
        print(f"\n📄 Nuevo archivo: {filename}")
        
        # Esperar que el archivo esté completamente escrito
        time.sleep(0.5)
        
        try:
            # Leer transcripción
            with open(filepath, 'r', encoding='utf-8') as f:
                transcript = f.read().strip()
            
            if not transcript:
                print("⚠️ Archivo vacío, ignorando")
                return
            
            print(f"📝 Transcripción: \"{transcript}\"")
            print(f"📤 Enviando a servidor...")
            
            # Enviar al servidor (solo reenvío)
            send_to_server(transcript)
            
            # Marcar como procesado
            self.processed.add(filepath)
            
        except Exception as e:
            print(f"❌ Error procesando {filename}: {e}")
    
def send_to_server(transcript):
    """Envía transcripción al servidor para que React la procese"""
    try:
        response = requests.post(
            f"{SERVER_URL}/api/voice/transcript-drive",
            json={
                "deviceId": DEVICE_ID,
                "transcript": transcript,
                "source": "google_drive_colab"
            },
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Servidor: {data.get('message', 'OK')}")
            print(f"   React procesará con Ollama automáticamente")
        else:
            print(f"⚠️ Servidor respondió: {response.status_code}")
    
    except requests.exceptions.ConnectionError:
        print(f"❌ No se puede conectar al servidor: {SERVER_URL}")
        print(f"   Verifica que el servidor Node.js esté ejecutándose")
    except requests.exceptions.Timeout:
        print(f"❌ Timeout conectando al servidor")
    except Exception as e:
        print(f"❌ Error: {e}")

# =====================================================
# MAIN
# =====================================================

def main():
    print("╔═══════════════════════════════════════╗")
    print("║  Monitor de Transcripciones v2.0     ║")
    print("║  Envío directo a React                ║")
    print("╚═══════════════════════════════════════╝")
    print(f"📁 Monitoreando: {TRANSCRIPTS_DIR}")
    print(f"🌐 Servidor: {SERVER_URL}")
    print()
    
    if not os.path.exists(TRANSCRIPTS_DIR):
        print(f"❌ Directorio no existe: {TRANSCRIPTS_DIR}")
        print("\n💡 Asegúrate de:")
        print("   1. Tener Google Drive sincronizado/montado")
        print("   2. La ruta sea correcta")
        print("\n📝 Ejemplos de rutas:")
        print('   Windows: "G:/Mi unidad/ESP32_AUDIO/transcripts"')
        print('   Mac: "/Users/tu_usuario/Google Drive/ESP32_AUDIO/transcripts"')
        print('   Linux: "/home/usuario/Google Drive/ESP32_AUDIO/transcripts"')
        return
    
    # Verificar conectividad con servidor
    print("🔍 Verificando servidor...")
    try:
        response = requests.get(f"{SERVER_URL}/api/status", timeout=3)
        if response.status_code == 200:
            print("✅ Servidor Node.js accesible")
        else:
            print(f"⚠️ Servidor respondió con código {response.status_code}")
    except Exception as e:
        print(f"❌ No se puede conectar al servidor: {e}")
        print("   El monitor seguirá ejecutándose, pero no podrá enviar datos")
    
    print()
    
    # Procesar archivos existentes
    print("🔍 Procesando archivos existentes...")
    handler = TranscriptHandler()
    
    existing_files = [f for f in os.listdir(TRANSCRIPTS_DIR) if f.endswith('.txt')]
    if existing_files:
        print(f"   Encontrados {len(existing_files)} archivos")
        for filename in existing_files:
            filepath = os.path.join(TRANSCRIPTS_DIR, filename)
            handler.process_transcript(filepath)
    else:
        print("   No hay archivos existentes")
    
    print("\n✅ Listo, esperando nuevas transcripciones...")
    print("   (Presiona Ctrl+C para detener)\n")
    
    # Iniciar monitor
    observer = Observer()
    observer.schedule(handler, TRANSCRIPTS_DIR, recursive=False)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n⏹️ Deteniendo monitor...")
        observer.stop()
    
    observer.join()
    print("✅ Monitor detenido")

if __name__ == "__main__":
    # Dependencias:
    # pip install watchdog requests
    
    main()