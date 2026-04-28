/**
 * cc-mock.ts
 * Minimal stubs for the Cocos Creator 'cc' runtime module.
 *
 * Purpose: allows Jest (headless Node.js) to import source files that reference
 * Cocos Creator types and constants without the engine being present.
 * Only the symbols actually used by tested source files need to be stubbed.
 *
 * Current consumers (Sprint 2-6 + Sprint 7 wrappers):
 *  - src/core/input/TouchInputAdapter.ts                (Node, EventTouch, Input)
 *  - src/presentation/cocos/CocosLabel.ts               (Label)
 *  - src/presentation/cocos/CocosButton.ts              (Button — node.on/off + EventType.CLICK)
 *  - src/presentation/cocos/CocosOverlayNode.ts         (Node — active flag)
 *  - src/presentation/audio/CocosAudioChannel.ts        (AudioSource, AudioClip)
 *
 * Expand this file as more engine-coupled source files are brought into the
 * Jest harness. Stubs simulate the cc public surface exactly enough for unit
 * testing — no real engine behaviour.
 */

// ─── Core node + events ─────────────────────────────────────────────────────

/**
 * Stub for cc.Node — supports event subscription (for cc.Button click events)
 * and the `active` property used by CocosOverlayNode for visibility.
 */
export class Node {
  /** cc.Node.active controls visibility + update tick gating in real Cocos. */
  active: boolean = true;

  /** Per-event-type handler registry. Real Cocos has more bookkeeping. */
  private eventHandlers: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  // Loosely-typed signature for compatibility with TouchInputAdapter (uses
  // `(event: EventTouch) => void`) and CocosButton (uses `() => void`).
  on(type: string, handler: (...args: unknown[]) => void, _target?: unknown): void;
  on(type: string, handler: Function, _target?: unknown): void;
  on(type: string, handler: (...args: unknown[]) => void, _target?: unknown): void {
    if (!this.eventHandlers.has(type)) this.eventHandlers.set(type, []);
    this.eventHandlers.get(type)!.push(handler);
  }

  off(type: string, handler: (...args: unknown[]) => void, _target?: unknown): void;
  off(type: string, handler: Function, _target?: unknown): void;
  off(type: string, handler: (...args: unknown[]) => void, _target?: unknown): void {
    const list = this.eventHandlers.get(type);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
  }

  /** Test helper — fires every handler for the given event type. */
  emit(type: string, event?: unknown): void {
    const list = this.eventHandlers.get(type);
    if (list) for (const h of [...list]) h(event);
  }
}

/** Stub for cc.EventTouch — only methods used by TouchInputAdapter. */
export class EventTouch {
  getID(): number {
    return 0;
  }
  getLocation(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }
}

/** cc.Input.EventType — only the touch + click variants used downstream. */
export const Input = {
  EventType: {
    TOUCH_START: 'touch-start',
    TOUCH_MOVE: 'touch-move',
    TOUCH_END: 'touch-end',
    TOUCH_CANCEL: 'touch-cancel',
  } as const,
};

// ─── UI: Label + Button ─────────────────────────────────────────────────────

/**
 * Stub for cc.Label. The real cc.Label has `string`, `fontSize`, `color`, etc.
 * Only `string` is exposed to GRID REAPER's wrappers.
 */
export class Label {
  string: string = '';
}

/**
 * Stub for cc.Button. Real cc.Button has `node`, `clickEvents`, `interactable`.
 * GRID REAPER's CocosButton subscribes to `node.on(Button.EventType.CLICK, ...)`.
 */
export class Button {
  static EventType = {
    CLICK: 'click',
  } as const;

  /** cc.Button.node — the host Node receives the click event. */
  node: Node = new Node();

  /** Whether the button accepts input. Mirrors cc.Button.interactable. */
  interactable: boolean = true;
}

// ─── Audio ──────────────────────────────────────────────────────────────────

/**
 * Stub for cc.AudioClip — opaque handle in Cocos. Tests only need an identity.
 * In real Cocos the clip is loaded via resources.load('path', AudioClip, ...).
 */
export class AudioClip {
  /** Test fixture identifier — mirrors cc.AudioClip.uuid in real engine. */
  readonly _testKey: string;
  constructor(testKey: string = '') {
    this._testKey = testKey;
  }
}

/**
 * Stub for cc.AudioSource. Real Cocos has volume, loop, clip, play(),
 * stop(), playOneShot(clip, volume?), pause(), resume(), etc.
 *
 * Test verification: read `playCalls`, `playOneShotCalls`, etc. arrays.
 */
export class AudioSource {
  clip: AudioClip | null = null;
  volume: number = 1.0;
  loop: boolean = false;

  /** Test inspection — list of clips received via play(). */
  readonly playCalls: AudioClip[] = [];
  /** Test inspection — list of clips received via playOneShot(). */
  readonly playOneShotCalls: Array<{ clip: AudioClip; volume: number }> = [];
  stopCallCount: number = 0;
  pauseCallCount: number = 0;
  resumeCallCount: number = 0;

  play(): void {
    if (this.clip) this.playCalls.push(this.clip);
  }

  stop(): void {
    this.stopCallCount++;
  }

  playOneShot(clip: AudioClip, volume: number = this.volume): void {
    this.playOneShotCalls.push({ clip, volume });
  }

  pause(): void {
    this.pauseCallCount++;
  }

  resume(): void {
    this.resumeCallCount++;
  }
}
