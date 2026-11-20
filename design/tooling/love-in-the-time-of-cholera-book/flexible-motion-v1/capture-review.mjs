// Visual inspection only: no assertions or test runner. Uses the installed
// browser and bundled Playwright; records the actual application renderer.
import { chromium } from '/Users/kelvinzhou/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import fs from 'node:fs/promises'
const out = process.argv[2]
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const issues = []
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('pageerror', e => issues.push(e.message))
page.on('response', r => { if (r.status() >= 400) issues.push(`${r.status()} ${r.url()}`) })
await page.goto('http://127.0.0.1:5173/?bookPrototype=on#book-model-lab')
const lab = page.locator('#book-model-lab')
await lab.scrollIntoViewIfNeeded()
await page.waitForSelector('.book-model-lab--ready')
await page.waitForTimeout(750)
await page.clock.install()
await page.clock.pauseAt(new Date())
const states = []
const state = async label => states.push({ label, ...await page.locator('.book-model-lab__canvas').evaluate(el => ({ ...el.dataset })) })
const snap = async name => { await page.screenshot({ path: `${out}/${name}.png` }); await state(name) }
const next = () => page.getByRole('button', { name: 'Next page', exact: true }).click()
const prev = () => page.getByRole('button', { name: 'Previous page', exact: true }).click()
const run = async (name, frames = 60) => {
  await fs.mkdir(`${out}/${name}`, { recursive: true })
  for (let i = 0; i <= frames; i++) {
    if (i) await page.clock.runFor(50)
    await page.screenshot({ path: `${out}/${name}/${String(i).padStart(3, '0')}.png` })
    await state(`${name}/${i}`)
  }
}
await snap('closed-front')
await next(); await run('cover', 64)
await page.getByRole('button', { name: 'Reset view' }).click(); await page.clock.runFor(100)
await next(); await run('forward', 64)
await prev(); await run('backward', 64)
await next(); await page.clock.runFor(700); await snap('reversal-start')
await prev(); await run('reversal', 64)
for (let i = 0; i < 5; i++) await next()
await run('rapid', 150)
await page.clock.runFor(1500); await snap('page-5')
const idleBefore = await page.locator('canvas.book-model-lab__canvas').getAttribute('data-render-count')
await page.clock.runFor(1500)
const idleAfter = await page.locator('canvas.book-model-lab__canvas').getAttribute('data-render-count')
// Direct mouse inspection: short, long, diagonal, reversed, pole and outside.
await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(950, 400, { steps: 20 }); await page.mouse.up(); await page.clock.runFor(30); await snap('drag-horizontal')
await page.mouse.move(950, 400); await page.mouse.down(); await page.mouse.move(700, 400, { steps: 20 }); await page.mouse.up(); await page.clock.runFor(30); await snap('drag-reversed')
await page.mouse.move(800, 300); await page.mouse.down(); await page.mouse.move(950, 480, { steps: 20 }); await page.mouse.up(); await page.clock.runFor(30); await snap('drag-diagonal')
await page.mouse.move(900, 400); await page.mouse.down(); await page.mouse.move(900, 980, { steps: 30 }); await page.mouse.up(); await page.clock.runFor(30); await snap('drag-pole')
await page.mouse.move(900, 400); await page.mouse.down(); await page.mouse.move(1450, 600, { steps: 25 }); await page.mouse.up(); await page.clock.runFor(30); await snap('drag-outside')
await page.getByRole('button', { name: 'Reset view' }).click(); await page.clock.runFor(50); await snap('reset')
await lab.press('ArrowDown'); await lab.press('Shift+ArrowRight'); await page.clock.runFor(50); await snap('keyboard-orbit')
await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(100); await page.getByRole('button', { name: 'Reset view' }).click(); await page.clock.runFor(100); await snap('mobile-page-5')
await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.runFor(50)
for (let i = 0; i < 6; i++) await prev()
await page.clock.runFor(50); await snap('mobile-reduced-closed')
await next(); await page.clock.runFor(50); await snap('mobile-reduced-cover')
await next(); await page.clock.runFor(50); await snap('mobile-reduced-leaf')
await fs.writeFile(`${out}/inspection.json`, JSON.stringify({ issues, idleBefore, idleAfter, states }, null, 2))
await browser.close()
