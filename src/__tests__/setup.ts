import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}
(globalThis as any).WebSocket = MockWebSocket;

// Mock canvas
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  setLineDash: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
  font: "",
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  textBaseline: "alphabetic",
  textAlign: "start",
  shadowColor: "",
  shadowBlur: 0,
});
