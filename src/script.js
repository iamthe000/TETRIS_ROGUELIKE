// --- Audio System ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let nextSfxTime = 0;
const playSfx = (type) => {
    const now = audioCtx.currentTime;
    if (now < nextSfxTime) return;
    nextSfxTime = now + 0.05;
    if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        if (type === 'move') { osc.frequency.setValueAtTime(300, now); osc.type = 'triangle'; gain.gain.value = 0.05; osc.stop(now + 0.05); }
        else if (type === 'drop') { osc.frequency.setValueAtTime(150, now); osc.type = 'square'; gain.gain.value = 0.1; osc.stop(now + 0.1); }
        else if (type === 'lock') { osc.frequency.setValueAtTime(100, now); osc.type = 'sawtooth'; gain.gain.value = 0.1; osc.stop(now + 0.1); }
        else if (type === 'clear') { osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1); gain.gain.value = 0.1; osc.stop(now + 0.2); }
        else if (type === 'damage') { osc.frequency.setValueAtTime(100, now); osc.frequency.linearRampToValueAtTime(50, now + 0.2); osc.type = 'sawtooth'; gain.gain.value = 0.2; osc.stop(now + 0.3); }
        else if (type === 'lvl') { osc.frequency.setValueAtTime(400, now); osc.frequency.linearRampToValueAtTime(800, now + 0.3); osc.type = 'sine'; gain.gain.value = 0.1; osc.stop(now + 0.4); }
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
    } catch(e) {}
};

// --- Game State ---
const canvas = document.getElementById('tetris');
const ctx = canvas.getContext('2d');
const SCALE = 20;
ctx.scale(SCALE, SCALE);

const COLORS = [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'];
const SHAPES = 'ILJOTSZ';

let arena = createMatrix(10, 18);
let player = { 
    pos: {x:0, y:0}, matrix: null, score:0, 
    hp:100, maxHp:100, atk:10, 
    def:0, crit:0, vamp:0, greenHeal:1 // New Stats
};
let enemy = { hp:50, maxHp:50, level:1, timer:0, interval:5000 };

let lastTime = 0;
let dropCounter = 0;
let dropInterval = 1000;
let gameState = 'START'; // START, PLAY, SKILL, GAMEOVER
let inputState = { left: false, right: false, down: false };
let inputTimers = { left: 0, right: 0, down: 0 };

// --- Skill System ---
const SKILLS = [
    { id:'atk1', name:'STR UP', desc:'ATK +3', apply: p => { p.atk += 3; } },
    { id:'atk2', name:'STR UP II', desc:'ATK +5', apply: p => { p.atk += 5; } },
    { id:'hp1', name:'MAX HP UP', desc:'MaxHP +20 & Heal', apply: p => { p.maxHp += 20; p.hp += 20; } },
    { id:'heal', name:'POTION', desc:'Heal 50% HP', apply: p => { p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp*0.5)); } },
    { id:'def', name:'IRON SKIN', desc:'DEF +1 (Reduce Dmg)', apply: p => { p.def += 1; } },
    { id:'crit', name:'LUCKY HIT', desc:'CRIT Chance +10%', apply: p => { p.crit += 0.1; } },
    { id:'vamp', name:'VAMPIRISM', desc:'Heal 2 HP per Line', apply: p => { p.vamp += 2; } },
    { id:'green', name:'NATURE', desc:'Green Heal +2', apply: p => { p.greenHeal += 2; } },
];

function getRandomSkills() {
    const pool = [...SKILLS];
    const result = [];
    for(let i=0; i<3; i++) {
        if(pool.length === 0) break;
        const idx = Math.floor(Math.random() * pool.length);
        result.push(pool[idx]);
        pool.splice(idx, 1);
    }
    return result;
}

// --- Core Functions ---
function createMatrix(w, h) {
    const matrix = [];
    while (h--) matrix.push(new Array(w).fill(0));
    return matrix;
}

function createPiece(type) {
    if (type === 'I') return [[0, 1, 0, 0],[0, 1, 0, 0],[0, 1, 0, 0],[0, 1, 0, 0]];
    if (type === 'L') return [[0, 2, 0],[0, 2, 0],[0, 2, 2]];
    if (type === 'J') return [[0, 3, 0],[0, 3, 0],[3, 3, 0]];
    if (type === 'O') return [[4, 4],[4, 4]];
    if (type === 'Z') return [[5, 5, 0],[0, 5, 5],[0, 0, 0]];
    if (type === 'S') return [[0, 6, 6],[6, 6, 0],[0, 0, 0]];
    if (type === 'T') return [[0, 7, 0],[7, 7, 7],[0, 0, 0]];
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) return true;
        }
    }
    return false;
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(arena, {x:0,y:0});
    
    if (player.matrix && gameState === 'PLAY') {
        const ghostPos = {...player.pos};
        while(!collide(arena, {matrix: player.matrix, pos: ghostPos})) ghostPos.y++;
        ghostPos.y--;
        ctx.globalAlpha = 0.2;
        drawMatrix(player.matrix, ghostPos);
        ctx.globalAlpha = 1.0;
        drawMatrix(player.matrix, player.pos);
    }
}

function drawMatrix(matrix, offset) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                ctx.fillStyle = COLORS[value];
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                ctx.strokeStyle = 'white'; ctx.lineWidth = 0.05;
                ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) arena[y + player.pos.y][x + player.pos.x] = value;
        });
    });
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
    if (dir > 0) matrix.forEach(row => row.reverse()); else matrix.reverse();
}

function playerReset() {
    const pieces = SHAPES;
    player.matrix = createPiece(pieces[pieces.length * Math.random() | 0]);
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    if (collide(arena, player)) {
        gameState = 'GAMEOVER';
        showGameOver();
    }
}

let lockDelay = 0;
function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--; 
        if (lockDelay > 500) {
            merge(arena, player);
            playSfx('lock');
            arenaSweep();
            if(gameState === 'PLAY') playerReset(); // Only reset if still playing (not lvl up)
            lockDelay = 0;
        }
        return true; 
    }
    lockDelay = 0; dropCounter = 0;
    return false;
}

function playerHardDrop() {
    while(!collide(arena, player)) player.pos.y++;
    player.pos.y--; 
    merge(arena, player);
    playSfx('drop');
    arenaSweep();
    if(gameState === 'PLAY') playerReset();
    lockDelay = 0;
}

function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) player.pos.x -= dir;
    else { playSfx('move'); lockDelay = 0; }
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
    playSfx('move');
}

// --- RPG Logic ---
function arenaSweep() {
    let rowCount = 0;
    let greenBlocks = 0;
    outer: for (let y = arena.length -1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) if (arena[y][x] === 0) continue outer;
        
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 3) greenBlocks++;
        }

        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
        rowCount++;
    }
    if (rowCount > 0) {
        playSfx('clear');
        
        // Damage Calc
        let isCrit = Math.random() < player.crit;
        let dmg = Math.floor(player.atk * rowCount * (1 + (rowCount-1)*0.5));
        if (isCrit) dmg *= 2;
        
        // Nature Heal (Green Blocks)
        if (greenBlocks > 0 && player.greenHeal > 0) {
            let heal = greenBlocks * player.greenHeal;
            player.hp = Math.min(player.maxHp, player.hp + heal);
            log(`Nature: +${heal} HP`, 'heal');
        }
        
        // Vampirism
        if (player.vamp > 0) {
            let heal = player.vamp * rowCount;
            player.hp = Math.min(player.maxHp, player.hp + heal);
            log(`Vampire: +${heal} HP`, 'heal');
        }

        player.score += dmg * 10;
        enemy.hp -= dmg;
        log(`${isCrit ? 'CRIT!' : 'Hit'} ${dmg} dmg`, isCrit ? 'crit' : 'dmg');
        
        triggerAnim('enemy-wrapper', 'shake');

        if (enemy.hp <= 0) triggerLevelUp();
        updateUI();
    }
}

function triggerLevelUp() {
    playSfx('lvl');
    gameState = 'SKILL'; // Pause game
    
    // Show Skill Menu
    const list = document.getElementById('skill-list');
    list.innerHTML = '';
    const choices = getRandomSkills();
    
    choices.forEach(skill => {
        const btn = document.createElement('div');
        btn.className = 'skill-card';
        btn.innerHTML = `<div class="skill-title">${skill.name}</div><div class="skill-desc">${skill.desc}</div>`;
        btn.onclick = () => selectSkill(skill);
        list.appendChild(btn);
    });

    document.getElementById('overlay').style.display = 'flex';
    document.getElementById('start-ui').style.display = 'none';
    document.getElementById('skill-menu').style.display = 'flex';
}

function selectSkill(skill) {
    skill.apply(player);
    log(`Learned: ${skill.name}`, 'heal');
    
    // Reset Enemy
    enemy.level++;
    enemy.maxHp = Math.floor(enemy.maxHp * 1.3);
    enemy.hp = enemy.maxHp;
    dropInterval = Math.max(150, dropInterval - 40);
    
    // Resume Game
    document.getElementById('skill-menu').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
    gameState = 'PLAY';
    playerReset();
    updateEnemyVisuals();
    updateUI();
}

function enemyTurn(dt) {
    enemy.timer += dt;
    const nextAtk = Math.max(1500, enemy.interval - (enemy.level * 200));
    
    if (enemy.timer > nextAtk) {
        let dmg = 5 + enemy.level;
        // Defense check
        dmg = Math.max(1, dmg - player.def);
        
        player.hp -= dmg;
        playSfx('damage');
        log(`Took ${dmg} dmg (Def:${player.def})`, 'dmg');
        
        triggerAnim('game-area', 'shake');
        flashDamage();

        if (player.hp <= 0) { gameState = 'GAMEOVER'; showGameOver(); }
        enemy.timer = 0;
        updateUI();
    }
    const remaining = Math.max(0, (nextAtk - enemy.timer)/1000);
    document.getElementById('en-timer').innerText = remaining.toFixed(1);
    
    // Timer Warning
    const bubble = document.getElementById('en-timer-bubble');
    if(remaining <= 1.5) {
        const isRed = (Math.floor(Date.now()/200)%2===0);
        bubble.style.background = isRed ? '#ff4444' : '#fff';
        bubble.style.color = isRed ? '#fff' : '#000';
    } else {
        bubble.style.background = '#fff';
        bubble.style.color = '#000';
    }
}

function log(msg, cls) {
    const el = document.getElementById('log');
    const line = document.createElement('div');
    line.className = 'log-msg ' + (cls||'');
    line.innerText = msg;
    el.prepend(line);
    if(el.children.length > 5) el.removeChild(el.lastChild);
}

function triggerAnim(id, cls) {
    const el = document.getElementById(id);
    el.classList.remove(cls);
    void el.offsetWidth; // trigger reflow
    el.classList.add(cls);
    // Remove class after anim (optional, but good for clean DOM)
    setTimeout(() => el.classList.remove(cls), 500);
}

function flashDamage() {
    const el = document.getElementById('dmg-overlay');
    el.style.opacity = 0.4;
    setTimeout(() => el.style.opacity = 0, 150);
}

function updateEnemyVisuals() {
    const sprite = document.getElementById('enemy-sprite');
    // Remove existing filter/transform to apply new base state
    // But we need to keep the hue/scale as base.
    // The animation 'hit-flash' overrides filter/transform, so after anim it returns to what?
    // It returns to the inline style we set here.
    const hue = ((enemy.level - 1) * 55) % 360; 
    const scale = 1 + Math.min(0.3, (enemy.level - 1) * 0.02);
    sprite.style.filter = `hue-rotate(${hue}deg)`;
    sprite.style.transform = `scale(${scale})`;
}

function updateUI() {
    document.getElementById('hp-val').innerText = player.hp;
    document.getElementById('hp-bar').style.width = (player.hp/player.maxHp*100)+'%';
    document.getElementById('en-hp-val').innerText = Math.max(0, enemy.hp);
    document.getElementById('en-bar').style.width = (enemy.hp/enemy.maxHp*100)+'%';
    document.getElementById('lvl-val').innerText = enemy.level;
    document.getElementById('atk-val').innerText = player.atk;
    document.getElementById('def-val').innerText = player.def;
    document.getElementById('crit-val').innerText = Math.floor(player.crit*100)+'%';
    document.getElementById('vamp-val').innerText = player.vamp;
    document.getElementById('reg-val').innerText = player.greenHeal;
    document.getElementById('score-val').innerText = player.score;
}

function showGameOver() {
    document.getElementById('overlay').style.display = 'flex';
    document.getElementById('start-ui').style.display = 'none';
    document.getElementById('skill-menu').style.display = 'none';
    document.getElementById('game-over-ui').style.display = 'block';
    document.getElementById('res-lvl').innerText = enemy.level;
    document.getElementById('res-scr').innerText = player.score;
}

function startGame() {
    arena.forEach(row => row.fill(0));
    player = { pos: {x:0, y:0}, matrix: null, score:0, hp:100, maxHp:100, atk:10, def:0, crit:0, vamp:0, greenHeal:1 };
    enemy = { hp:50, maxHp:50, level:1, timer:0, interval:5000 };
    dropInterval = 1000;
    
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('log').innerHTML = '';
    
    gameState = 'PLAY';
    playerReset();
    updateEnemyVisuals();
    updateUI();
    lastTime = performance.now(); 
    update();
}

function update(time = 0) {
    if (gameState !== 'PLAY') {
        if(gameState !== 'GAMEOVER') requestAnimationFrame(update); // Keep loop for resume
        return;
    }
    
    if (time === 0) time = performance.now();
    const deltaTime = time - lastTime;
    lastTime = time;

    // --- Controls ---
    const DAS_DELAY = 150; const DAS_SPEED = 50;  
    if (inputState.left) {
        if (inputTimers.left === 0) playerMove(-1);
        inputTimers.left += deltaTime;
        if (inputTimers.left > DAS_DELAY + DAS_SPEED) { playerMove(-1); inputTimers.left -= DAS_SPEED; }
    } else inputTimers.left = 0;

    if (inputState.right) {
        if (inputTimers.right === 0) playerMove(1);
        inputTimers.right += deltaTime;
        if (inputTimers.right > DAS_DELAY + DAS_SPEED) { playerMove(1); inputTimers.right -= DAS_SPEED; }
    } else inputTimers.right = 0;

    if (inputState.down) {
        if (inputTimers.down === 0) playerDrop();
        inputTimers.down += deltaTime;
        if (inputTimers.down > 50) { playerDrop(); inputTimers.down = 0; }
    } else inputTimers.down = 0;

    // --- Game Logic ---
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) playerDrop();
    
    if (collide(arena, {...player, pos: {x: player.pos.x, y: player.pos.y + 1}})) lockDelay += deltaTime;

    enemyTurn(deltaTime);
    draw();
    requestAnimationFrame(update);
}

// --- Bindings ---
const bindTouch = (id, key) => {
    const el = document.getElementById(id);
    const setKey = (val) => {
        if(gameState !== 'PLAY') return;
        if (key === 'hard') { if(val) playerHardDrop(); }
        else if (key === 'rotl') { if(val) playerRotate(-1); }
        else if (key === 'rotr') { if(val) playerRotate(1); }
        else { inputState[key] = val; }
        if(val) el.classList.add('pressed'); else el.classList.remove('pressed');
    };
    el.addEventListener('touchstart', (e) => { e.preventDefault(); setKey(true); });
    el.addEventListener('touchend', (e) => { e.preventDefault(); setKey(false); });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); setKey(true); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); setKey(false); });
};
bindTouch('btn-left', 'left'); bindTouch('btn-right', 'right'); bindTouch('btn-down', 'down');
bindTouch('btn-hard', 'hard'); bindTouch('btn-rot-l', 'rotl'); bindTouch('btn-rot-r', 'rotr');

document.addEventListener('keydown', e => {
    if(e.repeat || gameState !== 'PLAY') return;
    if(e.key === 'ArrowLeft') inputState.left = true;
    if(e.key === 'ArrowRight') inputState.right = true;
    if(e.key === 'ArrowDown') inputState.down = true;
    if(e.key === 'ArrowUp') playerHardDrop();
    if(e.key === 'z') playerRotate(-1);
    if(e.key === 'x') playerRotate(1);
});
document.addEventListener('keyup', e => {
    if(e.key === 'ArrowLeft') inputState.left = false;
    if(e.key === 'ArrowRight') inputState.right = false;
    if(e.key === 'ArrowDown') inputState.down = false;
});

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-retry').addEventListener('click', startGame);

