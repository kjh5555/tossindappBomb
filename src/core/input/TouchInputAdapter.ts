import { Node, EventTouch, Input } from 'cc';
import type { PlayerId } from '../types/Domain';
import type { IMovementHandler } from './IMovementHandler';
import type { IEventBus } from '../events/IEventBus';
import type { IFrameClock } from '../time/IFrameClock';
import { angleToDirection8, MOVE_REPEAT, type Direction8 } from '../player/Direction8';

/**
 * TouchInputAdapter.ts
 * Translates Cocos Creator touch events into movement intents and tap events.
 *
 * Implements: design/gdd/touch-input.md
 * Story: TouchInput story-001 (dead zone, multi-touch, tap), story-002 (direction + MOVE_REPEAT)
 *
 * AC coverage:
 *  AC-TI-1  IMovementHandler interface forwarding
 *  AC-TI-2  Constructor signature
 *  AC-TI-3  attachToNode / detachFromNode
 *  AC-TI-4  JOY_THRESHOLD dead zone (18 px)
 *  AC-TI-5  Multi-touch guard
 *  AC-TI-6  Tap detection → TAP_DETECTED
 *  AC-TI-7  Drag suppresses TAP_DETECTED
 *  AC-TI-8  angleToDirection8 (imported from Direction8.ts)
 *  AC-TI-9  First TOUCH_MOVE immediately calls onMoveIntent
 *  AC-TI-10 MOVE_REPEAT 0.22s repeat timer
 *  AC-TI-11 Direction change resets timer, fires immediately
 *  AC-TI-12 TOUCH_END stops MOVE_REPEAT
 *
 * @example
 *   const adapter = new TouchInputAdapter(handler, bus, clock, 'player1');
 *   adapter.attachToNode(gridNode);
 *   // teardown:
 *   adapter.detachFromNode(gridNode);
 */

/**
 * Minimum joystick displacement (px) before a move intent is fired.
 * Re-exported here so adapter is self-contained; canonical value lives in Direction8.ts.
 */
export const JOY_THRESHOLD = 18; // px

export { MOVE_REPEAT } from '../player/Direction8';

export class TouchInputAdapter {
  private activeTouchId: number | null = null;
  private startPos: { x: number; y: number } = { x: 0, y: 0 };
  private lastMoveAt: number = -Infinity;
  private lastDirection: Direction8 | null = null;

  /**
   * @param handler  - Receives directional move intents (IMovementHandler).
   * @param bus      - Event bus for emitting TAP_DETECTED.
   * @param clock    - Frame clock for MOVE_REPEAT timing and tap timestamps.
   * @param playerId - The player whose input this adapter represents.
   */
  constructor(
    private readonly handler: IMovementHandler,
    private readonly bus: IEventBus,
    private readonly clock: IFrameClock,
    private readonly playerId: PlayerId,
  ) {}

  /**
   * Register all touch listeners on the given node.
   *
   * @param node - Cocos Creator Node to listen on.
   */
  attachToNode(node: Node): void {
    node.on(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
    node.on(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
    node.on(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
    node.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
  }

  /**
   * Remove all touch listeners previously registered on the given node.
   *
   * @param node - The same node passed to attachToNode.
   */
  detachFromNode(node: Node): void {
    node.off(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
    node.off(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
    node.off(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
    node.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
  }

  // ---------------------------------------------------------------------------
  // Private touch handlers
  // ---------------------------------------------------------------------------

  private onTouchStart(event: EventTouch): void {
    if (this.activeTouchId !== null) return; // AC-TI-5: multi-touch guard
    this.activeTouchId = event.getID();
    const pos = event.getLocation();
    this.startPos = { x: pos.x, y: pos.y };
    this.lastMoveAt = -Infinity; // AC-TI-9: first TOUCH_MOVE always fires
    this.lastDirection = null;
  }

  private onTouchMove(event: EventTouch): void {
    if (event.getID() !== this.activeTouchId) return; // AC-TI-5

    const pos = event.getLocation();
    const dx = pos.x - this.startPos.x;
    const dy = pos.y - this.startPos.y;
    const magnitude = Math.hypot(dx, dy);

    if (magnitude < JOY_THRESHOLD) return; // AC-TI-4: dead zone

    // AC-TI-8: Cocos Y-axis is inverted vs. math convention, so negate dy
    const angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
    const direction = angleToDirection8(angleDeg);

    const now = this.clock.now();
    const dirChanged = direction !== this.lastDirection; // AC-TI-11
    const repeatElapsed = now - this.lastMoveAt >= MOVE_REPEAT; // AC-TI-10

    if (dirChanged || repeatElapsed) {
      this.handler.onMoveIntent(this.playerId, direction, magnitude);
      this.lastMoveAt = now;
      this.lastDirection = direction;
    }
  }

  private onTouchEnd(event: EventTouch): void {
    if (event.getID() !== this.activeTouchId) return; // AC-TI-5

    const pos = event.getLocation();
    const dx = pos.x - this.startPos.x;
    const dy = pos.y - this.startPos.y;
    const magnitude = Math.hypot(dx, dy);

    if (magnitude < JOY_THRESHOLD) {
      // AC-TI-6: tap detected
      this.bus.emit('TAP_DETECTED', {
        pos: { x: pos.x, y: pos.y },
        timestamp: this.clock.now(),
      });
    }
    // AC-TI-7: magnitude ≥ JOY_THRESHOLD → drag; TAP_DETECTED suppressed

    this.lastDirection = null; // AC-TI-12: end MOVE_REPEAT on touch release
    this.activeTouchId = null;
  }
}
