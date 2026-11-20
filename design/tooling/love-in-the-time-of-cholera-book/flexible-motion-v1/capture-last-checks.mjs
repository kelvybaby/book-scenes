import { chromium } from '/Users/kelvinzhou/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import fs from 'node:fs/promises'
const out = process.argv[2]
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:5173/?bookPrototype=on#book-model-lab')
  const lab = page.locator('#book-model-lab')
  await lab.scrollIntoViewIfNeeded(); await page.waitForSelector('.book-model-lab--ready'); await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/closed-front-final.jpg`, type: 'jpeg', quality: 88 })
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await page.waitForTimeout(100)
  await page.mouse.move(720, 450); await page.mouse.down(); await page.mouse.move(720, 365, { steps: 20 }); await page.mouse.up()
  await page.waitForTimeout(100)
  await page.screenshot({ path: `${out}/low-page-5-final.jpg`, type: 'jpeg', quality: 90 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await page.waitForTimeout(150)
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150)
  const count = () => page.locator('.book-model-lab__canvas').getAttribute('data-render-count')
  const offscreenBefore = await count(); await page.waitForTimeout(650); const offscreenAfter = await count()
  await lab.scrollIntoViewIfNeeded(); await page.waitForTimeout(3500)
  const idleBefore = await count(); await page.waitForTimeout(650); const idleAfter = await count()
  // A canceled drag must clear capture, restore the cursor and not turn a leaf.
  const beforeCancel = await page.locator('.book-model-lab__canvas').getAttribute('data-turn-step')
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(750, 450, { steps: 10 })
  await lab.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' }); await page.mouse.up()
  await page.waitForTimeout(100)
  const afterCancel = await page.locator('.book-model-lab__canvas').getAttribute('data-turn-step')
  const draggingAfterCancel = await lab.evaluate(el => el.classList.contains('book-model-lab--dragging'))
  await page.getByRole('button', { name: 'Reset view' }).click(); await page.waitForTimeout(100)
  await page.screenshot({ path: `${out}/reset-final.jpg`, type: 'jpeg', quality: 88 })
  await fs.writeFile(`${out}/last-checks.json`, JSON.stringify({ offscreenBefore, offscreenAfter, idleBefore, idleAfter, beforeCancel, afterCancel, draggingAfterCancel }, null, 2))
} finally { await browser.close() }
