/**
 * LiveAudioStreamer
 * Real-time bidirectional Web Audio streaming engine for Google Gemini Live API.
 * - Captures microphone audio, resamples to 16kHz 16-bit linear PCM, and streams chunks.
 * - Receives 24kHz 16-bit linear PCM chunks from Gemini and schedules seamless, zero-latency playback.
 * - Instant barge-in / interruption: immediately halts playback and flushes queued audio buffers.
 * - Connects directly to AnalyserNode so VoiceOrb and 3D visualizations react in real time.
 */

export interface LiveAudioStreamerCallbacks {
  onAudioChunk?: (pcmBase64: string) => void;
  onUserSpeechLevel?: (rms: number) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onError?: (error: Error) => void;
}

export class LiveAudioStreamer {
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;

  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private nextPlayTime = 0;
  private isCapturing = false;
  private isPlaying = false;
  private callbacks: LiveAudioStreamerCallbacks;

  // Smoothing buffers for user voice level
  private userRMS = 0;

  constructor(callbacks: LiveAudioStreamerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Unlocks and initializes the AudioContexts (must be called from a user gesture event)
   */
  async ensureAudioContext(): Promise<void> {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!this.outputCtx) {
      this.outputCtx = new AudioCtxClass();
      this.analyser = this.outputCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.connect(this.outputCtx.destination);
    }
    if (this.outputCtx.state === 'suspended') {
      await this.outputCtx.resume();
    }
  }

  /**
   * Returns the output AnalyserNode for audio-reactive visualizers (VoiceOrb)
   */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * Starts microphone capture with acoustic echo cancellation and downsampling to 16kHz mono PCM
   */
  async startCapture(): Promise<void> {
    if (this.isCapturing) return;

    try {
      await this.ensureAudioContext();

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputCtx = new AudioCtxClass();
      if (this.inputCtx.state === 'suspended') {
        await this.inputCtx.resume();
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.micSource = this.inputCtx.createMediaStreamSource(this.micStream);

      // Buffer size 2048 gives ~46ms chunks at 44.1kHz or ~42ms at 48kHz
      const bufferSize = 2048;
      this.processorNode = this.inputCtx.createScriptProcessor(bufferSize, 1, 1);

      const targetSampleRate = 16000;
      const nativeSampleRate = this.inputCtx.sampleRate;

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isCapturing) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate instantaneous RMS for user speech level
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.userRMS = this.userRMS * 0.7 + rms * 0.3;
        if (this.callbacks.onUserSpeechLevel) {
          this.callbacks.onUserSpeechLevel(this.userRMS);
        }

        // Downsample inputData to 16kHz linear PCM
        const resampled = this.resample(inputData, nativeSampleRate, targetSampleRate);
        const pcm16 = this.floatTo16BitPCM(resampled);
        const base64 = this.arrayBufferToBase64(pcm16.buffer);

        if (this.callbacks.onAudioChunk) {
          this.callbacks.onAudioChunk(base64);
        }
      };

      this.micSource.connect(this.processorNode);
      this.processorNode.connect(this.inputCtx.destination);
      this.isCapturing = true;
    } catch (err: any) {
      console.error('[LiveAudioStreamer] Error starting microphone capture:', err);
      if (this.callbacks.onError) {
        this.callbacks.onError(err);
      }
      throw err;
    }
  }

  /**
   * Stops microphone capture
   */
  stopCapture(): void {
    this.isCapturing = false;
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch (e) {}
      this.processorNode = null;
    }
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (e) {}
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.inputCtx && this.inputCtx.state !== 'closed') {
      try {
        this.inputCtx.close();
      } catch (e) {}
      this.inputCtx = null;
    }
  }

  /**
   * Enqueues and plays a 24kHz 16-bit PCM streaming audio chunk from Gemini Live
   */
  async playPcmChunk(base64Data: string): Promise<void> {
    if (!base64Data) return;
    await this.ensureAudioContext();
    if (!this.outputCtx || !this.analyser) return;

    try {
      const pcm16 = this.base64ToInt16Array(base64Data);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        // Normalize 16-bit signed integer to [-1.0, 1.0]
        float32[i] = pcm16[i] / 32768.0;
      }

      // Gemini Live output sample rate is 24,000 Hz
      const sampleRate = 24000;
      const audioBuffer = this.outputCtx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.outputCtx.createBufferSource();
      source.buffer = audioBuffer;

      // Connect: source -> analyser -> outputCtx.destination
      source.connect(this.analyser);

      const currentTime = this.outputCtx.currentTime;
      // Schedule immediately or seamlessly stitch to end of previous chunk
      const startTime = Math.max(currentTime, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      this.activeSources.add(source);
      if (!this.isPlaying) {
        this.isPlaying = true;
        if (this.callbacks.onPlaybackStateChange) {
          this.callbacks.onPlaybackStateChange(true);
        }
      }

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0) {
          this.isPlaying = false;
          if (this.callbacks.onPlaybackStateChange) {
            this.callbacks.onPlaybackStateChange(false);
          }
        }
      };
    } catch (err) {
      console.warn('[LiveAudioStreamer] Error playing PCM chunk:', err);
    }
  }

  /**
   * Immediate Barge-in / Interruption: Stops all actively playing and queued audio buffers
   */
  stopPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    }
    this.activeSources.clear();

    if (this.outputCtx) {
      this.nextPlayTime = this.outputCtx.currentTime;
    } else {
      this.nextPlayTime = 0;
    }

    if (this.isPlaying) {
      this.isPlaying = false;
      if (this.callbacks.onPlaybackStateChange) {
        this.callbacks.onPlaybackStateChange(false);
      }
    }
  }

  /**
   * Resets all capture and playback pipelines
   */
  destroy(): void {
    this.stopCapture();
    this.stopPlayback();
    if (this.outputCtx && this.outputCtx.state !== 'closed') {
      try {
        this.outputCtx.close();
      } catch (e) {}
      this.outputCtx = null;
    }
  }

  // --- Utility Helpers ---

  private resample(source: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return source;
    const ratio = fromRate / toRate;
    const newLength = Math.round(source.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;

      const sample1 = source[index] || 0;
      const sample2 = source[index + 1] || sample1;
      result[i] = sample1 + frac * (sample2 - sample1);
    }

    return result;
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToInt16Array(base64: string): Int16Array {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }
}
