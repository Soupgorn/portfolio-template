import { openPortfolio } from './portfolio-helpers';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('**/api/spotify/now-playing', route => route.fulfill({json:{status:'offline',track:null,fetchedAt:Date.now(),retryAfterSeconds:30}}));
});

test('Home contains one composition with tools, full-width music, and social footer', async ({page}) => {
  await openPortfolio(page);
  await expect(page.locator('.split-card .tech-stack')).toHaveCount(1);
  await expect(page.getByRole('heading',{name:'Tech Stack',exact:true})).toBeVisible();
  await expect(page.locator('.home-panel .project-card, .featured-empty, .home-section')).toHaveCount(0);
  await expect(page.getByText('SELECTED WORK / 01',{exact:true})).toHaveCount(0);
  await expect(page.locator('.music-note')).toHaveCount(0);
  await expect(page.locator('.split-card .contacts')).toHaveCount(1);
  await expect(page.locator('.info-card').filter({hasText:'Interests'})).toHaveCount(1);
  await expect(page.locator('.tech-stack li')).toHaveText(['TypeScript','Astro','Tailwind CSS','Git']);
  const projects=page.getByRole('button',{name:'Projects',exact:true});
  await page.keyboard.press('Tab');
  await projects.focus();await expect(projects).toHaveCSS('outline-style','solid');
  await page.keyboard.press('Enter');await expect(page).toHaveURL('http://127.0.0.1:4325/');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.locator('[data-welcome]')).toBeHidden();
});

for(const width of [375,430,768,1280,1440]){
  test(`compact Home composition fits ${width}px`,async({page},info)=>{
    await page.setViewportSize({width,height:1000});await openPortfolio(page);
    await page.evaluate(()=>document.fonts.ready);
    const box=async(selector:string)=>(await page.locator(selector).boundingBox())!;
    const upper=await box('.home-upper'), personal=await box('.personal-column'),tech=await box('.tech-stack'),music=await box('.music'),contacts=await box('.contacts');
    expect(music.y).toBeGreaterThanOrEqual(upper.y+upper.height);
    expect(music.width).toBeCloseTo(upper.width,0);expect(music.x).toBeCloseTo(upper.x,0);
    expect(contacts.y).toBeGreaterThan(music.y+music.height);
    if(width>=900){expect(tech.y).toBeCloseTo(personal.y,0);expect(tech.x).toBeGreaterThan(personal.x+personal.width);}
    else expect(tech.y).toBeGreaterThan(personal.y+personal.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('.quote-panel').evaluate(e=>e.clientWidth)).toBeGreaterThan(200);
    await page.screenshot({path:info.outputPath(`home-${width}.png`),fullPage:true});
  });
}

test('configured categories render in order; empty categories and empty toolboxes are omitted',async({page})=>{
  await page.goto('/__test/sections');
  await expect(page.locator('.tech-category h3')).toHaveText(['Fixture languages','Fixture web']);
  await expect(page.getByText('Empty category',{exact:true})).toHaveCount(0);
  for(const icon of await page.locator('.tech-category svg').all())await expect(icon).toHaveAttribute('aria-hidden','true');
  await page.goto('/__test/sections?state=no-tech');await expect(page.locator('.tech-stack')).toHaveCount(0);
  await page.setViewportSize({width:1440,height:1000});await page.goto('/__test/sections?state=empty-tech');
  await expect(page.locator('.tech-stack')).toHaveCount(0);
  const upper=(await page.locator('.home-upper').boundingBox())!,personal=(await page.locator('.personal-column').boundingBox())!;
  expect(personal.width).toBeCloseTo(upper.width,0);
});

test('welcome entry and profile lightbox retain keyboard behavior',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.getByRole('heading',{name:'Tech Stack',exact:true})).toBeHidden();
  await page.getByRole('button',{name:'Enter my space'}).click();
  const photo=page.getByRole('button',{name:'View larger profile photo'});await photo.click();
  await expect(page.getByRole('dialog',{name:'Profile photo'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Profile photo'})).toBeHidden();await expect(photo).toBeFocused();
});

test('Home remains readable without JavaScript and with enlarged text',async({browser,page})=>{
  const context=await browser.newContext({javaScriptEnabled:false});const noJs=await context.newPage();
  await noJs.goto('/');await expect(noJs.getByRole('heading',{name:'Tech Stack',exact:true})).toBeVisible();
  await expect(noJs.getByRole('heading',{name:'Example Web Application',exact:true}).first()).toBeVisible();await context.close();
  await page.setViewportSize({width:375,height:812});await openPortfolio(page);
  await page.locator('.tech-stack').evaluate(section=>{const elements=[...section.querySelectorAll<HTMLElement>('h2,h3,li')];const sizes=elements.map(e=>parseFloat(getComputedStyle(e).fontSize)*2);elements.forEach((e,i)=>e.style.fontSize=`${sizes[i]}px`);});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
