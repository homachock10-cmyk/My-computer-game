(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    money: document.getElementById('money'),
    level: document.getElementById('level'),
    xp: document.getElementById('xp'),
    xpBar: document.getElementById('xpBar'),
    pc: document.getElementById('pcLevel'),
    notice: document.getElementById('notice'),
    panel: document.getElementById('panel'),
    title: document.getElementById('dialogTitle'),
    description: document.getElementById('dialogText'),
    items: document.getElementById('dialogItems'),
    action: document.getElementById('mainAction')
  };

  const START = Object.freeze({
    x: 350, y: 350, money: 0, xp: 0, level: 1, pc: 1, decor: 0, room: 0
  });
  const palettes = [
    { wall: '#7e739b', floor: '#93694d', rug: '#b3a0c9' },
    { wall: '#789b8b', floor: '#956d4c', rug: '#a8c9b5' },
    { wall: '#7188b0', floor: '#82604d', rug: '#aab9dc' }
  ];
  let state = { ...START };
  let panelMode = '';
  let noticeTimer = null;
  const held = new Set();
  const player = { width: 24, height: 44, speed: 150 };

  try {
    const raw = localStorage.getItem('myComputerGameSave');
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(START)) {
        if (Number.isFinite(parsed[key])) state[key] = parsed[key];
      }
      state.level = Math.max(1, Math.floor(state.level));
      state.pc = Math.max(1, Math.min(10, Math.floor(state.pc)));
      state.decor = Math.max(0, Math.min(3, Math.floor(state.decor)));
      state.room = Math.abs(Math.floor(state.room)) % palettes.length;
      state.money = Math.max(0, state.money);
      state.xp = Math.max(0, state.xp);
      state.x = Math.max(24, Math.min(776, state.x));
      state.y = Math.max(205, Math.min(438, state.y));
    }
  } catch (error) {
    console.warn('Save could not be loaded; starting a new game.', error);
    state = { ...START };
  }

  function save(showMessage = true) {
    try {
      localStorage.setItem('myComputerGameSave', JSON.stringify(state));
      if (showMessage) notify('Прогресс сохранён!');
    } catch (error) {
      notify('Не удалось сохранить прогресс в этом браузере.');
      console.warn('Save failed:', error);
    }
    updateStats();
  }

  function notify(message) {
    ui.notice.textContent = message;
    if (noticeTimer) window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { ui.notice.textContent = ''; }, 2800);
  }

  function updateStats() {
    ui.money.textContent = Math.floor(state.money);
    ui.level.textContent = state.level;
    ui.pc.textContent = state.pc;
    const needed = state.level * 50;
    ui.xp.textContent = state.xp + ' / ' + needed;
    ui.xpBar.style.width = Math.min(100, state.xp / needed * 100) + '%';
  }

  function gainXP(amount) {
    state.xp += amount;
    let levelUps = 0;
    while (state.xp >= state.level * 50) {
      state.xp -= state.level * 50;
      state.level += 1;
      state.money += 25;
      levelUps += 1;
    }
    if (levelUps) notify('Новый уровень! Бонус: +' + (25 * levelUps) + ' монет.');
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function label(text, x, y, size = 14, color = '#ffffff') {
    ctx.fillStyle = color;
    ctx.font = 'bold ' + size + 'px monospace';
    ctx.fillText(text, x, y);
  }

  function drawPlant(x, y) {
    rect(x + 8, y + 25, 30, 20, '#a96848');
    rect(x + 4, y + 22, 38, 6, '#d49b68');
    rect(x + 19, y - 3, 7, 27, '#3b7952');
    rect(x + 5, y + 3, 18, 15, '#4f9862');
    rect(x + 23, y - 2, 20, 17, '#6db778');
    rect(x + 15, y + 8, 19, 15, '#5ba46a');
  }

  function drawRoom() {
    const p = palettes[state.room];
    rect(0, 0, 800, 500, p.wall);
    rect(0, 0, 800, 320, p.wall);
    for (let x = 0; x < 800; x += 80) rect(x, 0, 3, 320, '#ffffff0d');
    rect(0, 320, 800, 180, p.floor);
    for (let y = 330; y < 500; y += 34) {
      rect(0, y, 800, 2, '#674737');
      for (let x = (y % 90); x < 800; x += 120) rect(x, y, 2, 34, '#674737');
    }
    rect(0, 316, 800, 9, '#d9b58c');

    // Window
    rect(45, 52, 174, 139, '#443c5c');
    rect(54, 61, 156, 120, '#8cc5e5');
    rect(130, 61, 5, 120, '#443c5c');
    rect(54, 119, 156, 5, '#443c5c');
    rect(63, 73, 43, 20, '#e5f7ff');
    rect(153, 136, 39, 27, '#e5f7ff');
    rect(45, 188, 174, 8, '#d7bd91');

    // Bed
    rect(38, 250, 188, 111, '#514b65');
    rect(46, 258, 172, 95, '#82749e');
    rect(46, 258, 172, 34, '#f0d8ba');
    rect(53, 263, 61, 24, '#b6cde1');
    rect(124, 263, 84, 24, '#b6cde1');
    rect(46, 295, 172, 58, p.rug);

    // Desk and computer
    rect(438, 245, 278, 18, '#e3b67d');
    rect(457, 263, 15, 101, '#77513b');
    rect(684, 263, 15, 101, '#77513b');
    rect(485, 215, 146, 32, '#292e43');
    rect(494, 170, 128, 76, '#151a2b');
    rect(502, 178, 112, 57, state.pc >= 4 ? '#71d5c0' : '#6e9eb6');
    rect(509, 185, 98, 42, '#243b56');
    rect(515, 192, 25, 3, '#c5f6e9');
    rect(515, 200, 65, 3, '#c5f6e9');
    rect(515, 208, 48, 3, '#c5f6e9');
    rect(553, 247, 12, 18, '#adb9c8');
    rect(530, 264, 60, 5, '#343b52');
    rect(500, 270, 112, 9, '#c4d2db');
    rect(535, 280, 42, 5, '#7a879a');
    rect(635, 220, 30, 25, '#e7e9ed');
    rect(640, 225, 20, 15, '#a3bac9');

    // Optional decorations
    if (state.decor >= 1) drawPlant(690, 270);
    if (state.decor >= 2) {
      rect(263, 78, 66, 102, '#d7c69b');
      rect(271, 86, 50, 86, '#334e62');
      rect(278, 93, 36, 72, '#78a6b9');
      rect(294, 93, 4, 72, '#334e62');
    }
    if (state.decor >= 3) {
      rect(600, 366, 135, 78, '#9b7b54');
      rect(610, 375, 115, 59, '#e4d1a8');
      rect(620, 384, 95, 41, '#b7a0d0');
    }

    // Player sprite
    rect(state.x - 12, state.y + 25, 26, 7, '#493a3b');
    rect(state.x - 10, state.y - 13, 20, 23, '#dba67c');
    rect(state.x - 13, state.y - 18, 26, 10, '#493b35');
    rect(state.x - 15, state.y - 9, 30, 8, '#493b35');
    rect(state.x - 11, state.y - 4, 22, 12, '#dba67c');
    rect(state.x - 13, state.y + 8, 26, 23, '#426c9d');
    rect(state.x - 18, state.y + 10, 7, 19, '#dba67c');
    rect(state.x + 11, state.y + 10, 7, 19, '#dba67c');
    rect(state.x - 11, state.y + 30, 9, 13, '#293750');
    rect(state.x + 3, state.y + 30, 9, 13, '#293750');
    rect(state.x - 13, state.y + 42, 12, 5, '#202335');
    rect(state.x + 2, state.y + 42, 12, 5, '#202335');

    if (nearComputer()) {
      rect(455, 132, 205, 25, '#202944');
      label('E — ИСПОЛЬЗОВАТЬ ПК', 464, 149, 13, '#fff0bd');
    }
    label('MY ROOM  /  LEVEL ' + state.level, 18, 28, 14, '#fff0bd');
    updateStats();
  }

  function nearComputer() {
    return Math.abs(state.x - 555) < 145 && Math.abs(state.y - 280) < 130;
  }

  function closePanel() {
    ui.panel.classList.remove('show');
    panelMode = '';
    drawRoom();
  }

  function showPanel(mode) {
    panelMode = mode;
    ui.items.replaceChildren();
    ui.panel.classList.add('show');

    if (mode === 'computer') {
      ui.title.textContent = '🖥️ Рабочий компьютер';
      ui.description.textContent = 'Выполни работу, заработай монеты и опыт. Улучшенный компьютер платит больше.';
      ui.action.textContent = 'Начать работу';
      ui.action.onclick = () => { closePanel(); work(); };
    } else if (mode === 'shop') {
      ui.title.textContent = '🛒 Магазин улучшений';
      ui.description.textContent = 'Покупай улучшения за заработанные монеты.';
      ui.action.textContent = 'Закрыть магазин';
      ui.action.onclick = closePanel;
      addShopItem('Улучшить компьютер', 'Увеличивает оплату за работу.', 60 * state.pc, () => {
        state.money -= 60 * state.pc;
        state.pc = Math.min(10, state.pc + 1);
        notify('Компьютер улучшен!');
      }, state.pc >= 10);
      addShopItem('Обновить комнату', 'Новый цвет и немного декора.', 45 * (state.decor + 1), () => {
        state.money -= 45 * (state.decor + 1);
        state.decor = Math.min(3, state.decor + 1);
        state.room = (state.room + 1) % palettes.length;
        notify('Комната обновлена!');
      }, state.decor >= 3);
    } else if (mode === 'decor') {
      ui.title.textContent = '🪴 Уютная комната';
      ui.description.textContent = 'За 30 монет поменяй цвет комнаты и добавь декор.';
      ui.action.textContent = 'Обновить за 30 монет';
      ui.action.onclick = () => {
        if (state.money < 30) { notify('Не хватает монет!'); return; }
        state.money -= 30;
        state.room = (state.room + 1) % palettes.length;
        state.decor = Math.min(3, state.decor + 1);
        save(false);
        closePanel();
        notify('Комната стала уютнее!');
      };
    }
  }

  function addShopItem(name, description, cost, purchase, unavailable) {
    const row = document.createElement('div');
    row.className = 'item';
    const info = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = name;
    const detail = document.createElement('small');
    detail.textContent = unavailable ? 'Максимальный уровень достигнут.' : description + ' Цена: ' + cost + ' монет.';
    info.append(title, detail);
    const button = document.createElement('button');
    button.className = 'btn goldbtn';
    button.textContent = unavailable ? 'Максимум' : 'Купить';
    button.disabled = unavailable || state.money < cost;
    button.addEventListener('click', () => {
      if (state.money < cost || unavailable) return;
      purchase();
      save(false);
      showPanel('shop');
      drawRoom();
    });
    row.append(info, button);
    ui.items.append(row);
  }

  function work() {
    if (!nearComputer()) { notify('Подойди ближе к компьютеру!'); return; }
    const reward = 8 + state.pc * 4;
    state.money += reward;
    gainXP(12 + state.pc * 2);
    save(false);
    drawRoom();
    notify('Работа выполнена: +' + reward + ' монет.');
  }

  function move(dx, dy) {
    if (ui.panel.classList.contains('show')) return;
    state.x = Math.max(24, Math.min(776, state.x + dx));
    state.y = Math.max(205, Math.min(438, state.y + dy));
    drawRoom();
  }

  let previousTime = 0;
  function gameLoop(time) {
    if (!previousTime) previousTime = time;
    const delta = Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (!ui.panel.classList.contains('show') && held.size) {
      let dx = 0;
      let dy = 0;
      if (held.has('arrowleft') || held.has('a')) dx -= 1;
      if (held.has('arrowright') || held.has('d')) dx += 1;
      if (held.has('arrowup') || held.has('w')) dy -= 1;
      if (held.has('arrowdown') || held.has('s')) dy += 1;
      if (dx || dy) {
        const length = Math.hypot(dx, dy) || 1;
        state.x = Math.max(24, Math.min(776, state.x + dx / length * player.speed * delta));
        state.y = Math.max(205, Math.min(438, state.y + dy / length * player.speed * delta));
        drawRoom();
      }
    }
    window.requestAnimationFrame(gameLoop);
  }

  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === 'escape') { closePanel(); return; }
    if (ui.panel.classList.contains('show')) return;
    if (key === 'e' && !event.repeat) {
      if (nearComputer()) showPanel('computer');
      else notify('Подойди ближе к компьютеру и нажми E.');
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) held.add(key);
  });
  document.addEventListener('keyup', event => held.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => held.clear());

  document.querySelectorAll('[data-move]').forEach(button => {
    const direction = {
      up: ['arrowup'], down: ['arrowdown'], left: ['arrowleft'], right: ['arrowright']
    }[button.dataset.move];
    if (!direction) return;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      held.add(direction[0]);
      if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
    });
    const release = () => held.delete(direction[0]);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  document.getElementById('workBtn').addEventListener('click', () => {
    if (nearComputer()) showPanel('computer');
    else notify('Подойди к компьютеру и нажми E.');
  });
  document.getElementById('shopBtn').addEventListener('click', () => showPanel('shop'));
  document.getElementById('decorBtn').addEventListener('click', () => showPanel('decor'));
  document.getElementById('saveBtn').addEventListener('click', () => save(true));
  document.getElementById('closePanel').addEventListener('click', closePanel);
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!window.confirm('Начать новую игру? Текущий прогресс будет удалён.')) return;
    state = { ...START };
    try { localStorage.removeItem('myComputerGameSave'); } catch (error) { console.warn(error); }
    closePanel();
    drawRoom();
    notify('Новая игра началась!');
  });
  canvas.addEventListener('click', event => {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * canvas.width / bounds.width;
    const y = (event.clientY - bounds.top) * canvas.height / bounds.height;
    if (x >= 480 && x <= 640 && y >= 165 && y <= 290) {
      if (nearComputer()) showPanel('computer');
      else notify('Подойди ближе к компьютеру!');
    }
  });

  drawRoom();
  window.requestAnimationFrame(gameLoop);
})();