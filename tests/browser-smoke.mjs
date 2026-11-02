import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Access your research desk' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('groww-connect-login')), null);

    await page.goto(base + '/?sample=true', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Signal intelligence' }).waitFor();
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1);
    const first = page.getByRole('tab', {name:'Signals', exact:true});
    assert.equal(await first.getAttribute('aria-selected'),'true');

    await page.getByRole('tab', {name:'Portfolio', exact:true}).click();
    await page.getByRole('heading', {name:'Portfolio workspace'}).waitFor();
    await page.getByRole('heading', {name:'Multi-Market Stock Portfolio'}).waitFor();
    assert.equal(await page.locator('[role="tabpanel"]').count(),1);
    assert.equal(await page.getByRole('tab',{name:'Portfolio',exact:true}).getAttribute('aria-selected'),'true');

    await page.getByRole('tab',{name:'Portfolio',exact:true}).press('ArrowRight');
    await page.getByRole('heading',{name:'Strategy lab'}).waitFor();
    await page.getByRole('tab',{name:'Strategies'}).press('Home');
    await page.getByRole('heading',{name:'Signal intelligence'}).waitFor();

    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }));
    assert.ok(geometry.content <= geometry.viewport + 2,
      `Horizontal document overflow at ${width}px: ${JSON.stringify(geometry)}`);
    assert.deepEqual(errors, [], `JavaScript errors at ${width}px`);
    console.log(`PASS browser smoke ${width}x${height}, navigation and accessibility`);
    await page.close();
  }
} finally {
  await browser.close();
}
