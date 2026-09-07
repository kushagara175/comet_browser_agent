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
export declare class CapabilityDetector {
    private static forcedProvider;
    private static webgpuForcedDisabled;
    /**
     * Forcibly disables WebGPU at runtime (essential for tests and finale demo machines).
     */
    static disableWebGPU(disabled?: boolean): void;
    /**
     * Returns whether WebGPU is currently forcibly disabled.
     */
    static isWebGPUDisabled(): boolean;
    /**
     * Force a specific execution provider for testing or demo override.
     */
    static forceProvider(provider: HardwareProvider | null): void;
    /**
     * Probes whether WebGPU is supported and available in the current environment.
     */
    static hasWebGPU(): boolean;
    static isWebGPUAvailable(): boolean;
    /**
     * Probes whether WebAssembly 128-bit SIMD is supported.
     */
    static hasWasmSimd(): boolean;
    /**
     * Probes whether WebAssembly multithreading (SharedArrayBuffer) is supported.
     */
    static hasWasmThreads(): boolean;
    /**
     * Resolves the best available execution provider in preference order:
     * 1. WebGPU (if available and not forcibly disabled)
     * 2. WASM (SIMD / standard)
     * 3. CPU (basic fallback)
     */
    static detectBestProvider(): HardwareProvider;
    /**
     * Returns a complete capability report for telemetry and HUD display.
     */
    static getCapabilities(): HardwareCapabilities;
}
//# sourceMappingURL=capability-detector.d.ts.map