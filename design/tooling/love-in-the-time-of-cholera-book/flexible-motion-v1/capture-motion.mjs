import { chromium } from '/Users/kelvinzhou/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out=process.argv[2]; await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true, executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}); const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}); const page=await context.newPage();
const issues=[]; page.on('pageerror',e=>issues.push(e.message)); page.on('response',r=>{if(r.status()>=400)issues.push(`${r.status()} ${r.url()}`)});
await page.goto('http://127.0.0.1:5173/?bookPrototype=on');const lab=page.locator('#book-model-lab');await lab.scrollIntoViewIfNeeded();await page.waitForSelector('.book-model-lab--ready'); await page.waitForTimeout(1000);
await page.getByRole('button',{name:'Next page',exact:true}).click();await page.waitForTimeout(2600);await page.getByRole('button',{name:'Reset view'}).click(); await page.waitForTimeout(500);
await page.clock.install();await page.clock.pauseAt(new Date());
await page.screenshot({path:out+'/cover-open.png'});
await page.getByRole('button',{name:'Next page',exact:true}).click();
for(let i=0;i<=24;i++){if(i) await page.clock.runFor(80);await page.screenshot({path:out+`/forward-${String(i).padStart(3,'0')}.png`});}
await page.getByRole('button',{name:'Previous page',exact:true}).click();
for(let i=0;i<=24;i++){if(i) await page.clock.runFor(80);await page.screenshot({path:out+`/backward-${String(i).padStart(3,'0')}.png`});}
await fs.writeFile(out+'/browser-issues.json',JSON.stringify(issues,null,2));await browser.close();
