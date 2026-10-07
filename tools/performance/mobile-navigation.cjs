/* Layout interaction checks with isolated API fixtures; no live account or feeds. */
const {createRequire} = require('node:module');
const {mkdirSync} = require('node:fs');
const req = createRequire(process.env.FRONTEND_DIR + '/package.json');
const {chromium} = req('playwright');
(async () => {
  const browser = await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
  mkdirSync('/results',{recursive:true});
  try {
    for (const [width,height] of [[320,740],[844,390],[1024,768]]) {
      const page = await browser.newPage({viewport:{width,height},hasTouch:true});
      page.on('pageerror', e => console.error('PAGE:',e.message));
      await page.addInitScript(() => sessionStorage.setItem('sw_token','synthetic-layout'));
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if(!path.startsWith('/api/'))return route.fallback();
        const data = path.includes('/auth/me') ? {id:1,username:'very-long-mobile-test-username',role:'viewer',is_active:true} : path.includes('setup-status') ? {setup_required:false} : path.includes('/config/location') ? {lat:45,lon:-122,radius_nm:100} : [];
        return route.fulfill({json:data});
      });
      await page.route('**/world-countries*.json', route => route.fulfill({json:{type:'FeatureCollection',features:[]}}));
      await page.route('https://**/*', route => /style\.json|styles\/v1/.test(route.request().url()) ? route.fulfill({json:{version:8,sources:{},layers:[]}}) : route.abort());
      await page.goto('http://localhost:3900');
      await page.getByRole('button',{name:'Mission & feeds',exact:true}).click().catch(async e => { console.error(await page.locator('body').innerText()); await page.screenshot({path:'/results/failure-'+width+'.png'}); throw e; });
      await page.getByRole('tablist',{name:'Tactical sections',exact:true}).getByRole('tab',{name:'Feeds',exact:true}).click({noWaitAfter:true});
      await page.getByRole('button',{name:'Toggle filter options',exact:true}).click();
      const overflow = await page.locator('#hud-left-panel').evaluate(panel => {
        const bounds=panel.getBoundingClientRect();
        return [...panel.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length).filter(el=>{const r=el.getBoundingClientRect();return r.left<bounds.left-1 || r.right>bounds.right+1;}).map(el=>el.getAttribute('aria-label') || el.textContent.trim().slice(0,80));
      });
      if(overflow.length)throw new Error(width+'px filter controls overflow: '+JSON.stringify(overflow));
      await page.screenshot({path:'/results/filters-'+width+'.png'});
      await page.getByRole('button',{name:'Close layers panel',exact:true}).click();
      await page.getByRole('button',{name:'Tools',exact:true}).click();
      await page.screenshot({path:'/results/tools-'+width+'.png'});
      await page.getByRole('button',{name:'System settings',exact:true}).click();
      await page.getByRole('button',{name:'Close Settings',exact:true}).click();
      await page.getByRole('button',{name:'Tools',exact:true}).click();
      await page.getByRole('button',{name:'Toggle Raw Data Terminal',exact:true}).click();
      const terminal=page.getByRole('dialog',{name:'Raw Data Terminal',exact:true});
      const box=await terminal.boundingBox();
      if(!box || box.x<0 || box.x+box.width>width || box.y+box.height>height)throw new Error(width+'px terminal overflows');
      await page.getByRole('button',{name:'Close menu',exact:true}).click({position:{x:4,y:4}});
      const headerOverflow=await page.locator('.hud-topbar').evaluate(el=>el.scrollWidth>el.clientWidth);
      if(headerOverflow)throw new Error(width+'px header overflows');
      console.log(JSON.stringify({width,height,filters:'bounded',tools:'accessible',header:'bounded'}));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
