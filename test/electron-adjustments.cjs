const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, ipcMain } = require('electron');

module.exports = async function testAdjustments(main, clock, until, profile) {
  const run = code => main.webContents.executeJavaScript(code);
  const snapshot = await run('api.getState()');
  const set = async (name, value, change = false) => run(`(() => { const input = document.querySelector('#adjustment-form [name="${name}"]'); input.value = ${JSON.stringify(value)}; ${change ? "input.dispatchEvent(new Event('change'));" : ''} })()`);
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  async function preview() {
    await run("document.querySelector('#adjustment-form').requestSubmit()");
    await until(() => run('Boolean(adjustmentPreview)'));
  }
  async function confirm(count) {
    await click('[data-confirm-adjustment]');
    await until(() => run(`!adjustmentSaving && !adjustmentPreview && state.scheduleHistory.length === ${count}`));
  }
  async function open(type, date) {
    await click('[data-new-adjustment]');
    await set('date', date, true);
    await set('type', type, true);
  }
  await run(`(async () => {
    state = await api.saveState({ ...state, schedule: [
      {id:'math', weekday:1, course:'数学', subject:'数学', start:'08:00', duration:40, breakDuration:0},
      {id:'english', weekday:2, course:'英语', subject:'英语', start:'09:00', duration:45, breakDuration:10}
    ], scheduleOverrides:{}, scheduleHistory:[], assignments:[
      {id:'homework', name:'测试作业', lessonId:'math', reminderMode:'schedule', lessonOccurrence:'2030-01-07:math', lessonDate:'2030-01-07', dueAt:new Date('2030-01-07T08:00:00').toISOString(), relation:'before'}
    ], settings:{...state.settings, subjectTeachers:{数学:'甲老师', 英语:'乙老师'}} });
    actualWeekDate = '2030-01-07'; navigate('schedule');
  })()`);
  await click('[data-adjust-date="2030-01-07"][data-adjust-lesson="math"]');
  await set('targetDate', '2030-01-15', true);
  await set('targetLessonId', 'english');
  await set('reason', '跨周调课测试');
  await preview();
  assert.equal(await run('adjustmentPreview.reminderChanges.length'), 1);
  assert.equal(await run('state.scheduleOverrides["2030-01-07"] === undefined'), true, 'Preview must not save');
  if (process.env.TOOLKIT_TEST_SCREENSHOTS) {
    await new Promise(resolve => setTimeout(resolve, 250));
    fs.writeFileSync(path.join(process.env.TOOLKIT_TEST_SCREENSHOTS, 'adjustment-preview.png'), (await main.webContents.capturePage()).toPNG());
  }
  await confirm(1);
  assert.equal(await run("ToolkitSchedule.forDate(state, '2030-01-07')[0].course"), '英语');
  assert.equal(await run('state.assignments[0].dueAt'), new Date('2030-01-15T09:00:00').toISOString());
  await run("navigate('assignments'); document.querySelector('[data-edit-assignment=homework]').click()");
  assert.equal(await run("document.querySelector('#assignment-due').value"), '2030-01-15T09:00');
  await run("document.querySelector('#assignment-name').value = '修改名称'; document.querySelector('#assignment-form').requestSubmit()");
  await until(() => run("editingAssignmentId === null && state.assignments[0].name === '修改名称'"));
  assert.equal(await run('state.assignments[0].reminderMode'), 'schedule');
  assert.equal(await run('state.assignments[0].lessonOccurrence'), '2030-01-07:math');
  await run("navigate('schedule')");
  await until(() => clock.webContents.executeJavaScript("Boolean(toolkitScheduleOverrides['2030-01-07'])"));
  assert.match(await clock.webContents.executeJavaScript("renderNextClass(new Date('2030-01-07T08:10:00')); document.querySelector('#next-class').textContent"), /英语.*\n乙老师/);
  assert.equal(await run("refreshActualSchedule(new Date('2030-01-07T08:10:00')); document.querySelector('.actual-week .actual-lesson.current').textContent.includes('英语')"), true);
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'education-toolkit.json'), 'utf8'));
  assert.equal(saved.scheduleOverrides['2030-01-07'].lessons[0].course, '英语');
  await new Promise(resolve => { main.webContents.once('did-finish-load', resolve); main.webContents.reload(); });
  await until(() => run("typeof state !== 'undefined' && state.scheduleHistory?.length === 1"));
  await run("actualWeekDate = '2030-01-07'; navigate('schedule')");
  await open('move', '2030-01-07');
  await set('targetDate', '2030-01-09', true);
  await set('start', '10:00');
  await preview();
  await confirm(2);
  assert.equal(await run("ToolkitSchedule.forDate(state, '2030-01-07').length"), 0);
  assert.equal(await run("ToolkitSchedule.forDate(state, '2030-01-09')[0].course"), '英语');
  const first = await run('state.scheduleHistory[0].id');
  await click(`[data-undo-adjustment="${first}"]`);
  assert.equal(await run('adjustmentPreview === null'), true, 'Dependent undo must be rejected');
  assert.match(await run('toast.textContent'), /后续调整/);
  await open('off', '2030-01-15');
  await preview();
  assert.equal(await run('adjustmentPreview.reminderChanges[0].after'), '');
  await confirm(3);
  assert.equal(await run('state.assignments[0].schedulePaused'), true);
  const offId = await run('state.scheduleHistory[2].id');
  await click(`[data-undo-adjustment="${offId}"]`);
  await confirm(3);
  assert.equal(await run('state.assignments[0].dueAt'), new Date('2030-01-15T09:00:00').toISOString());
  await open('custom', '2030-01-09');
  await run("document.querySelector('[data-custom-row] [data-field=course]').value = '临时班会'; document.querySelector('[data-custom-row] [data-field=teacher]').value = '代课老师'");
  await preview();
  await confirm(4);
  assert.equal(await run("ToolkitSchedule.forDate(state, '2030-01-09')[0].teacher"), '代课老师');
  await open('weekday', '2030-01-12');
  await set('weekday', '1');
  await preview();
  await confirm(5);
  assert.equal(await run("ToolkitSchedule.forDate(state, '2030-01-12')[0].course"), '数学');
  await open('off', '2030-01-12');
  await preview();
  await run('(async () => { state = await api.saveState({...state, settings:{...state.settings, themeColor:"#8877cc"}}); })()');
  await click('[data-confirm-adjustment]');
  await until(() => run('!adjustmentSaving && !adjustmentPreview'));
  assert.equal(await run('state.scheduleHistory.length'), 5, 'Stale preview must not overwrite changed state');
  assert.match(await run('toast.textContent'), /数据已发生变化/);
  await run("actualWeekDate = '2030-01-07'; adjustmentDraft = null; navigate('schedule'); document.querySelector('.content').scrollTop = 0");
  if (process.env.TOOLKIT_TEST_SCREENSHOTS) {
    await new Promise(resolve => setTimeout(resolve, 250));
    fs.writeFileSync(path.join(process.env.TOOLKIT_TEST_SCREENSHOTS, 'actual-schedule.png'), (await main.webContents.capturePage()).toPNG());
  }
  await run(`api.saveState(${JSON.stringify(snapshot)})`);

  ipcMain.removeHandler('app:get-update-info');
  ipcMain.handle('app:get-update-info', () => ({ releaseName: 'Education Toolkit test', currentVersion: '1.0.6', latestVersion: '1.0.7', releaseNotes: '##新增功能\n\n- **加粗**\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[链接](https://github.com)\n\n<img src=x onerror="window.injected=true"><script>window.injected=true</script>', releaseUrl: 'https://github.com/Dai2010/Education-Toolkit/releases', asset: null }));
  const update = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../src/modules/elegant-clock/src/preload.js'), contextIsolation: true, nodeIntegration: false } });
  await update.loadFile(path.join(__dirname, '../src/modules/elegant-clock/src/update.html'));
  await until(() => update.webContents.executeJavaScript("document.title === 'Education Toolkit v1.0.7 可用'"));
  assert.equal(await update.webContents.executeJavaScript("document.querySelector('.eyebrow').textContent"), 'Education Toolkit 更新');
  assert.equal(await update.webContents.executeJavaScript("document.body.textContent.includes('桌面时钟更新')"), false);
  assert.equal(await update.webContents.executeJavaScript("Boolean(document.querySelector('#release-notes h2') && document.querySelector('#release-notes strong') && document.querySelector('#release-notes table'))"), true);
  assert.equal(await update.webContents.executeJavaScript("!window.injected && !document.querySelector('#release-notes script, #release-notes img')"), true);
  update.destroy();
  console.log('Date adjustments verified: real forms, cross-week swap, move, holiday, custom day, undo, linked reminders, persistence, clock synchronization and update branding.');
};
