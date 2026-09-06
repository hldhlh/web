async page => {
  const results = [];
  const check = (value, label) => { if (!value) throw new Error(label); results.push(label); };
  await page.getByRole('button', { name: '下移快捷访问', exact: true }).click();
  await page.evaluate(() => {
    window.originalPutJSON = AcademyStore.putJSON;
    AcademyStore.putJSON = async () => { throw new Error('模拟本机存储失败'); };
  });
  await page.getByRole('button', { name: '保存布局', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.home-layout-feedback').textContent.includes('保存失败'));
  check(await page.locator('[data-layout-key]').first().getAttribute('data-layout-key') === 'status', 'failed save retains draft');
  await page.evaluate(() => { AcademyStore.putJSON = window.originalPutJSON; });
  await page.getByRole('button', { name: '撤销修改', exact: true }).click();
  check(await page.locator('[data-layout-key]').first().getAttribute('data-layout-key') === 'shortcuts', 'failed save does not replace saved layout');
  await page.evaluate(async () => {
    localStorage.removeItem('academy-ops-content-v1');
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('academy-reliable-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['cache', 'queue'], 'readwrite'); tx.objectStore('cache').clear(); tx.objectStore('queue').clear(); tx.oncomplete = resolve; tx.onerror = reject;
    }); db.close();
  });
  await page.reload();
  await page.waitForSelector('.home-layout-card');
  check(await page.locator('[data-layout-key]').first().getAttribute('data-layout-key') === 'shortcuts', 'fresh editor loads cloud layout before editing');
  check(await page.locator('[data-layout-key="exams"]').evaluate(node => node.classList.contains('is-hidden')), 'cloud visibility restored without local cache');
  await page.setViewportSize({width: 1280, height: 900});
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce', contrast: 'no-preference' });
  await page.screenshot({path: 'output/playwright/home-layout-desktop.png', fullPage: true});
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'large text no horizontal overflow');
  return {passed: results.length, results};
}
