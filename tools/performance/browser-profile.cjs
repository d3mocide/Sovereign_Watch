/* Isolated synthetic profile: no real auth, data, or remote tiles. */
const {createRequire} = require('node:module');
const {spawn} = require('node:child_process');
const {writeFileSync,mkdirSync} = require('node:fs');
const path = require('node:path');
const app = process.env.FRONTEND_DIR || path.resolve(__dirname, '../../frontend');
const output = process.env.PROFILE_OUTPUT || '/results';
mkdirSync(output,{recursive:true});
const req = createRequire(path.join(app,'package.json'));
const {chromium, webkit} = req('playwright');
const protobuf = req('protobufjs');
(async () => {
 const schema = await protobuf.load(path.join(app,'public/tak.proto'));
 const Type = schema.lookupType('tak.proto.TakMessage');
 const browserName = process.env.BROWSER || 'chromium';
 const browser = await (browserName === 'webkit' ? webkit.launch() : chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']}));
 const results=[];
 const aircraft=Number(process.env.AIRCRAFT_COUNT || 2000);
 const satellites=Number(process.env.SATELLITE_COUNT || 12000);
 const entityCount=aircraft+satellites;
 for (const engine of (process.env.ENGINE ? [process.env.ENGINE] : ['maplibre','mapbox'])) {
  const server=process.env.EXTERNAL_SERVER ? null : spawn(process.execPath,[path.join(app,'node_modules/vite/bin/vite.js'),'--host','0.0.0.0','--port','3900'],{cwd:app,env:{...process.env,VITE_ENABLE_MAPBOX:engine==='mapbox'?'true':'false',VITE_MAPBOX_TOKEN:'pk.profile',VITE_API_URL:''},stdio:'inherit'});
  try {
   for(let i=0;i<120;i++){try{await fetch('http://localhost:3900');break;}catch{} await new Promise(r=>setTimeout(r,500));}
   const page=await browser.newPage({viewport:{width:Number(process.env.VIEWPORT_WIDTH || 1280),height:Number(process.env.VIEWPORT_HEIGHT || 720)},deviceScaleFactor:0.5,hasTouch:process.env.MOBILE_SMOKE === '1'});
   const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+':'+r.failure()?.errorText));
   await page.addInitScript(()=>{sessionStorage.setItem('sw_token','synthetic-profile'); window.__profile={frames:[],longTasks:[],decoded:0,statuses:[]};const OriginalWorker=window.Worker;window.Worker=class extends OriginalWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='entity_batch')window.__profile.decoded+=e.data.data.length;if(e.data.type==='status')window.__profile.statuses.push(e.data);});}}; if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(l=>window.__profile.longTasks.push(...l.getEntries().map(e=>e.duration))).observe({entryTypes:['longtask']});let prev;function tick(t){if(prev)window.__profile.frames.push(t-prev);prev=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
   if(process.env.SAFE_INSETS)await page.addInitScript(values=>{
    addEventListener('DOMContentLoaded',()=>['top','right','bottom','left'].forEach((edge,i)=>document.documentElement.style.setProperty('--safe-'+edge, values[i]+'px')));
   },process.env.SAFE_INSETS.split(',').map(Number));
   await page.route('**/health',route=>route.fulfill({json:{status:'ok'}}));
   await page.route('**/api/**',async route=>{
    const url=route.request().url();if(!new URL(url).pathname.startsWith("/api/"))return route.fallback();let data=[];
    if(url.includes('/auth/me'))data={id:1,username:'profile',role:'viewer',is_active:true};
    else if(url.includes('setup-status'))data={setup_required:false};
    else if(process.env.POPULATED_SMOKE === '1' && url.includes('/config/location'))data={lat:45.5152,lon:-122.6784,radius_nm:100,updated_at:null};
    else if(process.env.POPULATED_SMOKE === '1' && url.includes('/rf/sites'))data={count:1,results:[{id:'smoke-rf',callsign:'SMOKE',name:'Smoke RF Site',service:'amateur',modes:[],emcomm_flags:[],lat:45.5,lon:-122.6}]};
    else if(process.env.POPULATED_SMOKE === '1' && url.includes('/news/feed'))data=[{title:'Smoke News Item',link:'https://example.com/news',pub_date:new Date().toISOString(),source:'Smoke Source'}];
    else if(process.env.POPULATED_SMOKE === '1' && url.includes('/gdelt/actors'))data=[{actor:'China',actor_type:'country',threat_level:'CRITICAL',event_count:12,avg_goldstein:-7,material_conflict:3}];
    else if(process.env.POPULATED_SMOKE === '1' && url.includes('/gdelt/events'))data={type:'FeatureCollection',features:[{type:'Feature',id:'smoke',geometry:{type:'Point',coordinates:[-122,45]},properties:{event_id:'smoke',name:'Smoke Intel Event',actor1_country:'USA',actor2_country:'CHN',quad_class:4,goldstein:-7,tone:-7,num_mentions:20,url:'https://example.com/intel',domain:'example.com'}}]};
    else if(process.env.POPULATED_SMOKE === '1' && url.includes('/orbital/passes'))data=[{norad_id:'1',name:'Smoke Satellite',aos:new Date(Date.now()+300000).toISOString(),los:new Date(Date.now()+600000).toISOString(),max_elevation:45,duration_seconds:300}];
    else if(process.env.POPULATED_SMOKE === '1' && url.includes('nws-alerts'))data={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-123,45],[-122,45],[-122,46],[-123,46],[-123,45]]]},properties:{event:'Smoke Weather Alert',headline:'Smoke Weather Alert',severity:'Severe',expires:new Date(Date.now()+3600000).toISOString()}}]};
    else if(/events|aurora|cables|outages|buoys|nws-alerts|facilities|ixps|jamming/.test(url))data={type:'FeatureCollection',features:[]};
    else if(url.includes('watchlist'))data=[];
    await route.fulfill({json:data});
   });
   if(process.env.MOBILE_SMOKE === '1' && process.env.POPULATED_SMOKE !== '1')await page.route('**/world-countries*.json',route=>route.fulfill({json:{type:'FeatureCollection',features:[]}}));
   const blank={version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#101820'}}]};
   await page.route('https://**/*',async route=>{if(/styles\/v1|style\.json/.test(route.request().url()))await route.fulfill({json:blank});else await route.abort();});
   let sent=0;
   await page.routeWebSocket('**/api/tracks/live**', ws=>{
    ws.onMessage(msg=>{if(msg==='ping')ws.send('pong');});
    setTimeout(()=>{
     for(let base=0;base<entityCount;base+=128){const parts=[Buffer.from([191,2,191])];for(let i=base;i<Math.min(base+128,entityCount);i++){
      const orbital=i>=aircraft;
      const cotEvent={uid:(orbital?'SAT-':'AIR-')+i,type:orbital?'a-s-K':'a-f-A',how:'m-g',time:Date.now(),start:Date.now(),stale:Date.now()+60000,lat:orbital?((i%160)-80):45+(i%100)/200,lon:orbital?((i%360)-180):-123+(i%80)/200,hae:orbital?420000:3000,detail:{contact:{callsign:'PROFILE-'+i},track:{course:i%360,speed:orbital?7600:150},periodMin:92,inclinationDeg:51.6,category:'leo'}};
      const bytes=Buffer.concat([Buffer.from([191,1,191]),Buffer.from(Type.encode(Type.fromObject({cotEvent})).finish())]);const len=Buffer.alloc(4);len.writeUInt32LE(bytes.length);parts.push(len,bytes);sent++;
     }ws.send(Buffer.concat(parts));}
    },3000);
   });
   const start=Date.now();await page.goto('http://localhost:3900');await page.waitForSelector('canvas',{timeout:30000}).catch(async e=>{console.error(JSON.stringify({errors}));await page.screenshot({path:path.join(output,'failure.png'),timeout:5000}).catch(()=>{});throw e;});const canvasMs=Date.now()-start;
   await page.waitForTimeout(process.env.MOBILE_SMOKE === '1' ? 10000 : 25000);
   const stats=await page.evaluate(()=>{const x=window.__profile;const f=x.frames.slice(-300).sort((a,b)=>a-b);return {frameP50Ms:f[Math.floor(f.length*.5)],frameP95Ms:f[Math.floor(f.length*.95)],longTasks:x.longTasks.length,longTaskMaxMs:Math.max(0,...x.longTasks),heapMiB:performance.memory?.usedJSHeapSize/1048576,decoded:x.decoded,workerStatus:x.statuses,canvases:document.querySelectorAll('canvas').length,body:document.body.innerText.slice(-1500)};});
   console.log(JSON.stringify({engine,canvasMs,entitiesSent:sent,decoded:stats.decoded,workerStatus:stats.workerStatus,body:stats.body,errors}));
   let orbitalStats=null;
   if(process.env.PROFILE_ORBITAL === '1'){
   await page.locator('[aria-label="Orbital View"]').evaluate(el=>el.click());
   await page.evaluate(()=>{window.__profile.frames=[];window.__profile.longTasks=[];});
   await page.waitForTimeout(8000);
   orbitalStats=await page.evaluate(()=>{const x=window.__profile;const f=x.frames.slice(-300).sort((a,b)=>a-b);return {frameP50Ms:f[Math.floor(f.length*.5)],frameP95Ms:f[Math.floor(f.length*.95)],longTasks:x.longTasks.length,longTaskMaxMs:Math.max(0,...x.longTasks),heapMiB:performance.memory?.usedJSHeapSize/1048576,body:document.body.innerText.slice(-1500)};});
   }
   if(process.env.SAFE_INSETS)await page.evaluate(values=>{['top','right','bottom','left'].forEach((edge,i)=>document.documentElement.style.setProperty('--safe-'+edge, values[i]+'px'));},process.env.SAFE_INSETS.split(',').map(Number));
   const layouts=[];
   if(process.env.MOBILE_SMOKE === '1' && process.env.ONLY_ROTATE !== '1') {
    for(const label of ['Tactical','Orbital','Intel','Dashboard','Radio']) {
     await page.locator('nav[aria-label="Views"]').getByRole('button',{name:label,exact:true}).click();
     await page.waitForTimeout(3500);
     if(label === 'Tactical') {
      await page.getByRole('button',{name:'Mission & feeds',exact:true}).click();
      if(!await page.locator('#hud-left-panel').isVisible())throw new Error('Drawer did not open');
      const scroll = await page.locator('#hud-left-panel .hud-panel-content').evaluate(el => { el.scrollTop = el.scrollHeight; return {top:el.scrollTop, height:el.clientHeight, total:el.scrollHeight}; });
      if(scroll.total > scroll.height && scroll.top === 0)throw new Error('Panel cannot scroll to its final controls');
      await page.getByRole('button',{name:'Close layers panel',exact:true}).click();
      if(await page.locator('#hud-left-panel').isVisible())throw new Error('Drawer did not close');
      await page.getByRole('button',{name:'Tools',exact:true}).click();
      const toolRows = await page.locator('#mobile-map-tools').evaluate(el => [...el.querySelectorAll('button')].map(b => {const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}));
      if(toolRows.some((r,i) => r.height < 44 || (i && r.top < toolRows[i-1].bottom)))throw new Error('Mobile tool rows overlap or are too small');
      await page.getByTitle('Core System Settings',{exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'System Settings',exact:true});
      if(!await dialog.isVisible())throw new Error('Settings popover clipped');
      const bounds=await dialog.boundingBox();const safeBounds=await page.locator('.hud-viewport').boundingBox();
      if(bounds.x<safeBounds.x || bounds.y<safeBounds.y || bounds.x+bounds.width>safeBounds.x+safeBounds.width+1 || bounds.y+bounds.height>safeBounds.y+safeBounds.height+1)throw new Error('Settings exceeds safe viewport');
      await dialog.getByRole('button',{name:'Close Settings',exact:true}).click();
      await page.getByRole('button',{name:'Tools',exact:true}).click();
      await page.getByRole('button',{name:'Toggle System Health',exact:true}).click();
      const healthDialog = page.getByRole('dialog',{name:'System Health Checker',exact:true});
      const healthBounds = await healthDialog.boundingBox();
      if(!healthBounds || healthBounds.x < safeBounds.x || healthBounds.x+healthBounds.width > safeBounds.x+safeBounds.width+1)throw new Error('Health menu exceeds mobile width');
      await page.getByRole('button',{name:'Close menu',exact:true}).click();
      if(await healthDialog.isVisible())throw new Error('Menu backdrop did not dismiss health');
     }
     if(label === 'Dashboard' && process.env.POPULATED_SMOKE === '1') {
      await page.getByRole('tablist',{name:'Dashboard sections',exact:true}).getByRole('tab',{name:'Feeds',exact:true}).click({noWaitAfter:true});
      await page.getByText('Smoke Satellite',{exact:true}).waitFor();
      await page.getByRole('tablist',{name:'Dashboard feeds',exact:true}).getByRole('tab',{name:'News',exact:true}).click({noWaitAfter:true});
      await page.getByText('Smoke News Item',{exact:true}).waitFor();
     }
     layouts.push(await page.evaluate(label=>{
      const safe=document.querySelector('.hud-viewport').getBoundingClientRect();
      const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
      const maps=[...document.querySelectorAll('.maplibregl-map,.mapboxgl-map')].map(el=>rect(el.getBoundingClientRect()));
      const dashboard=document.querySelector('.dashboard-view');
      return {view:label,viewport:innerWidth,bodyWidth:document.body.scrollWidth,selected:document.querySelector('nav [aria-current="page"]')?.textContent,safe:rect(safe),maps,dashboardHeight:dashboard?.clientHeight,dashboardScrollHeight:dashboard?.scrollHeight,weather:document.querySelector('[title="NWS Alerts in mission area"]')?.textContent.trim(),body:document.body.innerText.slice(-2500)};
     },label));
     const layout=layouts.at(-1);
     if(layout.bodyWidth!==layout.viewport)throw new Error('Page width overflow');
     if(process.env.SAFE_INSETS) {
      const [top,right,bottom,left]=process.env.SAFE_INSETS.split(',').map(Number);
      if(Math.abs(layout.safe.x-left)>1 || Math.abs(layout.safe.y-top)>1 || Math.abs(layout.safe.width-(layout.viewport-left-right))>1 || Math.abs(layout.safe.height-(Number(process.env.VIEWPORT_HEIGHT)-top-bottom))>1)throw new Error('Safe insets were not applied: '+JSON.stringify(layout.safe));
     }
     for(const map of layout.maps)if(map.x<layout.safe.x-1 || map.x+map.width>layout.safe.x+layout.safe.width+1 || (label!=='Dashboard' && (map.y<layout.safe.y-1 || map.y+map.height>layout.safe.y+layout.safe.height+1)))throw new Error('Map exceeds safe viewport: '+label);
     if(label === 'Dashboard' && process.env.POPULATED_SMOKE === '1') {
      if(!/NWS\s*1/.test(layout.weather || ''))throw new Error('Dashboard weather alerts missing');
      const bottom=page.locator('.dashboard-bottom');await bottom.scrollIntoViewIfNeeded();
     }
     await page.screenshot({path:path.join(output,label.toLowerCase()+'-'+process.env.VIEWPORT_WIDTH+'.png')});
    }
   }
   if(process.env.TEST_ROTATE === '1') {
    if(process.env.ONLY_ROTATE !== '1')await page.locator('nav[aria-label="Views"]').getByRole('button',{name:'Tactical',exact:true}).click();
    await page.setViewportSize({width:844,height:390});
    await page.evaluate(()=>['top','right','bottom','left'].forEach((edge,i)=>document.documentElement.style.setProperty('--safe-'+edge,[0,59,21,59][i]+'px')));
    await page.waitForFunction(()=>{const canvas=document.querySelector('.maplibregl-canvas,.mapboxgl-canvas')?.getBoundingClientRect();return canvas && Math.abs(canvas.width-726)<1 && Math.abs(canvas.height-369)<1;},null,{timeout:10000});
    const rotation=await page.evaluate(()=>{
     const safe=document.querySelector('.hud-viewport').getBoundingClientRect();
     const map=document.querySelector('.maplibregl-map,.mapboxgl-map').getBoundingClientRect();
     const canvas=document.querySelector('.maplibregl-canvas,.mapboxgl-canvas').getBoundingClientRect();
     return {safe:{x:safe.x,y:safe.y,width:safe.width,height:safe.height},map:{x:map.x,y:map.y,width:map.width,height:map.height},canvas:{width:canvas.width,height:canvas.height}};
    });
    if(Math.abs(rotation.map.width-726)>1 || Math.abs(rotation.map.height-369)>1 || Math.abs(rotation.canvas.width-726)>1 || Math.abs(rotation.canvas.height-369)>1)throw new Error('Canvas did not resize after rotation: '+JSON.stringify(rotation));
    layouts.push({view:'Tactical rotated',...rotation});
    await page.screenshot({path:path.join(output,'tactical-rotated.png')});
   }
   results.push({engine,canvasMs,entitiesSent:sent,tactical:stats,orbitalGlobe:orbitalStats,layouts,errors});await page.close();
  }finally{if(server && server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}}
 }
 await browser.close();writeFileSync(path.join(output,'browser-profile-'+(process.env.ENGINE || 'both')+'.json'),JSON.stringify({environment:browserName+' headless; Vite dev; mocked APIs/tiles; not hardware FPS',aircraft,satellites,results},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
