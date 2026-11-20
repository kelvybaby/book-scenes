import { chromium } from '/Users/kelvinzhou/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import fs from 'node:fs/promises'
const out = process.argv[2]
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const issues = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', e => issues.push(e.message))
  page.on('response', r => { if (r.status() >= 400) issues.push(`${r.status()} ${r.url()}`) })
  await page.goto('http://127.0.0.1:5173/?bookPrototype=on#book-model-lab')
  await page.locator('#book-model-lab').scrollIntoViewIfNeeded()
  await page.waitForSelector('.book-model-lab--ready')
  await page.waitForTimeout(750)
  await page.evaluate(() => {
    const native = window.requestAnimationFrame.bind(window)
    window.bookFrameMeasures = []
    window.requestAnimationFrame = callback => native(timestamp => {
      const canvas = document.querySelector('.book-model-lab__canvas')
      const count = canvas?.dataset.renderCount
      const start = performance.now()
      callback(timestamp)
      if (canvas && canvas.dataset.renderCount !== count) {
        window.bookFrameMeasures.push({ timestamp, cpuMS: performance.now() - start, step: canvas.dataset.turnStep, velocity: canvas.dataset.turnVelocity })
      }
    })
  })
  const next = () => page.getByRole('button', { name: 'Next page', exact: true }).click()
  const snap = name => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 88 })
  await snap('closed-front')
  await next(); await page.waitForTimeout(3500)
  await next(); await page.waitForTimeout(3500)
  for (let i = 0; i < 4; i++) await next()
  await page.waitForTimeout(8500); await snap('page-5')
  const idleBefore = await page.locator('.book-model-lab__canvas').getAttribute('data-render-count')
  await page.waitForTimeout(1500)
  const idleAfter = await page.locator('.book-model-lab__canvas').getAttribute('data-render-count')
  const performanceFrames = await page.evaluate(() => window.bookFrameMeasures)
  await page.locator('#book-model-lab').press('ArrowDown')
  await page.locator('#book-model-lab').press('Shift+ArrowRight')
  await page.waitForTimeout(100); await snap('keyboard-orbit')
  // Orbit to the low head/tail inspection view without changing page state.
  await page.getByRole('button', { name: 'Reset view' }).click()
  await page.mouse.move(720, 450); await page.mouse.down(); await page.mouse.move(710, 391, { steps: 20 }); await page.mouse.up()
  await page.waitForTimeout(100); await snap('low-page-5')
  // Offscreen pausing while an actual turn is active.
  await page.getByRole('button', { name: 'Previous page', exact: true }).click()
  await page.waitForTimeout(250)
  await page.locator('.scene').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const offscreenBefore = await page.locator('.book-model-lab__canvas').getAttribute('data-render-count')
  await page.waitForTimeout(700)
  const offscreenAfter = await page.locator('.book-model-lab__canvas').getAttribute('data-render-count')
  await page.locator('#book-model-lab').scrollIntoViewIfNeeded(); await page.waitForTimeout(3000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await next(); await page.waitForTimeout(100)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Reset view' }).click(); await page.waitForTimeout(100); await snap('mobile-page-5')
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const touch = await mobile.newPage()
  await touch.goto('http://127.0.0.1:5173/?bookPrototype=on#book-model-lab')
  await touch.locator('#book-model-lab').scrollIntoViewIfNeeded(); await touch.waitForSelector('.book-model-lab--ready')
  await touch.waitForTimeout(200)
  await touch.screenshot({ path: `${out}/mobile-reduced-closed.jpg`, type: 'jpeg', quality: 88 })
  await touch.getByRole('button', { name: 'Next page', exact: true }).tap(); await touch.waitForTimeout(100)
  await touch.getByRole('button', { name: 'Next page', exact: true }).tap(); await touch.waitForTimeout(100)
  const cdp = await mobile.newCDPSession(touch)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 270, y: 470 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await touch.waitForTimeout(100)
  await touch.screenshot({ path: `${out}/mobile-touch-drag.jpg`, type: 'jpeg', quality: 88 })
  const touchState = await touch.locator('#book-model-lab').evaluate(el => ({ className: el.className, scrollY: window.scrollY, turn: el.querySelector('canvas')?.dataset.turnStep }))
  await fs.writeFile(`${out}/finish-inspection.json`, JSON.stringify({ issues, idleBefore, idleAfter, offscreenBefore, offscreenAfter, touchState, performanceFrames, context: 'Headless installed Chrome, 1440x1000 DPR 1. Callback CPU time includes geometry posing and rendering submission; excludes GPU execution.' }, null, 2))
} finally {
  await browser.close()
}
