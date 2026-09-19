const { app, BrowserWindow, utilityProcess } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
const errors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_event, level, message) => {
    if (level >= 3 && !message.includes('ERR_FILE_NOT_FOUND')) errors.push(message);
  });
  contents.on('render-process-gone', (_event, details) => errors.push(details.reason));
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(get, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await get();
    if (value) return value;
    await wait(50);
  }
  throw new Error('Timed out waiting for application UI');
}
require('../src/main.js');
app.whenReady().then(async () => {
  try {
    const main = await until(() => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === require('node:url').pathToFileURL(path.join(__dirname, '../src/index.html')).href));
    const clock = await until(() => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/elegant-clock/src/index.html')));
    await until(() => main.webContents.executeJavaScript("Boolean(document.querySelector('.clock-board'))"));
    await until(() => clock.webContents.executeJavaScript("typeof ToolkitSchedule === 'object' && Boolean(document.querySelector('#next-class').textContent)"));
    const toolsFrame = await until(() => main.webContents.mainFrame.frames.find(frame => frame.url.includes('tools.html?embedded=1')));
    await until(() => toolsFrame.executeJavaScript('Boolean(currentState)'));
    const windowsBefore = BrowserWindow.getAllWindows().length;
    await toolsFrame.executeJavaScript("document.querySelector('[data-tool=countdown]').click(); document.querySelector('#minutes-input').value = '2'; document.querySelector('#countdown-start').click()");
    await until(() => toolsFrame.executeJavaScript('currentState.countdown.running'));
    await main.webContents.executeJavaScript("navigate('random'); navigate('clock'); render()");
    assert.equal(await toolsFrame.executeJavaScript('currentState.countdown.running && activeTool === "countdown"'), true);
    assert.equal(BrowserWindow.getAllWindows().length, windowsBefore, 'Tools run inside the main clock page');
    await toolsFrame.executeJavaScript('shell.countdownReset()');
    for (const tool of ['pomodoro', 'stopwatch', 'reminders']) {
      await toolsFrame.executeJavaScript(`document.querySelector('#tool-back').click(); document.querySelector('[data-tool=${tool}]').click()`);
      assert.equal(await toolsFrame.executeJavaScript(`!document.querySelector('[data-tool-view=${tool}]').hidden`), true);
    }
    if (process.env.TOOLKIT_TEST_NAMES_FILE) {
      const imported = JSON.parse(fs.readFileSync(process.env.TOOLKIT_TEST_NAMES_FILE, 'utf8'));
      const people = imported.lists?.[0]?.people || imported.names || imported.students || imported;
      await main.webContents.executeJavaScript(`(async () => {
        const importedNames = ${JSON.stringify(people)};
        const names = importedNames.map((person) => ({ name: String(person.name || person.student || '').trim(), group: String(person.group || '').trim() })).filter((person) => person.name);
        state = await api.saveState({ ...state, names, nameLists: [{ name: '测试名单', names }] });
        navigate('random');
        return true;
      })()`);
      assert.equal(await main.webContents.executeJavaScript('state.names.length'), people.length);
      assert.equal(await main.webContents.executeJavaScript("Boolean(document.querySelector('.draw-result'))"), true);
    }
    const example = { schedule: [
      { weekday: 1, id: 'mon-am', subject: '数学', course: '数学', start: '08:00', duration: 40, breakDuration: 10 },
      { weekday: 1, id: 'mon-pm', subject: '艺术', course: '艺术', start: '14:00', duration: 40, breakDuration: 10 },
      { weekday: 1, id: 'mon-night', subject: '自习', course: '自习', start: '19:00', duration: 40, breakDuration: 0 },
      { weekday: 2, id: 'tue-am', subject: '英语', course: '英语', start: '08:00', duration: 40, breakDuration: 10 }
    ], subjectTeachers: { 数学: '示例老师' } };
    const datasets = process.env.TOOLKIT_TEST_SCHEDULE_FILES
      ? JSON.parse(process.env.TOOLKIT_TEST_SCHEDULE_FILES).map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
      : [example];
    let checks = 0;
    const promotions = [];
    for (const method of ['show', 'focus', 'showInactive', 'restore']) {
      const original = clock[method].bind(clock);
      clock[method] = (...args) => { promotions.push(method); return original(...args); };
    }
    let alerts = 0;
    clock.webContents.on('media-started-playing', () => { alerts++; });
    for (const data of datasets) {
      const normalized = require('../src/schedule.js').normalize(data);
      await main.webContents.executeJavaScript(`(async () => {
        const imported = ToolkitSchedule.normalize(${JSON.stringify(data)});
        state = await api.saveState({ ...state, schedule: imported.schedule, settings: { ...state.settings, subjectTeachers: imported.subjectTeachers } });
        for (const view of ['home', 'random', 'assignments', 'clock', 'settings']) navigate(view);
        return true;
      })()`);
      assert.equal(await main.webContents.executeJavaScript('state.schedule.length'), normalized.schedule.length);
      await until(() => clock.webContents.executeJavaScript(`toolkitLessons.length === ${normalized.schedule.length}`));
      for (let day = 1; day <= 7; day++) {
        const expected = normalized.schedule.filter((r) => r.weekday == null || r.weekday === day);
        const rendered = await main.webContents.executeJavaScript(`(() => { scheduleDay = ${day}; navigate('schedule'); return document.querySelectorAll('[data-delete-schedule]').length; })()`);
        assert.equal(rendered, expected.length);
      }
      for (const row of normalized.schedule) {
        const [hour, minute] = row.start.split(':').map(Number);
        const date = new Date(2026, 8, 14 + ((row.weekday || 1) - 1), hour, minute).getTime();
        const result = await main.webContents.executeJavaScript(`(() => {
          const NativeDate = Date;
          window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [${date}])); } };
          try { navigate('clock'); const text = document.querySelector('#clock-summary').textContent; navigate('schedule'); return { course: ToolkitSchedule.summary(state.schedule).item?.course, rows: document.querySelectorAll('.schedule-row').length, text }; }
          finally { window.Date = NativeDate; }
        })()`);
        assert.equal(result.course, row.course);
        assert.equal(result.rows, new Set(normalized.schedule.map((r) => r.start)).size);
        assert.ok(result.text.includes(row.course));
        const text = await clock.webContents.executeJavaScript(`(() => { renderNextClass(new Date(${date})); return document.querySelector('#next-class').textContent; })()`);
        assert.ok(text.includes('上课中') && text.includes(row.course));
        checks++;
      }
    }
    assert.deepEqual(promotions, [], 'Schedule updates must not promote the clock');
    assert.equal(alerts, 0, 'Schedule updates must remain silent');
    main.show();
    await main.webContents.executeJavaScript(`(async () => {
      const names = Array.from({ length: 40 }, (_, index) => ({ name: index === 0 ? 'Long name '.repeat(30) : 'Student ' + (index + 1), group: '' }));
      state = await api.saveState({ ...state, names, nameLists: [{ name: 'UI test', names }], drawnIds: [], settings: { ...state.settings, selectedNameList: 'UI test', drawMode: 'single', drawContinuous: true, drawResultFontSize: 30 } });
      navigate('random');
      document.querySelector('[data-action="draw"]').click();
    })()`);
    await until(() => main.webContents.executeJavaScript("!drawPending && document.querySelectorAll('.member-chip').length === 1"));
    const selected = await main.webContents.executeJavaScript("document.querySelector('.member-chip').textContent");
    await main.webContents.executeJavaScript("navigate('clock'); navigate('random'); render()");
    assert.equal(await main.webContents.executeJavaScript("document.querySelector('.member-chip').textContent"), selected, 'Results survive navigation and state redraws');
    assert.equal(await main.webContents.executeJavaScript('state.drawnIds.length'), 1);
    await main.webContents.executeJavaScript("document.querySelector('[data-action=\"reset-drawn\"]').click()");
    await until(() => main.webContents.executeJavaScript("state.drawnIds.length === 0 && !document.querySelector('.member-chip')"));
    await main.webContents.executeJavaScript(`(async () => {
      state.settings.drawMode = 'group'; state.settings.drawGroupSize = 2; state.settings.drawGroupCount = 20;
      await save(); document.querySelector('[data-action="draw"]').click();
    })()`);
    await until(() => main.webContents.executeJavaScript("!drawPending && document.querySelectorAll('.member-chip').length === 40"));
    assert.equal(await main.webContents.executeJavaScript("getComputedStyle(document.querySelector('.member-chip')).fontSize"), '30px');
    const grouped = await main.webContents.executeJavaScript("document.querySelector('#draw-result').textContent");
    await main.webContents.executeJavaScript("document.querySelector('[data-action=\"draw\"]').click()");
    await until(() => main.webContents.executeJavaScript('!drawPending'));
    assert.equal(await main.webContents.executeJavaScript("document.querySelector('#draw-result').textContent"), grouped, 'Exhaustion preserves previous results');
    for (const [width, height] of [[1180, 800], [900, 640]]) {
      main.setSize(width, height);
      await wait(400);
      assert.equal(await main.webContents.executeJavaScript(`(() => {
        const result = document.querySelector('#draw-result');
        const names = [...document.querySelectorAll('.group-members')];
        const left = names[0].getBoundingClientRect().left;
        return result.scrollWidth <= result.clientWidth && result.scrollHeight > result.clientHeight && names.every(item => Math.abs(item.getBoundingClientRect().left - left) < 1);
      })()`), true, 'Groups align and scroll vertically without horizontal overflow');
      if (process.env.TOOLKIT_TEST_SCREENSHOTS) {
        fs.mkdirSync(process.env.TOOLKIT_TEST_SCREENSHOTS, { recursive: true });
        fs.writeFileSync(path.join(process.env.TOOLKIT_TEST_SCREENSHOTS, 'random-' + width + '.png'), (await main.webContents.capturePage()).toPNG());
      }
    }
    await main.webContents.executeJavaScript(`(async () => {
      state.settings.drawResultFontSize = 72;
      await save();
    })()`);
    assert.equal(await main.webContents.executeJavaScript("getComputedStyle(document.querySelector('.member-chip')).fontSize"), '72px');
    assert.equal(await main.webContents.executeJavaScript("document.querySelector('#draw-result').scrollWidth <= document.querySelector('#draw-result').clientWidth"), true);
    await main.webContents.executeJavaScript(`(async () => {
      state.nameLists.push({ name: 'Other list', names: [{name: 'Other student', group: ''}] });
      await save();
      const select = document.querySelector('[data-draw-list]');
      select.value = 'Other list'; select.dispatchEvent(new Event('change'));
    })()`);
    await until(() => main.webContents.executeJavaScript("state.names.length === 1 && state.settings.selectedNameList === 'Other list' && !document.querySelector('.member-chip')"));
    assert.equal(await main.webContents.executeJavaScript('state.drawnIds.length'), 0);
    const clockColors = await clock.webContents.executeJavaScript("['.time-text', '.date-text', '.next-class', '.countdown-summary'].map(selector => getComputedStyle(document.querySelector(selector)).color)");
    assert.equal(new Set(clockColors).size, 1, 'All desktop clock text uses the time color');
    await clock.webContents.executeJavaScript('shell.openToolkit()');
    await until(() => main.webContents.executeJavaScript("currentView === 'clock'"));
    await main.webContents.executeJavaScript('api.openClockSettings()');
    await until(() => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings.html')));
    await main.webContents.executeJavaScript('api.openClockTools()');
    await until(() => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/tools.html')));
    await until(() => clock.webContents.executeJavaScript('compactUi.active'));
    assert.equal(await main.webContents.executeJavaScript('state.settings.homeworkWidgetEnabled'), false);
    await main.webContents.executeJavaScript('api.saveState({ ...state, settings: { ...state.settings, homeworkWidgetEnabled: true } })');
    const widget = await until(() => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/widget.html')));
    await until(() => widget.webContents.executeJavaScript("typeof window.educationToolkit === 'object'"));
    await until(() => widget.isVisible());
    assert.equal(widget.isAlwaysOnTop(), false, 'Homework does not stay above other applications');
    if (process.platform !== 'linux') assert.equal(widget.isFocusable(), false);
    const widgetPromotions = [];
    for (const method of ['show', 'showInactive', 'focus', 'restore']) {
      const original = widget[method].bind(widget);
      widget[method] = (...args) => { widgetPromotions.push(method); return original(...args); };
    }
    assert.deepEqual(widget.getSize(), [108, 108]);
    await widget.webContents.executeJavaScript('educationToolkit.toggleHomeworkWidget(true)');
    assert.deepEqual(widget.getSize(), [620, 380]);
    await wait(100);
    assert.deepEqual(widget.getSize(), [620, 380]);
    await main.webContents.executeJavaScript("api.saveState({ ...state, assignments: Array.from({length: 8}, (_, i) => ({ id: String(i), name: 'Assignment ' + i, subject: 'Math' })) })");
    await until(() => widget.webContents.executeJavaScript("document.querySelectorAll('.assignment').length === 8"));
    assert.deepEqual(await widget.webContents.executeJavaScript("['.header .title', '.assignment strong', '.assignment span'].map(selector => getComputedStyle(document.querySelector(selector)).fontSize)"), ['24px', '28px', '22px']);
    assert.equal(await widget.webContents.executeJavaScript("document.querySelector('.content').scrollHeight > document.querySelector('.content').clientHeight"), true);
    if (process.env.TOOLKIT_TEST_SCREENSHOTS) {
      fs.writeFileSync(path.join(process.env.TOOLKIT_TEST_SCREENSHOTS, 'homework.png'), (await widget.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(process.env.TOOLKIT_TEST_SCREENSHOTS, 'clock.png'), (await clock.webContents.capturePage()).toPNG());
    }
    await widget.webContents.executeJavaScript('educationToolkit.toggleHomeworkWidget(false)');
    await wait(200);
    assert.deepEqual(widget.getSize(), [108, 108]);
    const before = clock.getPosition();
    assert.deepEqual(widgetPromotions, [], 'Homework updates and resizing must not promote the widget');
    await clock.webContents.executeJavaScript('shell.moveWindowBy(10, 10)');
    await until(() => clock.getPosition()[0] !== before[0] || clock.getPosition()[1] !== before[1]);
    await new Promise((resolve, reject) => {
      const child = utilityProcess.fork(path.join(__dirname, '../src/modules/elegant-clock/src/watchdog.js'));
      const timer = setTimeout(() => { child.kill(); reject(new Error('Watchdog did not start')); }, 10000);
      child.on('message', (message) => { if (message.type === 'watchdog-ready') child.postMessage({ type: 'shutdown' }); });
      child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Watchdog failed')); });
    });
    await require('./electron-adjustments.cjs')(main, clock, until, profile);
    assert.deepEqual(errors, []);
    console.log(`Electron UI verified: ${checks} lesson starts, all weekday tables, embedded clock, tools, settings, drag and watchdog.`);
    app.quit();
  } catch (error) {
    console.error(error, errors);
    app.exit(1);
  }
});
app.on('will-quit', () => fs.rmSync(profile, { recursive: true, force: true }));
