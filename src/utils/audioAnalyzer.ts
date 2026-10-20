/**
 * Audio Analyzer and Web Audio API Bridge
 * Provides real-time frequency analysis and RMS amplitude measurements
 * for driving audio-reactive 3D visualizations in sync with Aoede speech.
 */

export interface AudioMetrics {
  rms: number;      // Overall smoothed volume (0.0 - 1.0)
  bass: number;     // Low frequencies: 40 - 250 Hz (0.0 - 1.0)
  mid: number;      // Mid/Voice frequencies: 250 - 2000 Hz (0.0 - 1.0)
  high: number;     // High frequencies/Sibilants: 2000 - 8000 Hz (0.0 - 1.0)
  isPlaying: boolean;
}

class AudioAnalyzerManager {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private freqData: Uint8Array | null = null;
  private timeData: Uint8Array | null = null;
  private isPlaying = false;
  private onEndedCallback: (() => void) | null = null;

  // Smoothed metric targets for natural fluid damping
  private smoothedRMS = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedHigh = 0;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch((err) => {
        console.warn('[AudioAnalyzer] Context resume deferred until user interaction:', err);
      });
    }
    return this.audioCtx;
  }

  private setupAnalyser(ctx: AudioContext) {
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.82;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.fftSize);
    }
  }

  setExternalAnalyser(external: AnalyserNode | null): void {
    if (external) {
      this.analyser = external;
      this.freqData = new Uint8Array(external.frequencyBinCount);
      this.timeData = new Uint8Array(external.fftSize);
    }
  }

  /**
   * Decodes a base64 audio stream (WAV or MP3) and plays it through the AnalyserNode
   */
  async playBase64Audio(base64Data: string, onEnded?: () => void): Promise<void> {
    this.stopAudio();
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    this.setupAnalyser(ctx);
    if (!this.analyser) return;

    try {
      // Convert base64 to ArrayBuffer
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio data into native audio buffer
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Connect: source -> analyser -> destination (speakers)
      source.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      this.currentSource = source;
      this.isPlaying = true;
      this.onEndedCallback = onEnded || null;

      source.onended = () => {
        if (this.currentSource === source) {
          this.isPlaying = false;
          this.currentSource = null;
          if (this.onEndedCallback) {
            this.onEndedCallback();
            this.onEndedCallback = null;
          }
        }
      };

      source.start(0);
    } catch (err) {
      console.warn('[AudioAnalyzer] Failed to decode/play audio buffer:', err);
      this.isPlaying = false;
      this.currentSource = null;
      if (onEnded) onEnded();
    }
  }

  /**
   * Stop active playback immediately (used for barge-in interruptions)
   */
  stopAudio(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // Source might have already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    this.onEndedCallback = null;
  }

  /**
   * Reads real-time frequency distribution and RMS energy
   */
  getMetrics(): AudioMetrics {
    if (!this.analyser || !this.isPlaying || !this.freqData || !this.timeData) {
      // Damped decay to 0 when idle
      this.smoothedRMS *= 0.85;
      this.smoothedBass *= 0.85;
      this.smoothedMid *= 0.85;
      this.smoothedHigh *= 0.85;

      return {
        rms: Math.max(0, this.smoothedRMS),
        bass: Math.max(0, this.smoothedBass),
        mid: Math.max(0, this.smoothedMid),
        high: Math.max(0, this.smoothedHigh),
        isPlaying: false
      };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    // Compute RMS amplitude from time-domain signal
    let sumSquares = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const norm = (this.timeData[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    const rawRMS = Math.sqrt(sumSquares / this.timeData.length);

    // Sample rate typically 44100 or 48000 Hz, FFT size 512 gives 256 bins (~86 Hz per bin)
    const binCount = this.analyser.frequencyBinCount;
    const nyquist = (this.audioCtx?.sampleRate || 48000) / 2;
    const hzPerBin = nyquist / binCount;

    let bassSum = 0;
    let bassCount = 0;
    let midSum = 0;
    let midCount = 0;
    let highSum = 0;
    let highCount = 0;

    for (let i = 0; i < binCount; i++) {
      const freq = i * hzPerBin;
      const val = this.freqData[i] / 255;

      if (freq >= 40 && freq < 250) {
        bassSum += val;
        bassCount++;
      } else if (freq >= 250 && freq < 2000) {
        midSum += val;
        midCount++;
      } else if (freq >= 2000 && freq < 8000) {
        highSum += val;
        highCount++;
      }
    }

    const rawBass = bassCount > 0 ? bassSum / bassCount : 0;
    const rawMid = midCount > 0 ? midSum / midCount : 0;
    const rawHigh = highCount > 0 ? highSum / highCount : 0;

    // Responsive exponential smoothing
    this.smoothedRMS = this.smoothedRMS * 0.7 + rawRMS * 0.3;
    this.smoothedBass = this.smoothedBass * 0.72 + rawBass * 0.28;
    this.smoothedMid = this.smoothedMid * 0.75 + rawMid * 0.25;
    this.smoothedHigh = this.smoothedHigh * 0.78 + rawHigh * 0.22;

    return {
      rms: Math.min(1.0, this.smoothedRMS * 1.8),
      bass: Math.min(1.0, this.smoothedBass * 1.6),
      mid: Math.min(1.0, this.smoothedMid * 1.5),
      high: Math.min(1.0, this.smoothedHigh * 1.7),
      isPlaying: this.isPlaying
    };
  }

  isAudioPlaying(): boolean {
    return this.isPlaying;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }
}

export const audioAnalyzer = new AudioAnalyzerManager();
