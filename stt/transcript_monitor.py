#!/usr/bin/env python3
"""
Monitor de Transcripciones de Google Drive
Detecta nuevos archivos .txt y los envía al servidor Node.js
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
    
    def on_created(self, event):
        if event.is_directory:
            return
        
        if event.src_path.endswith('.txt'):
            self.process_transcript(event.src_path)
    
    def on_modified(self, event):
        if event.is_directory:
            return
        
        if event.src_path.endswith('.txt'):
            if event.src_path not in self.processed:
                self.process_transcript(event.src_path)
    
    def process_transcript(self, filepath):
        """Procesa nueva transcripción"""
        # Evitar procesar múltiples veces
        if filepath in self.processed:
            return
        
        print(f"\n📄 Nuevo archivo: {os.path.basename(filepath)}")
        
        # Esperar que el archivo esté completamente escrito
        time.sleep(1)
        
        try:
            # Leer transcripción
            with open(filepath, 'r', encoding='utf-8') as f:
                transcript = f.read().strip()
            
            if not transcript:
                print("⚠️ Archivo vacío, ignorando")
                return
            
            print(f"📝 Transcripción: \"{transcript}\"")
            
            # Enviar al servidor
            send_to_server(transcript)
            
            # Marcar como procesado
            self.processed.add(filepath)
            
        except Exception as e:
            print(f"❌ Error procesando {filepath}: {e}")
    
def send_to_server(transcript):
    """Envía transcripción al servidor para procesamiento"""
    try:
        response = requests.post(
            f"{SERVER_URL}/api/voice/transcript-drive",
            json={
                "deviceId": DEVICE_ID,
                "transcript": transcript,
                "source": "google_drive_colab"
            },
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Servidor procesó: {data.get('response', 'OK')}")
            
            if data.get('executed'):
                print(f"⚡ Comando ejecutado: {data.get('action')}")
        else:
            print(f"⚠️ Servidor respondió: {response.status_code}")
    
    except requests.exceptions.RequestException as e:
        print(f"❌ Error conectando al servidor: {e}")

# =====================================================
# MAIN
# =====================================================

def main():
    print("╔═══════════════════════════════════════╗")
    print("║  Monitor de Transcripciones v1.0     ║")
    print("╚═══════════════════════════════════════╝")
    print(f"📁 Monitoreando: {TRANSCRIPTS_DIR}")
    print(f"🌐 Servidor: {SERVER_URL}")
    print()
    
    if not os.path.exists(TRANSCRIPTS_DIR):
        print(f"❌ Directorio no existe: {TRANSCRIPTS_DIR}")
        print("\n💡 Asegúrate de:")
        print("   1. Tener Google Drive montado")
        print("   2. La ruta sea correcta")
        return
    
    # Procesar archivos existentes
    print("🔍 Procesando archivos existentes...")
    handler = TranscriptHandler()
    
    for filename in os.listdir(TRANSCRIPTS_DIR):
        if filename.endswith('.txt'):
            filepath = os.path.join(TRANSCRIPTS_DIR, filename)
            handler.process_transcript(filepath)
    
    print("\n✅ Listo, esperando nuevas transcripciones...\n")
    
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

if __name__ == "__main__":
    main()