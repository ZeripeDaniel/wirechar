/**
 * Pixel art character renderer.
 * Character is 16×24 "logical pixels", each rendered at PIXEL_SIZE screen pixels.
 */

const PIXEL_SIZE = 4;

// Color palette
const P = {
  _: null,           // transparent
  ' ': null,         // transparent (space)
  k: '#0d0d12',      // outline/very dark
  h: '#2a1800',      // dark hair
  H: '#5c3010',      // hair
  s: '#f5c888',      // skin
  S: '#d4a060',      // skin shadow
  e: '#080820',      // eye dark
  w: '#fffef5',      // eye white
  t: '#0d4fa0',      // hoodie blue dark
  T: '#1a6ccc',      // hoodie blue
  B: '#2288ee',      // hoodie bright
  b: '#8cc8ff',      // hoodie highlight
  p: '#151830',      // pants
  P: '#20254a',      // pants lighter
  o: '#0a0a10',      // shoe
  O: '#1e1e2e',      // shoe lighter
  g: '#3a3a5a',      // belt/gray
  a: '#ff9900',      // antenna orange
  A: '#ffcc44',      // antenna glow
  r: '#ff3355',      // red accent
  n: '#55ff99',      // green accent
  M: '#c06040',      // mouth
  m: '#884422',      // mouth dark
  K: '#1a1a2a',      // dark outline alt
  W: '#fffef5',      // alias for eye white
  D: '#1a6ccc',      // alias hoodie blue
  d: '#0d4fa0',      // alias hoodie dark
  // Defense gear
  q: '#b8c5d6',      // shield light steel
  Q: '#5a6878',      // shield dark steel
  R: '#3a4452',      // shield rim
  F: '#e8e8f0',      // spear tip silver
  y: '#a05a20',      // spear shaft wood
  Y: '#6e3c10',      // spear shaft dark
  X: '#ff3344',      // hurt red flash
  x: '#cc0022',      // hurt red dark
  v: '#ffeeaa',      // sweat / tear highlight
  V: '#ffcc44',      // sweat / tear shadow
};

// Character frames: [state][frameIndex] → 24-row × 16-col pixel data
// Each char maps to a palette key above
const FRAMES = {
  idle: [
    // frame 0
    [
      '____hHHHHHh_____',
      '___hHHHHHHHh____',
      '__khHssssssHhk__',
      '__khHsweswsHhk__',  // eyes: w=white, e=dark pupil
      '__khHsweswsHhk__',
      '__khHssssssSHk__',
      '__khHssMssssHk__',  // M = mouth area (use S for shadow)
      '__khHssssssHhk__',
      '___kSSSSSSSkk___',
      '____ssssss______',
      '___kTTTTTTTk____',
      '__kTBBBBBBBTk___',
      '_ksTBBbBBBBTsk__',  // s = arm skin
      '_ksTBBBBBBBTsk__',
      '_ksTBTTTTTBTsk__',
      '__kTTTTTTTTTk___',
      '___kTTgggTTk____',
      '___kPPPPPPPk____',
      '___kPPkkkPPk____',
      '___kPP___PPk____',
      '___kPP___PPk____',
      '__koPP___PPoK___',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
    ],
    // frame 1 (arms slightly up)
    [
      '____hHHHHHh_____',
      '___hHHHHHHHh____',
      '__khHssssssHhk__',
      '__khHsweswsHhk__',
      '__khHsweswsHhk__',
      '__khHssssssSHk__',
      '__khHssMssssHk__',
      '__khHssssssHhk__',
      '___kSSSSSSSkk___',
      '____ssssss______',
      '___kTTTTTTTk____',
      '__kTBBBBBBBTk___',
      '_kksTBBbBBBTskk_',
      '_ksTTBBBBBBTTsk_',
      '_ksTBTTTTTBTsk__',
      '__kTTTTTTTTTk___',
      '___kTTgggTTk____',
      '___kPPPPPPPk____',
      '___kPPkkkPPk____',
      '___kPP___PPk____',
      '___kPP___PPk____',
      '__koPP___PPoK___',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
    ],
  ],

  receive: [
    // frame 0 (arms raised, excited)
    [
      '____hHHHHHh_____',
      '___hHHHHHHHh____',
      '__khHssssssHhk__',
      '__khHswwswwHhk__',  // wide eyes
      '__khHswwswwHhk__',
      '__khHsssssssHk__',
      '__khHssssssHhk__',
      '__khHssMssssHk__',
      '___kSSSSSSSkk___',
      '____ssssss______',
      '___kTTTTTTTk____',
      '__kTBBBBBBBTk___',
      'ksTTBBbBBBBTTsk_',  // arms raised wide
      'ksTTBBBBBBBTTsk_',
      '_kkTBTTTTTBTkk__',
      '__kTTTTTTTTTk___',
      '___kTTgggTTk____',
      '___kPPPPPPPk____',
      '___kPPkkkPPk____',
      '___kPP___PPk____',
      '___kPP___PPk____',
      '__koPP___PPoK___',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
    ],
    // frame 1 (arms raised higher)
    [
      '_ksk_hHHHHHh____',  // arms at top
      '_ksk_hHHHHHHh___',
      '__khHssssssHhk__',
      '__khHswwswwHhk__',
      '__khHswwswwHhk__',
      '__khHsssssssHk__',
      '__khHssssssHhk__',
      '__khHssMssssHk__',
      '___kSSSSSSSkk___',
      '____ssssss______',
      '___kTTTTTTTk____',
      '__kTBBBBBBBTk___',
      'kksTBBbBBBBTskk_',
      '_ksTBBBBBBBTsk__',
      '__kTBTTTTTBTk___',
      '__kTTTTTTTTTk___',
      '___kTTgggTTk____',
      '___kPPPPPPPk____',
      '___kPPkkkPPk____',
      '___kPP___PPk____',
      '___kPP___PPk____',
      '__koPP___PPoK___',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
    ],
  ],

  send: [
    // frame 0 (leaning forward, arms out front)
    [
      '____hHHHHHh_____',
      '___hHHHHHHHh____',
      '__khHssssssHhk__',
      '__khHsweswsHhk__',
      '__khHsweswsHhk__',
      '__khHssssssSHk__',
      '__khHssssssHhk__',
      '__khHssMssssHk__',
      '___kSSSSSSSkk___',
      '____ssssss______',
      '__kTTTTTTTTTk___',
      '_kTBBBBBBBBBTk__',
      'ksTTBBbBBBBBTTsk',  // arms stretched forward
      'ksTTTBBBBBBTTTsk',
      '_kkTTBTTTTBTTkk_',
      '__kTTTTTTTTTTk__',
      '___kTTgggTTk____',
      '___kPPPPPPPk____',
      '___kPPkkkPPk____',
      '___kPP___PPk____',
      '___kPP___PPk____',
      '__koPP___PPoK___',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
    ],
    // frame 1 (push forward)
    [
      '____hHHHHHh_____',
      '___hHHHHHHHh____',
      '__khHssssssHhk__',
      '__khHsweswsHhk__',
      '__khHsweswsHhk__',
      '__khHssssssSHk__',
      '__khHssssssHhk__',
      '__khHssMssssHk__',
      '___kSSSSSSSkk___',
      '____ssssss______',
      '__kTTTTTTTTTk___',
      '_kTBBBBBBBBBTk__',
      'ssTTBBbBBBBBTTss',
      'ssTTTBBBBBBTTTss',
      '_kkTTBTTTTBTTkk_',
      '___kTTTTTTTTk___',
      '___kTTgggTTk____',
      '___kPPPPPPPk____',
      '___kPPkkkPPk____',
      '___kPP___PPk____',
      '___kPP___PPk____',
      '__koPP___PPoK___',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
    ],
  ],

  // ── Defense states ──────────────────────────────────────────────────
  defense_idle: [
    // frame 0 — facing forward, shield on left arm, spear vertical on right
    [
      '____hHHHHHh___F_',
      '___hHHHHHHHh__F_',
      '__khHssssssHhkF_',
      '__khHsweswsHhyF_',
      '__khHsweswsHhy__',
      '__khHssssssSHy__',
      '__khHssssssshy__',
      '___kSSSSSSSky___',
      '____ssssssssy___',
      '___kTTTTTTTky___',
      'qQQTBBBBBBBTy___',
      'qQQTBBbBBBBTy___',
      'qQQTBBBBBBBTy___',
      'qQQTBTTTTTBTy___',
      'qQQTTTTTTTTky___',
      '_QQkTTgggTTky___',
      '___kPPPPPPPky___',
      '___kPPkkkPPky___',
      '___kPP___PPky___',
      '___kPP___PPky___',
      '__koPP___PPokY__',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
      '________________',
    ],
    // frame 1 — slight bob (spear lifted 1px)
    [
      '____hHHHHHh__F__',
      '___hHHHHHHHh_F__',
      '__khHssssssHhF__',
      '__khHsweswsHhy__',
      '__khHsweswsHhy__',
      '__khHssssssSHy__',
      '__khHssssssshy__',
      '___kSSSSSSSky___',
      '____ssssssssy___',
      '___kTTTTTTTky___',
      'qQQTBBBBBBBTy___',
      'qQQTBBbBBBBTy___',
      'qQQTBBBBBBBTy___',
      'qQQTBTTTTTBTy___',
      'qQQTTTTTTTTky___',
      '_QQkTTgggTTky___',
      '___kPPPPPPPky___',
      '___kPPkkkPPky___',
      '___kPP___PPky___',
      '___kPP___PPky___',
      '__koPP___PPokY__',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
      '________________',
    ],
  ],

  hurt: [
    // frame 0 — hit, eyes squeezed, tear, slight recoil, red flash
    [
      '____hHHHHHh___F_',
      '___hHHHHHHHh__F_',
      '__khHssssssHhkF_',
      '__khHsxxsxxHhyF_',  // x = scrunched eyes (red)
      '__khHsxxsxxHhy__',
      '__khHssVssssSHy_',  // V = tear drop
      '__khHssvssssshy_',  // v = tear continued
      '___kSSSmSSSky___',  // m = frowning mouth
      '____ssssssssy___',
      '___kTTTTTTTky___',
      'qQQTBBBBBBBTy___',
      'qQQXBBbBBBBXy___',  // X = body red flash (hit)
      'qQQXBBBBBBBXy___',
      'qQQXBTTTTTBXy___',
      'qQQXTTTTTTTXy___',
      '_QQkTTgggTTky___',
      '___kPPPPPPPky___',
      '___kPPkkkPPky___',
      '___kPP___PPky___',
      '___kPP___PPky___',
      '__koPP___PPokY__',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
      '________________',
    ],
    // frame 1 — recoil deeper, more pronounced
    [
      '___hHHHHHh____F_',
      '__hHHHHHHHh___F_',
      '_khHssssssHhk_F_',
      '_khHsxxsxxHhkyF_',
      '_khHsxxsxxHhky__',
      '_khHssVssssShky_',
      '_khHssvssssshky_',
      '__kSSSmSSSkky___',
      '___ssssssssky___',
      '__kXXXXXXXky____',  // body all red
      'qQQXXXXXXXXky___',
      'qQQXXXbXXXXky___',
      'qQQXXXXXXXXky___',
      'qQQXTTTTTBXky___',
      'qQQTTTTTTTTky___',
      '_QQkTTgggTTky___',
      '___kPPPPPPPky___',
      '___kPPkkkPPky___',
      '___kPP___PPky___',
      '___kPP___PPky___',
      '__koPP___PPokY__',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
      '________________',
    ],
  ],

  block: [
    // frame 0 — shield raised in front, mostly covers body
    [
      '____hHHHHHh_____',
      '___hHHHHHHHh____',
      '__khHssssssHhk__',
      '__khHsweswsHhk__',
      '_qQQQQQQQQQQQQQ_',  // shield rim top
      '_QqqqqqqqqqqqqQ_',
      '_QqQQQQQQQQQQqQ_',
      '_QqQqqqqqqqqQqQ_',
      '_QqQqqqRRqqqQqQ_',  // R = central boss
      '_QqQqqRRRRqqQqQ_',
      '_QqQqqRRRRqqQqQ_',
      '_QqQqqqRRqqqQqQ_',
      '_QqQqqqqqqqqQqQ_',
      '_QqQQQQQQQQQQqQ_',
      '_QqqqqqqqqqqqqQ_',
      '_QQQQQQQQQQQQQQ_',  // shield rim bottom
      '___kPPPPPPPk____',
      '___kPPkkkPPk____',
      '___kPP___PPk____',
      '___kPP___PPk____',
      '__koPP___PPok___',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
      '________________',
    ],
    // frame 1 — shield vibrates (impact) slight shift
    [
      '____hHHHHHh_____',
      '___hHHHHHHHh____',
      '__khHssssssHhk__',
      '__khHseesseHhk__',  // determined eyes (single pixel)
      'qQQQQQQQQQQQQQ__',
      'QqqqqqqqqqqqqQ__',
      'QqQQQQQQQQQQqQ__',
      'QqQqqqqqqqqQqQ__',
      'QqQqqXRRXqqQqQ__',  // X = impact flash on boss
      'QqQqXRRRRXqQqQ__',
      'QqQqXRRRRXqQqQ__',
      'QqQqqXRRXqqQqQ__',
      'QqQqqqqqqqqQqQ__',
      'QqQQQQQQQQQQqQ__',
      'QqqqqqqqqqqqqQ__',
      'QQQQQQQQQQQQQQ__',
      '___kPPPPPPPk____',
      '___kPPkkkPPk____',
      '___kPP___PPk____',
      '___kPP___PPk____',
      '__koPP___PPok___',
      '__koOO___OOok___',
      '__koOOk_kOOok___',
      '________________',
    ],
  ],
};

// Glow aura colors per state
const STATE_GLOW = {
  idle: null,
  receive: 'rgba(80, 180, 255, 0.35)',
  send: 'rgba(255, 140, 50, 0.35)',
  defense_idle: 'rgba(180, 200, 220, 0.25)',
  hurt: 'rgba(255, 50, 80, 0.55)',
  block: 'rgba(140, 180, 255, 0.45)',
};

export class Character {
  constructor(x, y) {
    this.x = x;       // center x
    this.y = y;       // center y
    this.state = 'idle';
    this.frame = 0;
    this.frameTimer = 0;
    this.stateTimer = 0;
    this.bobOffset = 0;
    this.bobPhase = 0;
    this.glowIntensity = 0;
    this.targetGlow = 0;

    // Width and height in screen pixels
    this.W = 16 * PIXEL_SIZE;
    this.H = 24 * PIXEL_SIZE;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.frame = 0;
    this.frameTimer = 0;
    this.stateTimer = 0;
    this.targetGlow = state !== 'idle' ? 1 : 0;
    this.shakeAmount = (state === 'hurt') ? 6 : 0;
  }

  // Defense mode toggle — switches base state between idle / defense_idle
  setDefenseMode(on) {
    this.defenseMode = !!on;
    const target = this._baseState();
    if (!this._isTransient()) this.setState(target);
  }

  // Mark sustained attack (confirmed >= 60s). Character holds 'block' as base state.
  setSustainedBlock(on) {
    this.sustainedBlock = !!on;
    if (!this._isTransient()) this.setState(this._baseState());
  }

  _baseState() {
    if (this.sustainedBlock) return 'block';
    if (this.defenseMode) return 'defense_idle';
    return 'idle';
  }

  _isTransient() {
    // States that should auto-return to base after their duration
    return this.state === 'receive' || this.state === 'send' || this.state === 'hurt';
  }

  update(dt) {
    // Bob animation
    this.bobPhase += dt * 0.002;
    this.bobOffset = Math.sin(this.bobPhase) * 2;

    // Frame animation
    const isBase = this.state === 'idle' || this.state === 'defense_idle' || this.state === 'block';
    const fps = isBase ? 4 : (this.state === 'hurt' ? 10 : 8);
    this.frameTimer += dt;
    if (this.frameTimer >= 1000 / fps) {
      this.frameTimer = 0;
      const frames = FRAMES[this.state] || FRAMES.idle;
      this.frame = (this.frame + 1) % frames.length;
    }

    // Auto-return from transient states (receive / send / hurt) to current base state
    if (this._isTransient()) {
      this.stateTimer += dt;
      const duration = this.state === 'hurt' ? 450 : 600;
      if (this.stateTimer > duration) {
        this.setState(this._baseState());
      }
    } else if (this.state !== this._baseState()) {
      // Snap to current base if it changed (e.g. defenseMode toggled, sustainedBlock changed)
      this.setState(this._baseState());
    }

    // Shake decay
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 0.02);
    }

    // Glow lerp
    const glowSpeed = 0.008;
    if (this.glowIntensity < this.targetGlow) {
      this.glowIntensity = Math.min(this.targetGlow, this.glowIntensity + glowSpeed * dt);
    } else {
      this.glowIntensity = Math.max(this.targetGlow, this.glowIntensity - glowSpeed * dt);
    }
  }

  draw(ctx) {
    const frames = FRAMES[this.state] || FRAMES.idle;
    const pixelData = frames[this.frame % frames.length];
    if (!pixelData) return;

    const shakeX = this.shakeAmount > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    const shakeY = this.shakeAmount > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    const drawX = Math.round(this.x - this.W / 2 + shakeX);
    const drawY = Math.round(this.y - this.H / 2 + this.bobOffset + shakeY);

    // Draw glow aura
    const glowColor = STATE_GLOW[this.state];
    if (glowColor && this.glowIntensity > 0.01) {
      const radius = this.W * 0.9 * this.glowIntensity;
      const grad = ctx.createRadialGradient(
        this.x, this.y + 8, radius * 0.1,
        this.x, this.y + 8, radius + 20
      );
      grad.addColorStop(0, glowColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 8, radius + 20, (radius + 20) * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw each pixel
    for (let row = 0; row < pixelData.length; row++) {
      const rowStr = pixelData[row];
      for (let col = 0; col < rowStr.length; col++) {
        const ch = rowStr[col];
        const color = P[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(
          drawX + col * PIXEL_SIZE,
          drawY + row * PIXEL_SIZE,
          PIXEL_SIZE,
          PIXEL_SIZE
        );
      }
    }

    // Scanline overlay on character for retro effect
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let row = 0; row < this.H; row += 2) {
      ctx.fillRect(drawX, drawY + row, this.W, 1);
    }
  }

  // Returns screen-space center position
  get centerX() { return this.x; }
  get centerY() { return this.y + this.bobOffset; }
}
