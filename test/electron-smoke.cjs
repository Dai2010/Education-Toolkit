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
    await until(() => main.webContents.executeJavaScript("Boolean(document.querySelector('.module-grid'))"));
    await until(() => clock.webContents.executeJavaScript("typeof ToolkitSchedule === 'object' && Boolean(document.querySelector('#next-class').textContent)"));
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
        const rendered = await main.webContents.executeJavaScript(`(() => { scheduleDay = ${day}; settingsTab = 'schedule'; navigate('settings'); return document.querySelectorAll('[data-delete-schedule]').length; })()`);
        assert.equal(rendered, expected.length);
      }
      for (const row of normalized.schedule) {
        const [hour, minute] = row.start.split(':').map(Number);
        const date = new Date(2026, 8, 14 + ((row.weekday || 1) - 1), hour, minute).getTime();
        const result = await main.webContents.executeJavaScript(`(() => {
          const NativeDate = Date;
          window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [${date}])); } };
          try { navigate('clock'); return { course: ToolkitSchedule.summary(state.schedule).item?.course, rows: document.querySelectorAll('.schedule-table tbody tr').length, text: document.querySelector('#clock-summary').textContent }; }
          finally { window.Date = NativeDate; }
        })()`);
        assert.equal(result.course, row.course);
        assert.equal(result.rows, normalized.schedule.filter((r) => r.weekday == null || r.weekday === row.weekday).length);
        assert.ok(result.text.includes(row.course));
        const text = await clock.webContents.executeJavaScript(`(() => { renderNextClass(new Date(${date})); return document.querySelector('#next-class').textContent; })()`);
        assert.ok(text.includes('上课中') && text.includes(row.course));
        checks++;
      }
    }
    assert.deepEqual(promotions, [], 'Schedule updates must not promote the clock');
    assert.equal(alerts, 0, 'Schedule updates must remain silent');
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
    assert.equal(widget.getSize()[0], 54);
    await widget.webContents.executeJavaScript('educationToolkit.toggleHomeworkWidget(true)');
    assert.equal(widget.getSize()[0], 310);
    await wait(100);
    assert.equal(widget.getSize()[0], 310);
    await widget.webContents.executeJavaScript('educationToolkit.toggleHomeworkWidget(false)');
    await wait(200);
    assert.equal(widget.getSize()[0], 54);
    const before = clock.getPosition();
    await clock.webContents.executeJavaScript('shell.moveWindowBy(10, 10)');
    await until(() => clock.getPosition()[0] !== before[0] || clock.getPosition()[1] !== before[1]);
    await new Promise((resolve, reject) => {
      const child = utilityProcess.fork(path.join(__dirname, '../src/modules/elegant-clock/src/watchdog.js'));
      const timer = setTimeout(() => { child.kill(); reject(new Error('Watchdog did not start')); }, 10000);
      child.on('message', (message) => { if (message.type === 'watchdog-ready') child.postMessage({ type: 'shutdown' }); });
      child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Watchdog failed')); });
    });
    assert.deepEqual(errors, []);
    console.log(`Electron UI verified: ${checks} lesson starts, all weekday tables, embedded clock, tools, settings, drag and watchdog.`);
    app.quit();
  } catch (error) {
    console.error(error, errors);
    app.exit(1);
  }
});
app.on('will-quit', () => fs.rmSync(profile, { recursive: true, force: true }));
