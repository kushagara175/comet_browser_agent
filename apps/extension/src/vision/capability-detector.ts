/**
 * @privapilot/extension - Hardware Capability Detector & Execution Provider Fallback
 *
 * Enforces graceful runtime degradation: WebGPU -> WASM SIMD+threads -> CPU.
 * Allows forcibly disabling WebGPU to guarantee testing and execution
 * on machines without working WebGPU.
 */

export type HardwareProvider = 'webgpu' | 'wasm' | 'cpu';

export interface HardwareCapabilities {
  readonly webgpu: boolean;
  readonly wasmSimd: boolean;
  readonly wasmThreads: boolean;
  readonly selectedProvider: HardwareProvider;
  readonly webgpuDisabledForced: boolean;
}

// Minimal binary representation of a WebAssembly module containing a SIMD v128 instruction
const WASM_SIMD_BYTECODE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
  0x02, 0x01, 0x00, 0x0a, 0x16, 0x01, 0x14, 0x00,
  0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x0b
]);

export class CapabilityDetector {
  private static forcedProvider: HardwareProvider | null = null;
  private static webgpuForcedDisabled = false;

  /**
   * Forcibly disables WebGPU at runtime (essential for tests and finale demo machines).
   */
  static disableWebGPU(disabled = true): void {
    this.webgpuForcedDisabled = disabled;
  }

  /**
   * Returns whether WebGPU is currently forcibly disabled.
   */
  static isWebGPUDisabled(): boolean {
    return this.webgpuForcedDisabled;
  }

  /**
   * Force a specific execution provider for testing or demo override.
   */
  static forceProvider(provider: HardwareProvider | null): void {
    this.forcedProvider = provider;
  }

  /**
   * Probes whether WebGPU is supported and available in the current environment.
   */
  static hasWebGPU(): boolean {
    if (this.webgpuForcedDisabled) return false;
    if (typeof navigator === 'undefined') return false;
    return Boolean((navigator as any).gpu && typeof (navigator as any).gpu.requestAdapter === 'function');
  }

  static isWebGPUAvailable(): boolean {
    return this.hasWebGPU();
  }

  /**
   * Probes whether WebAssembly 128-bit SIMD is supported.
   */
  static hasWasmSimd(): boolean {
    try {
      if (typeof WebAssembly === 'undefined' || typeof WebAssembly.validate !== 'function') {
        return false;
      }
      return WebAssembly.validate(WASM_SIMD_BYTECODE);
    } catch {
      return false;
    }
  }

  /**
   * Probes whether WebAssembly multithreading (SharedArrayBuffer) is supported.
   */
  static hasWasmThreads(): boolean {
    try {
      return typeof SharedArrayBuffer !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Resolves the best available execution provider in preference order:
   * 1. WebGPU (if available and not forcibly disabled)
   * 2. WASM (SIMD / standard)
   * 3. CPU (basic fallback)
   */
  static detectBestProvider(): HardwareProvider {
    if (this.forcedProvider) {
      return this.forcedProvider;
    }

    if (this.hasWebGPU()) {
      return 'webgpu';
    }

    if (this.hasWasmSimd() || typeof WebAssembly !== 'undefined') {
      return 'wasm';
    }

    return 'cpu';
  }

  /**
   * Returns a complete capability report for telemetry and HUD display.
   */
  static getCapabilities(): HardwareCapabilities {
    return {
      webgpu: this.hasWebGPU(),
      wasmSimd: this.hasWasmSimd(),
      wasmThreads: this.hasWasmThreads(),
      selectedProvider: this.detectBestProvider(),
      webgpuDisabledForced: this.webgpuForcedDisabled
    };
  }
}
