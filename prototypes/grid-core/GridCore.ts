// PROTOTYPE - NOT FOR PRODUCTION
// Questions:
//   1. Is T_warn=1.8s enough reading time? ("읽으면 이긴다" pillar)
//   2. 8-direction swipe recognition rate ≥85%? (OQ-PM-1)
//   3. Does MOVE_TWEEN_DURATION=0.1s feel instant? (OQ-PM-3)
//   4. Is the core loop fun?
// Date: 2026-04-21

import {
    _decorator, Component, Node, Graphics, Color, Vec2,
    EventTouch, view,
} from 'cc';

const { ccclass } = _decorator;

// ─── Tuning ───────────────────────────────────────────────────────────────────
const T_W1            = 1.0;   // Warning1 duration (s)
const T_W2            = 0.6;   // Warning2 duration (s)
const T_IM            = 0.2;   // Imminent duration (s)
const T_EX            = 0.5;   // Exploded (danger zone) duration (s)
const TWEEN           = 0.1;   // Move tween duration (s) — OQ-PM-3
const MIN_SWIPE       = 20;    // Minimum swipe px — OQ-PM-1
const SPAWN_INTERVAL  = 3.0;   // Seconds between pattern spawns
const GRID            = 8;

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
    idle:   new Color( 26,  26,  46, 255),  // Void Black #1A1A2E
    warn1:  new Color(255, 200,   0, 255),  // Yellow
    warn2:  new Color(255, 100,   0, 255),  // Orange
    imm:    new Color(255,  30,  30, 255),  // Red
    exp:    new Color(180,   0,   0, 255),  // Dark Red
    line:   new Color( 50,  50,  80, 128),  // Grid lines
    player: new Color(255, 255, 255, 255),  // White
    cyan:   new Color(  0, 229, 204, 255),  // Danger Cyan #00E5CC
    dead:   new Color(100, 100, 100, 180),  // Dead gray
    deadX:  new Color(255,  44,  44, 200),  // Death X mark
};

// ─── Direction table ──────────────────────────────────────────────────────────
// 0=R  1=DR  2=D  3=DL  4=L  5=UL  6=U  7=UR
const DR = [ 0, +1, +1, +1,  0, -1, -1, -1];
const DC = [+1, +1,  0, -1, -1, -1,  0, +1];
// Visual angles in degrees (Cocos Y-up): 0=right, 90=up, 180=left, -90=down
const DIR_ANGLE = [0, -45, -90, -135, 180, 135, 90, 45];

// ─── Hardcoded patterns ───────────────────────────────────────────────────────
const PATTERNS: [number, number][][] = [
    // P1: Horizontal sweep — row 3
    [[3,0],[3,1],[3,2],[3,3],[3,4],[3,5],[3,6],[3,7]],
    // P2: Vertical sweep — col 4
    [[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4]],
    // P3: Plus cross — row 3 + col 3
    [[3,0],[3,1],[3,2],[3,3],[3,4],[3,5],[3,6],[3,7],
     [0,3],[1,3],[2,3],[4,3],[5,3],[6,3],[7,3]],
    // P4: Diagonal — top-left to bottom-right
    [[0,0],[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7]],
    // P5: Island clusters — three 2×2 blocks
    [[1,1],[1,2],[2,1],[2,2],[5,5],[5,6],[6,5],[6,6],[3,3],[3,4],[4,3],[4,4]],
];

type CellState = 'IDLE' | 'W1' | 'W2' | 'IM' | 'EX';

@ccclass('GridCore')
export class GridCore extends Component {
    private _g!: Graphics;
    private _cs = 0;       // cell pixel size
    private _ox = 0;       // grid left edge X (node-local)
    private _oy = 0;       // grid bottom edge Y (node-local)

    // Grid state
    private _state: CellState[][] = [];
    private _timer: number[][] = [];

    // Player
    private _pr = 4; private _pc = 4;  // logical row/col
    private _alive = true;
    private _vx = 0; private _vy = 0;  // visual position
    private _fx = 0; private _fy = 0;  // tween from
    private _tx2 = 0; private _ty2 = 0; // tween to
    private _tt = 1.0;                  // tween progress (1=done)
    private _lastDir = 0;
    private _buf: number | null = null;

    // Touch
    private _touchStart: Vec2 | null = null;

    // Spawner
    private _spawnTimer = 1.5;
    private _patternIdx = 0;

    start() {
        // Create child node for Graphics (avoids Canvas component conflicts)
        const gNode = new Node('gfx');
        this.node.addChild(gNode);
        this._g = gNode.addComponent(Graphics);

        // Layout: 88% of the smaller screen dimension
        const sz = view.getVisibleSize();
        const gridPx = Math.min(sz.width, sz.height) * 0.88;
        this._cs = gridPx / GRID;
        this._ox = -gridPx * 0.5;
        this._oy = -gridPx * 0.5;

        // Init grid
        for (let r = 0; r < GRID; r++) {
            this._state[r] = Array(GRID).fill('IDLE') as CellState[];
            this._timer[r] = Array(GRID).fill(0) as number[];
        }

        this._vx = this._cx(this._pc);
        this._vy = this._cy(this._pr);

        // Touch listeners on root node
        this.node.on(Node.EventType.TOUCH_START,  this._onTouchStart,  this);
        this.node.on(Node.EventType.TOUCH_END,    this._onTouchEnd,    this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd,    this);
    }

    // Cell center X in node-local space
    private _cx(col: number): number {
        return this._ox + col * this._cs + this._cs * 0.5;
    }

    // Cell center Y — row 0 is top (highest Y value)
    private _cy(row: number): number {
        return this._oy + (GRID - 1 - row) * this._cs + this._cs * 0.5;
    }

    private _onTouchStart(e: EventTouch): void {
        this._touchStart = e.getLocation().clone();
    }

    private _onTouchEnd(e: EventTouch): void {
        if (!this._touchStart) return;
        const p = e.getLocation();
        const dx = p.x - this._touchStart.x;
        const dy = p.y - this._touchStart.y;
        this._touchStart = null;

        if (!this._alive) {
            this._reset();
            return;
        }

        if (Math.hypot(dx, dy) < MIN_SWIPE) return; // EC-5: ignore micro-swipes

        // Map swipe angle to 8 directions (F-1)
        // atan2(dy, dx): 0=right, 90=up, 180/-180=left, -90=down (Cocos Y-up)
        let a = Math.atan2(dy, dx) * 180 / Math.PI;
        if (a < 0) a += 360;
        // dir: 0=R(0°), 7=UR(45°), 6=U(90°), 5=UL(135°), 4=L(180°), 3=DL(225°), 2=D(270°), 1=DR(315°)
        const dir = (8 - Math.round(a / 45)) % 8;
        this._tryMove(dir);
    }

    private _tryMove(dir: number): void {
        const nr = this._pr + DR[dir];
        const nc = this._pc + DC[dir];

        // F-3: boundary check
        if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) {
            // V-6: boundary bump (visual only) — not implemented in prototype
            return;
        }

        if (this._tt < 1.0) {
            this._buf = dir; // PM-4: buffer (overwrite)
            return;
        }

        this._exec(dir, nr, nc);
    }

    private _exec(dir: number, nr: number, nc: number): void {
        this._lastDir = dir;
        this._fx = this._vx; this._fy = this._vy;
        this._tx2 = this._cx(nc); this._ty2 = this._cy(nr);
        this._tt = 0;

        // PM-2: logical coord changes IMMEDIATELY
        this._pr = nr; this._pc = nc;

        // Exploded cell → immediate death (착지 즉사)
        if (this._state[nr][nc] === 'EX') {
            this._alive = false;
        }
    }

    private _reset(): void {
        this._pr = 4; this._pc = 4;
        this._alive = true;
        this._tt = 1.0;
        this._buf = null;
        this._vx = this._cx(4); this._vy = this._cy(4);
        for (let r = 0; r < GRID; r++) {
            this._state[r].fill('IDLE');
            this._timer[r].fill(0);
        }
        this._spawnTimer = 1.5;
    }

    private _spawnPattern(): void {
        for (const [r, c] of PATTERNS[this._patternIdx % PATTERNS.length]) {
            if (this._state[r][c] === 'IDLE') {
                this._state[r][c] = 'W1';
                this._timer[r][c] = T_W1;
            }
        }
        this._patternIdx++;
    }

    update(dt: number): void {
        // Update move tween (F-4)
        if (this._tt < 1.0) {
            this._tt = Math.min(1.0, this._tt + dt / TWEEN);
            this._vx = this._fx + (this._tx2 - this._fx) * this._tt;
            this._vy = this._fy + (this._ty2 - this._fy) * this._tt;

            // PM-4: execute buffered input when tween completes
            if (this._tt >= 1.0 && this._buf !== null) {
                const b = this._buf; this._buf = null;
                const nr = this._pr + DR[b]; const nc = this._pc + DC[b];
                if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
                    this._exec(b, nr, nc);
                }
            }
        }

        if (!this._alive) { this._draw(); return; }

        // Cell state machine
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const s = this._state[r][c];
                if (s === 'IDLE') continue;
                this._timer[r][c] -= dt;
                if (this._timer[r][c] > 0) continue;

                switch (s) {
                    case 'W1':
                        this._state[r][c] = 'W2'; this._timer[r][c] = T_W2; break;
                    case 'W2':
                        this._state[r][c] = 'IM'; this._timer[r][c] = T_IM; break;
                    case 'IM':
                        this._state[r][c] = 'EX'; this._timer[r][c] = T_EX;
                        // Player on this cell → death (처리 순서: 이동→폭발 판정)
                        if (this._pr === r && this._pc === c) this._alive = false;
                        break;
                    case 'EX':
                        this._state[r][c] = 'IDLE'; this._timer[r][c] = 0; break;
                }
            }
        }

        // Pattern spawner
        this._spawnTimer -= dt;
        if (this._spawnTimer <= 0) {
            this._spawnPattern();
            this._spawnTimer = SPAWN_INTERVAL;
        }

        this._draw();
    }

    private _draw(): void {
        const g = this._g;
        const cs = this._cs;
        const hs = cs * 0.5 - 1.5; // half cell size minus padding

        g.clear();

        // Draw cells
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const cx = this._cx(c);
                const cy = this._cy(r);
                const s = this._state[r][c];

                const col = s === 'W1' ? C.warn1
                          : s === 'W2' ? C.warn2
                          : s === 'IM' ? C.imm
                          : s === 'EX' ? C.exp
                          : C.idle;

                g.fillColor = col;
                g.rect(cx - hs, cy - hs, hs * 2, hs * 2);
                g.fill();

                g.strokeColor = C.line;
                g.lineWidth = 1;
                g.rect(cx - hs, cy - hs, hs * 2, hs * 2);
                g.stroke();
            }
        }

        // Draw player
        if (this._alive) {
            const px = this._vx; const py = this._vy;
            const ps = cs * 0.3; // half-size of player square (60% cell = 0.3 half)

            // Player body outline
            g.strokeColor = C.player;
            g.lineWidth = 2;
            g.rect(px - ps, py - ps, ps * 2, ps * 2);
            g.stroke();

            // Direction indicator triangle
            const rad = DIR_ANGLE[this._lastDir] * Math.PI / 180;
            const ts = cs * 0.175;
            const tipX = px + Math.cos(rad) * ts * 1.8;
            const tipY = py + Math.sin(rad) * ts * 1.8;
            const la = rad + 2.4; const ra = rad - 2.4; // ~137.5°

            g.fillColor = C.cyan;
            g.moveTo(tipX + Math.cos(rad) * ts, tipY + Math.sin(rad) * ts);
            g.lineTo(tipX + Math.cos(la) * ts * 0.55, tipY + Math.sin(la) * ts * 0.55);
            g.lineTo(tipX + Math.cos(ra) * ts * 0.55, tipY + Math.sin(ra) * ts * 0.55);
            g.close();
            g.fill();
        } else {
            // Dead: gray outline at logical position + X
            const px = this._cx(this._pc);
            const py = this._cy(this._pr);
            const ps = cs * 0.3;

            g.strokeColor = C.dead;
            g.lineWidth = 1;
            g.rect(px - ps, py - ps, ps * 2, ps * 2);
            g.stroke();

            g.strokeColor = C.deadX;
            g.lineWidth = 2;
            g.moveTo(px - ps * 0.55, py - ps * 0.55);
            g.lineTo(px + ps * 0.55, py + ps * 0.55);
            g.stroke();
            g.moveTo(px + ps * 0.55, py - ps * 0.55);
            g.lineTo(px - ps * 0.55, py + ps * 0.55);
            g.stroke();
        }
    }
}
