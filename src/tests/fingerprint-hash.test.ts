import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateCanvasFingerprint,
  generateAudioFingerprint,
  getPrivacyPreservingFingerprint,
  getFingerprintOptOut,
  setFingerprintOptOut,
  validateZeroPii,
  sha256Hex,
} from "../lib/deviceFingerprint";

describe("Privacy-Preserving Canvas and Audio Fingerprint Hash Suite (#474)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("1. Canvas rendering hash tests", () => {
    it("generates a stable 64-character SHA-256 identifier", async () => {
      const hash1 = await generateCanvasFingerprint();
      const hash2 = await generateCanvasFingerprint();

      expect(hash1).not.toBeNull();
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      // Verify stability across calls with identical canvas context
      expect(hash1).toBe(hash2);
    });

    it("produces distinct hashes for different canvas renderings", async () => {
      const canvasA = document.createElement("canvas");
      canvasA.width = 200;
      canvasA.height = 50;
      canvasA.toDataURL = () => "data:image/png;base64,canvasA_custom_sample";

      const canvasB = document.createElement("canvas");
      canvasB.width = 300;
      canvasB.height = 80;
      canvasB.toDataURL = () => "data:image/png;base64,canvasB_differing_sample";

      const hashA = await generateCanvasFingerprint(canvasA);
      const hashB = await generateCanvasFingerprint(canvasB);

      expect(hashA).toHaveLength(64);
      expect(hashB).toHaveLength(64);
      expect(hashA).not.toBe(hashB);
    });
  });

  describe("2. Audio context oscillation fingerprinting tests", () => {
    it("handles unsupported audio context environments gracefully without crashing", async () => {
      const origOfflineAudio = window.OfflineAudioContext;
      const origWebkit = (window as any).webkitOfflineAudioContext;

      try {
        (window as any).OfflineAudioContext = undefined;
        (window as any).webkitOfflineAudioContext = undefined;

        const hash = await generateAudioFingerprint();
        expect(hash).not.toBeNull();
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        window.OfflineAudioContext = origOfflineAudio;
        (window as any).webkitOfflineAudioContext = origWebkit;
      }
    });

    it("handles audio context initialization failures or permission denials gracefully", async () => {
      const throwingContext = () => {
        throw new Error("SecurityError: AudioContext blocked by browser policy");
      };

      const hash = await generateAudioFingerprint(throwingContext as any);
      expect(hash).not.toBeNull();
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles muted environments returning zero-amplitude audio buffers", async () => {
      // Mock an OfflineAudioContext that renders all zeros (muted device)
      const mockAudioBuffer = {
        getChannelData: vi.fn().mockReturnValue(new Float32Array(5000).fill(0)),
      };

      const mockOfflineContext = {
        createOscillator: vi.fn().mockReturnValue({
          type: "triangle",
          frequency: { value: 0 },
          connect: vi.fn(),
          start: vi.fn(),
        }),
        createDynamicsCompressor: vi.fn().mockReturnValue({
          threshold: { value: 0 },
          knee: { value: 0 },
          ratio: { value: 0 },
          reduction: { value: 0 },
          attack: { value: 0 },
          release: { value: 0 },
          connect: vi.fn(),
        }),
        destination: {},
        startRendering: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      const hash = await generateAudioFingerprint(mockOfflineContext as any);
      expect(hash).not.toBeNull();
      expect(hash).toHaveLength(64);
      // Muted buffer should return deterministic muted environment hash
      const expectedMutedHash = await sha256Hex("stormsale_audio_muted_environment");
      expect(hash).toBe(expectedMutedHash);
    });

    it("generates stable 64-character hash when audio oscillation renders data", async () => {
      const samples = new Float32Array(5000);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin(i / 10) * 0.5;
      }

      const mockAudioBuffer = {
        getChannelData: vi.fn().mockReturnValue(samples),
      };

      const mockOfflineContext = {
        createOscillator: vi.fn().mockReturnValue({
          type: "triangle",
          frequency: { value: 0 },
          connect: vi.fn(),
          start: vi.fn(),
        }),
        createDynamicsCompressor: vi.fn().mockReturnValue({
          threshold: { value: 0 },
          knee: { value: 0 },
          ratio: { value: 0 },
          reduction: { value: 0 },
          attack: { value: 0 },
          release: { value: 0 },
          connect: vi.fn(),
        }),
        destination: {},
        startRendering: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      const hash = await generateAudioFingerprint(mockOfflineContext as any);
      expect(hash).not.toBeNull();
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("3. Zero collection of personal identifiable information (PII)", () => {
    it("verifies that fingerprint entropy payload contains zero PII fields", () => {
      const safePayload = {
        canvasHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        audioHash: "f4b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b866",
        rendererVendor: "Google Inc. (NVIDIA)",
        colorDepth: 24,
      };

      const check = validateZeroPii(safePayload);
      expect(check.isValid).toBe(true);
      expect(check.violations).toHaveLength(0);
    });

    it("detects and rejects any prohibited PII keys (email, IP, cookies, MAC, name)", () => {
      const badPayloads = [
        { ip: "192.168.1.1" },
        { ip_address: "10.0.0.1" },
        { email: "user@example.com" },
        { user_name: "alice" },
        { cookies: "session=xyz" },
        { mac_address: "00:1A:2B:3C:4D:5E" },
        { latitude: 37.7749, longitude: -122.4194 },
      ];

      for (const payload of badPayloads) {
        const check = validateZeroPii(payload);
        expect(check.isValid).toBe(false);
        expect(check.violations.length).toBeGreaterThan(0);
      }
    });

    it("verifies getPrivacyPreservingFingerprint result flags piiCollected as false", async () => {
      const result = await getPrivacyPreservingFingerprint();
      expect(result.piiCollected).toBe(false);
      expect(result.fingerprintHash).toHaveLength(64);
    });
  });

  describe("4. User opt-out toggle tests", () => {
    it("completely disables fingerprint generation when opted out", async () => {
      expect(getFingerprintOptOut()).toBe(false);

      // Enable user opt-out
      setFingerprintOptOut(true);
      expect(getFingerprintOptOut()).toBe(true);

      const canvasHash = await generateCanvasFingerprint();
      const audioHash = await generateAudioFingerprint();
      const result = await getPrivacyPreservingFingerprint();

      expect(canvasHash).toBeNull();
      expect(audioHash).toBeNull();
      expect(result.fingerprintHash).toBeNull();
      expect(result.canvasHash).toBeNull();
      expect(result.audioHash).toBeNull();
      expect(result.optedOut).toBe(true);
    });

    it("resumes fingerprint generation when opt-out is toggled off", async () => {
      setFingerprintOptOut(true);
      expect(getFingerprintOptOut()).toBe(true);

      setFingerprintOptOut(false);
      expect(getFingerprintOptOut()).toBe(false);

      const result = await getPrivacyPreservingFingerprint();
      expect(result.optedOut).toBe(false);
      expect(result.fingerprintHash).toHaveLength(64);
    });
  });
});
