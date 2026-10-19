import * as THREE from 'three';

(() => {
  'use strict';

  const host = document.getElementById('game');
  const ui = {
    money: document.getElementById('money'), level: document.getElementById('level'),
    xp: document.getElementById('xp'), xpBar: document.getElementById('xpBar'),
    pc: document.getElementById('pcLevel'), notice: document.getElementById('notice'),
    panel: document.getElementById('panel'), title: document.getElementById('dialogTitle'),
    description: document.getElementById('dialogText'), items: document.getElementById('dialogItems'),
    action: document.getElementById('mainAction')
  };
  const START = Object.freeze({ x: 0, z: 1.35, money: 0, xp: 0, level: 1, pc: 1, decor: 0, room: 0 });
  const wallColors = [0x8179a5, 0x78a092, 0x718bb8];
  const floorColors = [0x9a7153, 0x94704f, 0x84614f];
  let state = { ...START }, panelMode = '', noticeTimer = null;
  const held = new Set();
  const clock = new THREE.Clock();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ebed0);
  scene.fog = new THREE.Fog(0x9ebed0, 17, 32);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(5, 8, 9);
  let firstPerson = false;
  let cameraYaw = 0;
  let cameraPitch = -0.08;
  let draggingLook = false;
  let lastPointerX = 0, lastPointerY = 0;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xdceeff, 0x76543d, 2.0));
  const sunlight = new THREE.DirectionalLight(0xffe3b2, 2.6);
  sunlight.position.set(-4, 10, 6);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -9; sunlight.shadow.camera.right = 9;
  sunlight.shadow.camera.top = 9; sunlight.shadow.camera.bottom = -9;
  scene.add(sunlight);

  const mats = {};
  function material(name, color, roughness = 1, extra = {}) {
    if (!mats[name]) mats[name] = new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    return mats[name];
  }
  function box(name, x, y, z, sx, sy, sz, color, options = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      typeof color === 'string' && mats[color] ? mats[color] : material(name + ':' + String(color), color)
    );
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = options.castShadow !== false;
    mesh.receiveShadow = options.receiveShadow !== false;
    if (options.rotationY) mesh.rotation.y = options.rotationY;
    scene.add(mesh);
    return mesh;
  }
  function sphere(name, x, y, z, radius, color) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), material(name, color));
    mesh.position.set(x, y, z); mesh.castShadow = true; scene.add(mesh); return mesh;
  }

  try {
    const raw = localStorage.getItem('myComputerGameSave');
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(START)) if (Number.isFinite(parsed[key])) state[key] = parsed[key];
      state.level = Math.max(1, Math.floor(state.level));
      state.pc = Math.max(1, Math.min(10, Math.floor(state.pc)));
      state.decor = Math.max(0, Math.min(3, Math.floor(state.decor)));
      state.room = Math.abs(Math.floor(state.room)) % wallColors.length;
      state.money = Math.max(0, state.money); state.xp = Math.max(0, state.xp);
      state.x = Math.max(-5.1, Math.min(5.1, state.x));
      state.z = Math.max(-3.8, Math.min(3.8, state.z));
    }
  } catch (error) { console.warn('Save could not be loaded.', error); state = { ...START }; }

  function notify(message) {
    ui.notice.textContent = message;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { ui.notice.textContent = ''; }, 2800);
  }
  function updateStats() {
    ui.money.textContent = Math.floor(state.money);
    ui.level.textContent = state.level;
    ui.pc.textContent = state.pc;
    const needed = state.level * 50;
    ui.xp.textContent = state.xp + ' / ' + needed;
    ui.xpBar.style.width = Math.min(100, state.xp / needed * 100) + '%';
  }
  function save(showMessage = true) {
    try { localStorage.setItem('myComputerGameSave', JSON.stringify(state)); if (showMessage) notify('Прогресс сохранён!'); }
    catch (error) { notify('Не удалось сохранить прогресс в этом браузере.'); }
    updateStats();
  }
  function gainXP(amount) {
    state.xp += amount; let count = 0;
    while (state.xp >= state.level * 50) {
      state.xp -= state.level * 50; state.level++; state.money += 25; count++;
    }
    if (count) notify('Новый уровень! Бонус: +' + (25 * count) + ' монет.');
  }

  const roomParts = [];
  const decorationParts = [];
  function keep(mesh, list = roomParts) { list.push(mesh); return mesh; }
  const floor = keep(box('floor', 0, -0.16, 0, 12, 0.3, 10, floorColors[state.room]));
  // Warm low-poly room shell, with an open front so the room is easy to see.
  keep(box('back wall', 0, 2.1, -4.9, 12, 4.2, 0.22, wallColors[state.room]));
  keep(box('left wall', -5.9, 2.1, 0, 0.22, 4.2, 10, wallColors[state.room]));
  keep(box('right wall', 5.9, 2.1, 0, 0.22, 4.2, 10, wallColors[state.room]));
  keep(box('back skirting', 0, 0.12, -4.74, 11.8, 0.24, 0.12, 0xd6b98d));
  keep(box('left skirting', -5.74, 0.12, 0, 0.12, 0.24, 9.8, 0xd6b98d));
  // Wooden floor boards.
  for (let z = -4.5; z <= 4.4; z += 0.62) keep(box('floor seam', 0, 0.005, z, 11.7, 0.012, 0.025, 0x674b39, {castShadow:false}));
  for (let x = -5.5; x <= 5.5; x += 1.5) for (let z = -4.2; z <= 4.2; z += 1.24) {
    keep(box('floor joint', x, 0.006, z, 0.018, 0.013, 0.62, 0x674b39, {castShadow:false}));
  }
  // Window, sill and curtains.
  keep(box('window frame', -2.6, 2.65, -4.72, 2.35, 1.75, 0.12, 0x4b405c));
  keep(box('window glass', -2.6, 2.65, -4.63, 2.08, 1.48, 0x8bd0ec, {castShadow:false}));
  keep(box('window vertical bar', -2.6, 2.65, -4.53, 0.09, 1.5, 0.08, 0xf0d5a8));
  keep(box('window horizontal bar', -2.6, 2.65, -4.52, 2.1, 0.09, 0.08, 0xf0d5a8));
  keep(box('window sill', -2.6, 1.72, -4.48, 2.55, 0.12, 0.34, 0xe6c28f));
  keep(box('curtain left', -3.9, 2.65, -4.5, 0.28, 1.95, 0.16, 0x67547f));
  keep(box('curtain right', -1.3, 2.65, -4.5, 0.28, 1.95, 0.16, 0x67547f));
  // Bed, blanket, pillow and legs.
  keep(box('bed base', -3.75, 0.48, -1.8, 2.55, 0.45, 3.25, 0x5c4a69));
  keep(box('mattress', -3.75, 0.76, -1.8, 2.48, 0.25, 3.16, 0xe7d4b6));
  keep(box('blanket', -3.75, 0.91, -0.95, 2.49, 0.12, 1.75, 0x9183b8));
  keep(box('pillow', -3.75, 0.94, -3.0, 1.45, 0.2, 0.72, 0xb8d2e5));
  for (const x of [-4.75, -2.75]) for (const z of [-3.1, -0.55]) keep(box('bed leg', x, 0.22, z, 0.18, 0.45, 0.18, 0x6b4935));
  // Rug in the middle.
  keep(box('rug', -0.3, 0.025, 0.4, 3.0, 0.05, 2.35, 0xb9a0ca));
  keep(box('rug inset', -0.3, 0.055, 0.4, 2.62, 0.025, 1.98, 0x8975a8, {castShadow:false}));
  // Desk and computer.
  keep(box('desk top', 2.65, 1.15, -2.55, 3.45, 0.2, 1.35, 0xd9a86d));
  for (const x of [1.2, 4.1]) for (const z of [-3.0, -2.1]) keep(box('desk leg', x, 0.57, z, 0.16, 1.1, 0.16, 0x765039));
  keep(box('drawer', 3.8, 0.77, -2.55, 0.62, 0.56, 0.9, 0x9c6c45));
  const monitor = keep(box('computer monitor', 2.55, 1.92, -2.72, 1.45, 1.0, 0.16, 0x20283c));
  const screen = keep(box('computer screen', 2.55, 1.94, -2.615, 1.22, 0.76, 0x4d91ad));
  keep(box('monitor stand', 2.55, 1.36, -2.72, 0.16, 0.36, 0.16, 0xaeb7c5));
  keep(box('monitor foot', 2.55, 1.25, -2.72, 0.68, 0.08, 0.36, 0xaeb7c5));
  keep(box('keyboard', 2.55, 1.28, -1.98, 1.05, 0.08, 0.36, 0x39455a));
  keep(box('mouse', 3.35, 1.29, -1.98, 0.18, 0.09, 0.25, 0xe3e7ed));
  const pcTower = keep(box('PC tower', 4.05, 1.56, -2.62, 0.45, 0.82, 0.65, 0x30394d));
  keep(box('PC light', 4.05, 1.68, -2.285, 0.09, 0.09, 0.025, 0x6ee7c2));
  // Books and a small desk lamp.
  keep(box('book one', 1.4, 1.31, -2.55, 0.3, 0.12, 0.5, 0x6f8ec2));
  keep(box('book two', 1.42, 1.43, -2.55, 0.28, 0.12, 0.46, 0xd48c62));
  keep(box('lamp base', 3.55, 1.29, -2.8, 0.34, 0.08, 0.34, 0x3c4557));
  keep(box('lamp stem', 3.55, 1.53, -2.8, 0.07, 0.42, 0.07, 0x4b566d));
  keep(box('lamp shade', 3.55, 1.77, -2.8, 0.42, 0.24, 0.42, 0xf2cc78));
  // Wall art.
  keep(box('picture frame', 0.35, 2.75, -4.72, 1.05, 1.25, 0.13, 0x4b3c31));
  keep(box('picture', 0.35, 2.75, -4.63, 0.85, 1.05, 0x73a7a5));
  keep(box('picture mountain', 0.35, 2.45, -4.56, 0.75, 0.36, 0x48677b));
  // A little wall clock.
  const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.08,12), material('clock face',0xf1dfb9));
  clockFace.rotation.x=Math.PI/2; clockFace.position.set(4.5,3.35,-4.68); scene.add(clockFace); keep(clockFace);
  keep(box('clock hand',4.5,3.35,-4.61,0.035,0.22,0.025,0x4b405c));
  // Plant on the right side.
  keep(box('plant pot', 5.0, 0.38, -0.6, 0.62, 0.68, 0.62, 0xb56f4d));
  keep(box('plant soil', 5.0, 0.73, -0.6, 0.54, 0.08, 0.54, 0x49372b));
  for (const [x,y,z,r,c] of [[4.75,1.2,-0.6,.42,0x4b9363],[5.15,1.35,-.65,.46,0x69ad70],[5.0,1.7,-.62,.4,0x3d7f56],[5.32,1.1,-.45,.33,0x7cbd78]]) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),material('leaf '+c,c)); leaf.position.set(x,y,z); leaf.castShadow=true; scene.add(leaf); keep(leaf);
  }

  // Low-poly player: blocky head, hair, body, arms and legs, inspired by 64-bit era games.
  const player = new THREE.Group(); scene.add(player);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.72,0.34), material('player shirt',0x3e78b6));
  body.position.y=1.05; body.castShadow=true; player.add(body);
  const shirtCollar = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.1,0.035), material('shirt collar',0x8eb9df));
  shirtCollar.position.set(0,1.39,0.18); player.add(shirtCollar);
  const shirtPocket = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.15,0.025), material('shirt pocket',0x2d5c91));
  shirtPocket.position.set(0.15,1.13,0.181); player.add(shirtPocket);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.43,0.075,0.27), material('player belt',0x42342e));
  belt.position.set(0,0.69,0); player.add(belt);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.43,0.43,0.4), material('player skin',0xdca77f));
  head.position.y=1.66; head.castShadow=true; player.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46,0.18,0.43), material('player hair',0x4a342d));
  hair.position.set(0,1.89,0); hair.castShadow=true; player.add(hair);
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.29,0.09,0.09), material('player fringe',0x4a342d));
  fringe.position.set(-0.04,1.81,0.2); player.add(fringe);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.17,0.14,0.17), material('player neck',0xdca77f));
  neck.position.set(0,1.39,0); player.add(neck);
  for(const side of [-1,1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.12,0.09), material('player ears',0xc88f6b));
    ear.position.set(side*0.225,1.65,0.015); player.add(ear);
    const eyeWhite = new THREE.Mesh(new THREE.BoxGeometry(0.085,0.065,0.025), material('player eye white',0xf6eee0));
    eyeWhite.position.set(side*0.095,1.69,0.207); player.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.032,0.042,0.012), material('player pupils',0x25242a));
    pupil.position.set(side*0.095,1.69,0.226); player.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09,0.025,0.025), material('player eyebrows',0x4a342d));
    brow.position.set(side*0.095,1.75,0.211); player.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.075,0.075), material('player nose',0xd39a73));
  nose.position.set(0,1.63,0.235); player.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.09,0.025,0.02), material('player mouth',0x824f4a));
  mouth.position.set(0,1.55,0.211); player.add(mouth);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17,0.62,0.2), material('player sleeve',0x315c8c));
  armL.position.set(-0.37,1.06,0); armL.castShadow=true; player.add(armL);
  const armR = armL.clone(); armR.position.x=0.37; player.add(armR);
  for(const side of [-1,1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.105,8,6), material('player shoulder',0x315c8c));
    shoulder.position.set(side*0.37,1.34,0); player.add(shoulder);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.16,0.16), material('player hands',0xdca77f));
    hand.position.set(side*0.37,0.72,0); player.add(hand);
  }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.48,0.24), material('player trousers',0x29374e));
  legL.position.set(-0.16,0.37,0); legL.castShadow=true; player.add(legL);
  const legR = legL.clone(); legR.position.x=0.16; player.add(legR);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.13,0.32), material('player shoes',0x202332));
  shoeL.position.set(-0.16,0.12,-0.035); shoeL.castShadow=true; player.add(shoeL);
  const shoeR = shoeL.clone(); shoeR.position.x=0.16; player.add(shoeR);

  const decorGroup = new THREE.Group(); scene.add(decorGroup);
  function refreshRoom() {
    floor.material = material('floor-current-'+state.room, floorColors[state.room]);
    for (const mesh of roomParts) {
      if (mesh.name.includes('wall')) mesh.material = material('wall-current-'+state.room, wallColors[state.room]);
    }
    screen.material = material('screen-level-'+state.pc, state.pc >= 7 ? 0x75e6b2 : state.pc >= 4 ? 0x73d1d4 : 0x4d91ad, 0.5, {emissive: state.pc >= 4 ? 0x164b45 : 0x0a1c27, emissiveIntensity: 0.65});
    pcTower.material = material('tower-level-'+state.pc, state.pc >= 8 ? 0x735b9f : 0x30394d);
    decorGroup.clear();
    if (state.decor >= 1) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.31,0.48,7),material('extra plant pot',0xb56f4d));
      pot.position.set(-0.7,0.26,2.5); pot.castShadow=true; decorGroup.add(pot);
      for (const [x,y,z,r,c] of [[-.95,.72,2.5,.35,0x4b9363],[-.55,.88,2.45,.4,0x69ad70],[-.72,1.15,2.5,.33,0x3d7f56]]) {
        const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),material('extra leaf '+c,c));leaf.position.set(x,y,z);leaf.castShadow=true;decorGroup.add(leaf);
      }
    }
    if (state.decor >= 2) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(1.25,0.72,0.38),material('shelf',0x8d6346));
      stand.position.set(4.85,1.25,1.7);stand.castShadow=true;decorGroup.add(stand);
      for(let i=0;i<4;i++){const book=new THREE.Mesh(new THREE.BoxGeometry(.18,.55,.28),material('shelf book '+i,[0x6f8ec2,0xd48c62,0x8cb59a,0x9b82bc][i]));book.position.set(4.45+i*.25,1.86,1.7);book.castShadow=true;decorGroup.add(book);}
    }
    if (state.decor >= 3) {
      const bean = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72,1),material('beanbag',0x8e77b7));
      bean.scale.set(1.15,.65,.85);bean.position.set(1.2,.47,2.5);bean.castShadow=true;decorGroup.add(bean);
    }
    updateStats();
  }

  function nearComputer() {
    return Math.hypot(state.x - 2.55, state.z + 2.2) < 2.25;
  }
  const pcOverlay = document.getElementById('pcOverlay');
  const pcTitle = document.getElementById('pcTitle');
  const pcSubtitle = document.getElementById('pcSubtitle');
  const pcCards = document.getElementById('pcCards');
  const pcAppWindow = document.getElementById('pcAppWindow');
  const pcAppName = document.getElementById('pcAppName');
  const pcAppBody = document.getElementById('pcAppBody');
  const pcStatusText = () => 'Монеты: ' + Math.floor(state.money) + ' · Уровень: ' + state.level + ' · ПК: ' + state.pc;

  function closeComputerDesktop() {
    pcOverlay.classList.remove('show');
    pcOverlay.setAttribute('aria-hidden','true');
    held.clear();
  }
  function openComputerDesktop() {
    closePanel();
    pcOverlay.classList.add('show');
    pcOverlay.setAttribute('aria-hidden','false');
    showPcApp('home');
    const clockLabel=document.getElementById('pcClock');
    if(clockLabel) clockLabel.textContent='Система готова · ' + pcStatusText();
  }
  function showPcApp(name) {
    pcAppWindow.hidden = name === 'home';
    pcCards.hidden = name !== 'home';
    if(name === 'home') {
      pcTitle.textContent='Рабочий стол';
      pcSubtitle.textContent='Твой компьютер включён. Выбери приложение, чтобы начать.';
      return;
    }
    pcTitle.textContent='Мои приложения';
    pcSubtitle.textContent='Компьютер работает нормально. Данные сохраняются автоматически.';
    pcAppName.textContent = ({work:'💼 Рабочее место',web:'🌐 Внутриигровой браузер',files:'📁 Мои файлы'})[name] || 'Приложение';
    if(name==='work') {
      pcAppBody.innerHTML='<h3>Рабочая смена</h3><p>Выбери сложность. Чем сложнее работа, тем выше награда.</p><label for="workDifficulty"><b>Сложность работы</b></label><select id="workDifficulty" class="btn" style="display:block;width:100%;margin:8px 0 12px;background:#152641"><option value="easy">Лёгкая — 15 монет</option><option value="medium" selected>Средняя — 30 монет</option><option value="hard">Сложная — 55 монет</option><option value="expert">Эксперт — 90 монет</option></select><p><b id="pcRewardPreview">Награда за смену: 30 монет</b></p><div class="pc-progress"><span id="pcWorkProgress" style="width:0%"></span></div><button class="btn primary" id="pcDoWork" type="button">▶ Начать работу</button><p id="pcWorkStatus" class="pc-status" aria-live="polite">Готов к работе.</p>';
    } else if(name==='games') {
      pcAppBody.innerHTML='<h3>🎮 Игры на компьютере</h3><p>Отдохни от работы и заработай немного монет в мини-играх.</p><div class="item"><div><b>Кликер</b><small>Нажми кнопку 10 раз. Награда: 20 монет.</small></div><button class="btn primary" id="clickerBtn" type="button">0 / 10</button></div><p id="clickerStatus" class="pc-status" aria-live="polite"></p><div class="item"><div><b>Угадай число</b><small>Компьютер загадал число от 1 до 5. Награда за верный ответ: 15 монет.</small></div><select id="guessNumber" class="btn" aria-label="Выбери число"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select><button class="btn primary" id="guessBtn" type="button">Угадать</button></div><p id="guessStatus" class="pc-status" aria-live="polite"></p>';
    } else if(name==='web') {
      pcAppBody.innerHTML='<h3>Браузер MiniNet</h3><p>Безопасный внутриигровой интернет. Здесь можно посмотреть состояние системы и полезные советы.</p><div class="item"><div><b>Новости комнаты</b><small>Компьютер подключён. Новых обновлений системы нет.</small></div><span>🟢</span></div><div class="item"><div><b>Совет дня</b><small>Улучшай ПК в магазине, чтобы зарабатывать больше за каждую смену.</small></div><span>💡</span></div><p class="pc-status">Статус подключения: подключено</p>';
    } else if(name==='files') {
      pcAppBody.innerHTML='<h3>Сведения о системе</h3><p>Сохранение игры и характеристики персонажа.</p><div class="item"><div><b>Профиль игрока</b><small>'+pcStatusText()+'</small></div><span>👤</span></div><div class="item"><div><b>Опыт</b><small>'+state.xp+' / '+(state.level*50)+' XP</small></div><span>⭐</span></div><div class="item"><div><b>Состояние сохранения</b><small>Автосохранение включено</small></div><span>💾</span></div><button class="btn primary" id="pcSaveNow" type="button">💾 Сохранить сейчас</button><p id="pcFileStatus" class="pc-status" aria-live="polite"></p>';
    }
  }
  function closePanel() { ui.panel.classList.remove('show'); panelMode=''; }
  function showPanel(mode) {
    if(mode==='computer') { openComputerDesktop(); return; }
    panelMode=mode; ui.items.replaceChildren(); ui.panel.classList.add('show');
    if(mode==='shop') {
      ui.title.textContent='🛒 Магазин улучшений';
      ui.description.textContent='Улучши компьютер или обустрой комнату. Всё купленное остаётся в сохранении.';
      ui.action.textContent='Закрыть магазин'; ui.action.onclick=closePanel;
      addShopItem('Улучшить компьютер','Больше монет за каждую работу.',60*state.pc,()=>{
        state.money-=60*state.pc;state.pc=Math.min(10,state.pc+1);refreshRoom();notify('Компьютер улучшен!');
      },state.pc>=10);
      addShopItem('Обновить комнату','Новая обстановка и предметы декора.',45*(state.decor+1),()=>{
        state.money-=45*(state.decor+1);state.decor=Math.min(3,state.decor+1);state.room=(state.room+1)%wallColors.length;refreshRoom();notify('Комната обновлена!');
      },state.decor>=3);
    } else if(mode==='decor') {
      ui.title.textContent='🪴 Обновление комнаты';
      ui.description.textContent='За 30 монет поменяй цвет стен и добавь украшения.';
      ui.action.textContent='Обновить за 30 монет';
      ui.action.onclick=()=>{
        if(state.money<30){notify('Не хватает монет!');return;}
        state.money-=30;state.room=(state.room+1)%wallColors.length;state.decor=Math.min(3,state.decor+1);
        refreshRoom();save(false);closePanel();notify('Комната стала уютнее!');
      };
    }
  }
  function addShopItem(name,description,cost,purchase,unavailable) {
    const row=document.createElement('div');row.className='item';
    const info=document.createElement('div');const title=document.createElement('b');title.textContent=name;
    const detail=document.createElement('small');detail.textContent=unavailable?'Максимальный уровень достигнут.':description+' Цена: '+cost+' монет.';
    info.append(title,detail);
    const button=document.createElement('button');button.className='btn goldbtn';button.textContent=unavailable?'Максимум':'Купить';
    button.disabled=unavailable||state.money<cost;
    button.addEventListener('click',()=>{if(state.money<cost||unavailable)return;purchase();save(false);showPanel('shop');});
    row.append(info,button);ui.items.append(row);
  }
  function work(difficulty = 'medium') {
    if(!nearComputer()){notify('Подойди ближе к компьютеру!');return 0;}
    const rewards = { easy: 15, medium: 30, hard: 55, expert: 90 };
    const xpRewards = { easy: 8, medium: 14, hard: 24, expert: 38 };
    const reward = rewards[difficulty] ?? rewards.medium;
    state.money += reward;
    gainXP(xpRewards[difficulty] ?? xpRewards.medium);
    save(false);updateStats();
    notify('Работа выполнена: +' + reward + ' монет.');
    return reward;
  }
  function movePlayer(dx,dz,delta) {
    if(ui.panel.classList.contains('show'))return;
    const len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;
    if(firstPerson){const forwardX=-Math.sin(cameraYaw),forwardZ=-Math.cos(cameraYaw);const rightX=Math.cos(cameraYaw),rightZ=-Math.sin(cameraYaw);const worldX=rightX*dx+forwardX*(-dz);const worldZ=rightZ*dx+forwardZ*(-dz);dx=worldX;dz=worldZ;}
    state.x=Math.max(-5.25,Math.min(5.25,state.x+dx*3.3*delta));
    state.z=Math.max(-4.1,Math.min(4.1,state.z+dz*3.3*delta));
    // Basic furniture collision so the character does not walk through the bed or desk.
    if(state.x < -2.35 && state.z < 0.15 && state.z > -3.65) { state.x = -2.35; }
    if(state.x > 0.55 && state.x < 4.75 && state.z < -1.35 && state.z > -3.6) { state.z = -1.25; }
    player.position.set(state.x,0,state.z);
    if(!firstPerson) player.rotation.y=Math.atan2(dx,dz);
  }

  document.addEventListener('keydown',event=>{
    const key=event.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))event.preventDefault();
    if(key==='escape'){if(pcOverlay.classList.contains('show'))closeComputerDesktop();else closePanel();return;}
    if(pcOverlay.classList.contains('show'))return;
    if(ui.panel.classList.contains('show'))return;
    if(key==='e'&&!event.repeat){if(nearComputer())showPanel('computer');else notify('Подойди к столу и нажми E.');return;}
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key))held.add(key);
  });
  document.addEventListener('keyup',event=>held.delete(event.key.toLowerCase()));
  window.addEventListener('blur',()=>held.clear());
  document.querySelectorAll('[data-move]').forEach(button=>{
    const key={up:'arrowup',down:'arrowdown',left:'arrowleft',right:'arrowright'}[button.dataset.move];
    button.addEventListener('pointerdown',event=>{event.preventDefault();held.add(key);if(button.setPointerCapture)button.setPointerCapture(event.pointerId);});
    const release=()=>held.delete(key);
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  document.getElementById('workBtn').addEventListener('click',()=>{if(nearComputer())showPanel('computer');else notify('Подойди к столу и нажми E.');});
  document.getElementById('pcClose').addEventListener('click',closeComputerDesktop);
  document.getElementById('pcAppHome').addEventListener('click',()=>showPcApp('home'));
  document.querySelectorAll('[data-pc-app]').forEach(button=>button.addEventListener('click',()=>showPcApp(button.dataset.pcApp)));
  document.getElementById('pcAppBody').addEventListener('click',event=>{
    const button=event.target.closest('button'); if(!button)return;
    if(button.id==='pcDoWork') {
      const status=document.getElementById('pcWorkStatus');
      const progress=document.getElementById('pcWorkProgress');
      const difficulty=document.getElementById('workDifficulty')?.value || 'medium';
      const details={easy:{reward:15,time:500,label:'лёгкая'},medium:{reward:30,time:900,label:'средняя'},hard:{reward:55,time:1400,label:'сложная'},expert:{reward:90,time:1900,label:'экспертная'}};
      const job=details[difficulty]||details.medium;
      const preview=document.getElementById('pcRewardPreview');
      if(preview)preview.textContent='Награда за смену: '+job.reward+' монет';
      button.disabled=true; status.textContent='Выполняется '+job.label+' работа...'; progress.style.width='10%';
      const started=Date.now();
      const timer=setInterval(()=>{progress.style.width=Math.min(95,((Date.now()-started)/job.time)*100)+'%';},80);
      setTimeout(()=>{
        clearInterval(timer);
        if(!pcOverlay.classList.contains('show'))return;
        progress.style.width='100%';
        const earned=work(difficulty);
        status.textContent='Смена завершена! Получено '+earned+' монет. '+pcStatusText();
        button.disabled=false;
        const clockLabel=document.getElementById('pcClock'); if(clockLabel)clockLabel.textContent='Система готова · '+pcStatusText();
      },job.time);
    } else if(button.id==='clickerBtn') {
      const btn=button; const status=document.getElementById('clickerStatus');
      let count=Number(btn.dataset.count||0)+1; btn.dataset.count=String(count); btn.textContent=count+' / 10';
      if(count>=10){btn.disabled=true;state.money+=20;gainXP(5);save(false);status.textContent='Отлично! Ты получил 20 монет.';updateStats();}
      else status.textContent='Ещё '+(10-count)+' нажатий!';
    } else if(button.id==='guessBtn') {
      const chosen=Number(document.getElementById('guessNumber')?.value||1);
      const secret=1+Math.floor(Math.random()*5);const status=document.getElementById('guessStatus');
      if(chosen===secret){state.money+=15;gainXP(6);save(false);status.textContent='Верно! Выпало число '+secret+'. +15 монет!';}
      else status.textContent='Не угадал! Компьютер загадал '+secret+'. Попробуй ещё раз.';
      updateStats();
    } else if(button.id==='pcSaveNow') {
      save(false);const status=document.getElementById('pcFileStatus');if(status)status.textContent='Сохранение выполнено успешно.';
    }
  });
  document.getElementById('cameraBtn').addEventListener('click',()=>{firstPerson=!firstPerson;document.getElementById('cameraBtn').textContent=firstPerson?'🎥 Третье лицо':'👁️ Первое лицо';document.getElementById('cameraBtn').setAttribute('aria-pressed',String(firstPerson));if(firstPerson){cameraYaw=player.rotation.y;cameraPitch=-0.04;notify('Первое лицо: проведи пальцем или мышью по игровому экрану, чтобы осмотреться.');}else notify('Включён вид от третьего лица.');});
  document.getElementById('fullscreenBtn').addEventListener('click',async()=>{const immersive=!document.body.classList.contains('immersive');document.body.classList.toggle('immersive',immersive);if(immersive){try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}catch(error){}document.getElementById('fullscreenBtn').textContent='↙ Выйти из полного экрана';}else{if(document.fullscreenElement&&document.exitFullscreen){try{await document.exitFullscreen();}catch(error){}}document.getElementById('fullscreenBtn').textContent='⛶ Полный экран';}setTimeout(resize,80);});
  document.addEventListener('fullscreenchange',()=>{setTimeout(resize,80);});
  renderer.domElement.addEventListener('pointerdown',event=>{if(!firstPerson||ui.panel.classList.contains('show'))return;draggingLook=true;lastPointerX=event.clientX;lastPointerY=event.clientY;if(renderer.domElement.setPointerCapture)renderer.domElement.setPointerCapture(event.pointerId);});
  renderer.domElement.addEventListener('pointermove',event=>{if(!draggingLook||!firstPerson)return;const dx=event.clientX-lastPointerX,dy=event.clientY-lastPointerY;lastPointerX=event.clientX;lastPointerY=event.clientY;cameraYaw-=dx*0.006;cameraPitch=Math.max(-1.05,Math.min(0.8,cameraPitch-dy*0.0045));});
  const stopLook=()=>{draggingLook=false;};renderer.domElement.addEventListener('pointerup',stopLook);renderer.domElement.addEventListener('pointercancel',stopLook);renderer.domElement.addEventListener('lostpointercapture',stopLook);

  document.getElementById('shopBtn').addEventListener('click',()=>showPanel('shop'));
  document.getElementById('decorBtn').addEventListener('click',()=>showPanel('decor'));
  document.getElementById('saveBtn').addEventListener('click',()=>save(true));
  document.getElementById('closePanel').addEventListener('click',closePanel);
  document.getElementById('resetBtn').addEventListener('click',()=>{
    if(!window.confirm('Начать новую игру? Текущий прогресс будет удалён.'))return;
    state={...START};try{localStorage.removeItem('myComputerGameSave');}catch(error){console.warn(error);}
    player.position.set(state.x,0,state.z);refreshRoom();closePanel();notify('Новая игра началась!');
  });
  host.addEventListener('click',event=>{
    if(ui.panel.classList.contains('show'))return;
    const rect=renderer.domElement.getBoundingClientRect();
    const nx=((event.clientX-rect.left)/rect.width)*2-1;
    const ny=-((event.clientY-rect.top)/rect.height)*2+1;
    const raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(nx,ny),camera);
    const hits=raycaster.intersectObjects(scene.children,true);
    if(hits.some(hit=>hit.object.name==='computer monitor'||hit.object.name==='computer screen'||hit.object.name==='PC tower')) {
      if(nearComputer())showPanel('computer');else notify('Подойди ближе к компьютеру!');
    }
  });

  function resize() {
    const width=Math.max(320,host.clientWidth),height=Math.max(300,host.clientHeight);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);resize();
  refreshRoom();
  player.position.set(state.x,0,state.z);

  function loop() {
    requestAnimationFrame(loop);
    const delta=Math.min(clock.getDelta(),0.05);
    if(!ui.panel.classList.contains('show')&&held.size) {
      let dx=0,dz=0;
      if(held.has('arrowleft')||held.has('a'))dx-=1;
      if(held.has('arrowright')||held.has('d'))dx+=1;
      if(held.has('arrowup')||held.has('w'))dz-=1;
      if(held.has('arrowdown')||held.has('s'))dz+=1;
      if(dx||dz)movePlayer(dx,dz,delta);
    }
    if(firstPerson){
      const eye=new THREE.Vector3(state.x,1.55,state.z);camera.position.lerp(eye,0.22);
      const lookTarget=new THREE.Vector3(state.x-Math.sin(cameraYaw)*8,1.55+Math.sin(cameraPitch)*8,state.z-Math.cos(cameraYaw)*8);camera.lookAt(lookTarget);player.rotation.y=cameraYaw;
    }else{
      const target=new THREE.Vector3(state.x+4.8,6.6,state.z+7.2);
      camera.position.lerp(target,0.075);
      camera.lookAt(state.x,0.8,state.z-0.35);
    }
    const moving=held.size>0&&!ui.panel.classList.contains('show');
    if(moving){const t=performance.now()*0.012;legL.rotation.x=Math.sin(t)*0.48;legR.rotation.x=-Math.sin(t)*0.48;armL.rotation.x=-Math.sin(t)*0.35;armR.rotation.x=Math.sin(t)*0.35;}
    else {legL.rotation.x=0;legR.rotation.x=0;armL.rotation.x=0;armR.rotation.x=0;}
    renderer.render(scene,camera);
  }
  loop();
})();