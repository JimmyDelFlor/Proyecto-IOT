#!/usr/bin/env python3
"""
Grabador de Audio desde Micrófono de Laptop
Detecta voz y sube a Google Drive para Whisper
"""

import pyaudio
import wave
import numpy as np
import time
from datetime import datetime
from drive_upload import upload_file
import keyboard  # Para hotkey opcional

# =====================================================
# CONFIGURACIÓN
# =====================================================

# Audio
RATE = 16000           # 16kHz (óptimo para Whisper)
CHANNELS = 1           # Mono
CHUNK = 1024           # Buffer
FORMAT = pyaudio.paInt16

# Detección de voz
THRESHOLD = 800        # Ajustar según tu micrófono
SILENCE_DURATION = 1.5 # Segundos de silencio para terminar
MIN_RECORD_DURATION = 0.5  # Mínimo 0.5s para grabar

# Modos
MODE = "auto"  # "auto" o "hotkey"
HOTKEY = "ctrl+space"  # Solo si MODE = "hotkey"

# =====================================================
# CLASE RECORDER
# =====================================================

class VoiceRecorder:
    def __init__(self):
        self.audio = pyaudio.PyAudio()
        self.is_recording = False
        self.frames = []
        
        # Listar dispositivos
        print("🎤 Dispositivos de audio disponibles:\n")
        for i in range(self.audio.get_device_count()):
            info = self.audio.get_device_info_by_index(i)
            if info['maxInputChannels'] > 0:
                print(f"   [{i}] {info['name']}")
                print(f"       Canales: {info['maxInputChannels']}")
                print(f"       Sample Rate: {int(info['defaultSampleRate'])}")
                print()
        
        # Abrir stream
        self.stream = self.audio.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=RATE,
            input=True,
            frames_per_buffer=CHUNK
        )
        
        print(f"✓ Micrófono inicializado")
        print(f"   Sample Rate: {RATE} Hz")
        print(f"   Canales: {CHANNELS}")
        print(f"   Umbral: {THRESHOLD}\n")
    
    def get_audio_level(self):
        """Lee un chunk y calcula el nivel de audio"""
        try:
            data = self.stream.read(CHUNK, exception_on_overflow=False)
            audio_data = np.frombuffer(data, dtype=np.int16)
            level = np.abs(audio_data).mean()
            return level, data
        except Exception as e:
            print(f"⚠️ Error leyendo audio: {e}")
            return 0, b''
    
    def record_until_silence(self):
        """Graba hasta detectar silencio prolongado"""
        print("🔴 GRABANDO... (habla ahora)")
        
        self.frames = []
        silence_start = None
        record_start = time.time()
        
        while True:
            level, data = self.get_audio_level()
            
            if len(data) > 0:
                self.frames.append(data)
            
            # Detectar voz/silencio
            if level > THRESHOLD:
                silence_start = None  # Resetear contador de silencio
                
                # Mostrar nivel visual
                bars = int(level / 100)
                print(f"🔴 {'█' * min(bars, 40)} {level:.0f}", end="\r")
            else:
                # Silencio detectado
                if silence_start is None:
                    silence_start = time.time()
                
                # Verificar si el silencio es suficiente
                silence_duration = time.time() - silence_start
                if silence_duration >= SILENCE_DURATION:
                    record_duration = time.time() - record_start
                    
                    # Verificar duración mínima
                    if record_duration >= MIN_RECORD_DURATION:
                        print(f"\n⏹️ Grabación completa ({record_duration:.1f}s)")
                        return True
                    else:
                        print(f"\n⚠️ Audio muy corto ({record_duration:.1f}s), cancelando")
                        return False
    
    def record_fixed_duration(self, duration=3):
        """Graba por tiempo fijo"""
        print(f"🔴 GRABANDO {duration} segundos...")
        
        self.frames = []
        start = time.time()
        
        while time.time() - start < duration:
            level, data = self.get_audio_level()
            
            if len(data) > 0:
                self.frames.append(data)
            
            elapsed = time.time() - start
            progress = int((elapsed / duration) * 20)
            bar = "█" * progress + "░" * (20 - progress)
            print(f"🔴 [{bar}] {elapsed:.1f}s", end="\r")
        
        print(f"\n⏹️ Grabación completa")
        return True
    
    def save_recording(self):
        """Guarda la grabación como WAV"""
        if not self.frames:
            print("⚠️ No hay audio para guardar")
            return None
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"audio_{timestamp}.wav"
        
        # Guardar WAV
        wf = wave.open(filename, 'wb')
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(self.audio.get_sample_size(FORMAT))
        wf.setframerate(RATE)
        wf.writeframes(b''.join(self.frames))
        wf.close()
        
        print(f"💾 Guardado: {filename}")
        return filename
    
    def close(self):
        """Cierra el stream de audio"""
        self.stream.stop_stream()
        self.stream.close()
        self.audio.terminate()

# =====================================================
# MODO AUTO: Detección automática de voz
# =====================================================

def modo_auto():
    print("╔═══════════════════════════════════════╗")
    print("║  Modo AUTO - Detección de voz        ║")
    print("╚═══════════════════════════════════════╝\n")
    
    recorder = VoiceRecorder()
    
    print("🎙 Escuchando... (habla cerca del micrófono)\n")
    
    try:
        while True:
            level, _ = recorder.get_audio_level()
            
            # Mostrar nivel actual
            if level > 50:
                print(f"📊 Nivel: {level:4.0f}", end="\r")
            
            # Si supera umbral, iniciar grabación
            if level > THRESHOLD:
                print(f"\n🟢 VOZ DETECTADA (nivel: {level:.0f})")
                
                # Grabar hasta silencio
                success = recorder.record_until_silence()
                
                if success:
                    # Guardar y subir
                    filename = recorder.save_recording()
                    
                    if filename:
                        print("☁️ Subiendo a Google Drive...")
                        try:
                            file_id = upload_file(filename)
                            if file_id:
                                print(f"✅ Subido exitosamente")
                            else:
                                print("⚠️ No se pudo subir")
                        except Exception as e:
                            print(f"❌ Error: {e}")
                
                print("\n🎙 Esperando próximo comando...\n")
                time.sleep(1)
    
    except KeyboardInterrupt:
        print("\n\n⏹️ Detenido por usuario")
    finally:
        recorder.close()

# =====================================================
# MODO HOTKEY: Presionar tecla para grabar
# =====================================================

def modo_hotkey():
    print("╔═══════════════════════════════════════╗")
    print("║  Modo HOTKEY - Manual                 ║")
    print("╚═══════════════════════════════════════╝\n")
    
    recorder = VoiceRecorder()
    
    print(f"💡 Presiona {HOTKEY} para grabar")
    print("   Suelta para terminar\n")
    
    try:
        while True:
            # Esperar hotkey
            keyboard.wait(HOTKEY)
            
            print("🔴 Grabando...")
            recorder.frames = []
            start = time.time()
            
            # Grabar mientras se mantiene presionado
            while keyboard.is_pressed(HOTKEY.split('+')[-1]):
                level, data = recorder.get_audio_level()
                if len(data) > 0:
                    recorder.frames.append(data)
                
                elapsed = time.time() - start
                print(f"🔴 Grabando... {elapsed:.1f}s", end="\r")
            
            duration = time.time() - start
            print(f"\n⏹️ Grabación completa ({duration:.1f}s)")
            
            # Guardar y subir
            if duration >= MIN_RECORD_DURATION:
                filename = recorder.save_recording()
                
                if filename:
                    print("☁️ Subiendo a Google Drive...")
                    try:
                        file_id = upload_file(filename)
                        if file_id:
                            print(f"✅ Subido exitosamente")
                    except Exception as e:
                        print(f"❌ Error: {e}")
            else:
                print("⚠️ Audio muy corto, descartado")
            
            print(f"\n💡 Listo para grabar (presiona {HOTKEY})\n")
    
    except KeyboardInterrupt:
        print("\n\n⏹️ Detenido por usuario")
    finally:
        recorder.close()

# =====================================================
# MODO TEST: Calibración del umbral
# =====================================================

def modo_test():
    print("╔═══════════════════════════════════════╗")
    print("║  Modo TEST - Calibración              ║")
    print("╚═══════════════════════════════════════╝\n")
    
    recorder = VoiceRecorder()
    
    print("🔧 Midiendo nivel de audio...")
    print("   Habla cerca del micrófono\n")
    
    levels = []
    
    try:
        for i in range(100):  # 10 segundos aprox
            level, _ = recorder.get_audio_level()
            levels.append(level)
            
            # Mostrar en tiempo real
            bars = int(level / 100)
            print(f"📊 {'█' * min(bars, 40)} {level:.0f}", end="\r")
            
            time.sleep(0.1)
        
        print("\n\n📊 Resultados:")
        print(f"   Nivel mínimo: {min(levels):.0f}")
        print(f"   Nivel máximo: {max(levels):.0f}")
        print(f"   Nivel promedio: {np.mean(levels):.0f}")
        print(f"\n💡 Umbral recomendado: {np.mean(levels) * 1.5:.0f}")
        print(f"   (ajustar THRESHOLD en el código)")
    
    except KeyboardInterrupt:
        print("\n\n⏹️ Detenido")
    finally:
        recorder.close()

# =====================================================
# MAIN
# =====================================================

def main():
    import sys
    
    if len(sys.argv) > 1:
        mode = sys.argv[1]
    else:
        mode = MODE
    
    if mode == "auto":
        modo_auto()
    elif mode == "hotkey":
        modo_hotkey()
    elif mode == "test":
        modo_test()
    else:
        print("Uso: python laptop_mic_recorder.py [auto|hotkey|test]")
        print("\nModos:")
        print("  auto    - Detecta voz automáticamente (default)")
        print("  hotkey  - Presiona Ctrl+Space para grabar")
        print("  test    - Calibrar umbral de detección")

if __name__ == "__main__":
    # Instalar dependencias:
    # pip install pyaudio numpy keyboard
    
    # En Windows, si pyaudio da error:
    # pip install pipwin
    # pipwin install pyaudio
    
    main()