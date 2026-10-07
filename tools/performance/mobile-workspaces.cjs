/* Verify all five mobile workspaces with isolated data and remote styles. */
const {createRequire} = require('node:module');
const {mkdirSync,writeFileSync} = require('node:fs');
const req = createRequire(process.env.FRONTEND_DIR+'/package.json');
const {chromium,webkit} = req('playwright');
const output=process.env.PROFILE_OUTPUT || '/results';
mkdirSync(output,{recursive:true});
(async()=>{
 const browser=process.env.BROWSER==='webkit' ? await webkit.launch() : await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const results=[];
 try {
  const sizes=process.env.VIEWPORT_WIDTH ? [[Number(process.env.VIEWPORT_WIDTH),Number(process.env.VIEWPORT_HEIGHT)]] : [[390,844],[320,740],[844,390],[1024,768],[1440,900]];
  for(const [width,height] of sizes){
   const page=await browser.newPage({viewport:{width,height},hasTouch:width<1280,deviceScaleFactor:Number(process.env.DEVICE_SCALE_FACTOR || 0.5)});
   const errors=[];page.on('pageerror',e=>{if(!e.message.startsWith('ResizeObserver loop'))errors.push(e.message);});
   await page.addInitScript(()=>{sessionStorage.setItem('sw_token','synthetic-workspace');localStorage.setItem('orbitalSatFilters',JSON.stringify({showSatGPS:true,showSatWeather:false,showSatComms:false,showSatSurveillance:false,showSatOther:false}));});
   if(width===390)await page.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{document.documentElement.style.setProperty('--safe-top','59px');document.documentElement.style.setProperty('--safe-bottom','34px');}));
   await page.route('**/api/**',route=>{
    const url=route.request().url();if(!new URL(url).pathname.startsWith('/api/'))return route.fallback();let data=[];
    if(url.includes('/auth/me'))data={id:1,username:'profile',role:'viewer',is_active:true};
    else if(url.includes('setup-status'))data={setup_required:false};
    else if(url.includes('/config/location'))data={lat:45.5152,lon:-122.6784,radius_nm:100,updated_at:null};
    else if(url.includes('/rf/sites'))data={count:0,results:[]};
    else if(url.includes('/news/feed'))data=[{title:'Workspace News Item',link:'https://example.com/news',pub_date:new Date().toISOString(),source:'Fixture'}];
    else if(url.includes('/gdelt/actors'))data=[{actor:'China',actor_type:'country',threat_level:'CRITICAL',event_count:12,avg_goldstein:-7,material_conflict:3}];
    else if(url.includes('/orbital/passes'))data=[{norad_id:'1',name:'Workspace Satellite',aos:new Date(Date.now()+300000).toISOString(),los:new Date(Date.now()+600000).toISOString(),max_elevation:45,duration_seconds:300,points:[]}];
    else if(url.includes('nws-alerts'))data={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-123,45],[-122,45],[-122,46],[-123,46],[-123,45]]]},properties:{id:'workspace-weather',severity:'Severe',event:'Workspace Storm Warning',areaDesc:'Mission area'}}]};
    else if(/events|aurora|cables|outages|buoys|nws-alerts|facilities|ixps|jamming/.test(url))data={type:'FeatureCollection',features:[]};
    return route.fulfill({json:data});
   });
   await page.routeWebSocket('**/api/**',ws=>ws.onMessage(()=>{}));
   await page.route('**/world-countries*.json',r=>r.fulfill({json:{type:'FeatureCollection',features:[]}}));
   await page.route('https://**/*',r=>/style\.json|styles\/v1/.test(r.request().url()) ? r.fulfill({json:{version:8,sources:{},layers:[]}}) : r.abort());
   await page.goto(process.env.WORKSPACE_URL || 'http://localhost:3900');
   await page.getByRole('button',{name:'Tools',exact:true}).waitFor({state:width<1280?'visible':'hidden'});
   const shot=async name=>{await page.waitForTimeout(350);if(width===390 || width>=1280)await page.screenshot({path:output+'/'+(width>=1280?'desktop-':'')+name+'.png'});};
   const bounded=async selector=>{
    const overflow=await page.locator(selector).evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length).filter(el=>{const r=el.getBoundingClientRect();const safe=document.querySelector('.hud-viewport').getBoundingClientRect();return r.left<safe.left-1 || r.right>safe.right+1;}).map(el=>el.getAttribute('aria-label')||el.textContent.trim().slice(0,60)));
    if(overflow.length)throw new Error(width+'px overflowing controls: '+JSON.stringify(overflow));
   };
   const view=async label=>{
    if(width<1280)await page.locator('nav[aria-label="Views"]').getByRole('button',{name:label,exact:true}).click({noWaitAfter:true});
    else await page.getByRole('tab',{name:label==='Intel'?'Intel Globe View':label+' View',exact:true}).click({noWaitAfter:true});
   };
   if(width<1280){
    for(const [label,launcher,sectionLabel,sections] of [
     ['Tactical','Mission & feeds','Tactical sections',['Mission','Feeds','Layers','HF']],
     ['Orbital','Satellites','Orbital sections',['Satellites','Passes','Doppler']],
     ['Intel','Threats','Intel sections',['Overview','Threats','Countries','SITREP']],
    ]){
     await view(label);await shot(label.toLowerCase()+'-map');
     const overlap=await page.evaluate(()=>{
      const controls=document.querySelector('.map-control-bar');
      if(!controls || !controls.getClientRects().length)return [];
      const r=controls.getBoundingClientRect();
      return ['.mobile-view-nav','.mobile-map-dock','.mobile-context-strip'].filter(selector=>{const el=document.querySelector(selector);if(!el?.getClientRects().length)return false;const b=el.getBoundingClientRect();return r.left<b.right && r.right>b.left && r.top<b.bottom-1 && r.bottom>b.top+1;});
     });
     if(overlap.length)throw new Error(label+' map controls overlap '+overlap.join(', '));
     if(label==='Tactical'){
      await page.getByRole('button',{name:'3D View',exact:true}).click({noWaitAfter:true});
      await bounded('.map-control-bar button');
      const intersects=await page.evaluate(()=>{const r=document.querySelector('.map-control-bar').getBoundingClientRect();const overview=document.querySelector('.mobile-context-strip');if(!overview.getClientRects().length)return false;const b=overview.getBoundingClientRect();return r.top<b.bottom-1 && r.bottom>b.top+1;});
      if(intersects)throw new Error('3D controls overlap tactical overview');
      await shot('tactical-3d-controls');
      await page.getByRole('button',{name:'2D View',exact:true}).click({noWaitAfter:true});
     }
     if(label==='Tactical'){
      const key=page.locator('.mobile-tactical-key');
      await key.locator('summary').click({noWaitAfter:true});
      await page.getByLabel('Aircraft altitude color scale').waitFor();
      await page.getByLabel('Maritime speed color scale').waitFor();
      await bounded('.mobile-key-scales, .mobile-tactical-key summary');
      await shot('tactical-color-key');
      await key.locator('summary').click({noWaitAfter:true});
      const weather=page.getByRole('button',{name:'Toggle NWS Alerts',exact:true});
      await weather.click({noWaitAfter:true});
      await page.getByText('Workspace Storm Warning',{exact:true}).waitFor();
      await bounded('.mobile-nws-alerts');await shot('tactical-nws-map');
      await weather.click({noWaitAfter:true});
      await page.getByRole('button',{name:'Status',exact:true}).click({noWaitAfter:true});
      for(const card of ['Mission status','Connection status','Tracking status','Stream status'])await page.getByLabel(card,{exact:true}).waitFor();
      await shot('tactical-status');
      await page.getByRole('button',{name:'Close status panel',exact:true}).click({noWaitAfter:true});
      await page.getByRole('button',{name:'Tools',exact:true}).click({noWaitAfter:true});
      const toolLayers=page.locator('.mobile-tools-layer-menu');
      const toolHeader=toolLayers.getByRole('button',{name:'Toggle Map Layers',exact:true});
      if(await toolHeader.getAttribute('aria-expanded')==='true')await toolHeader.click({noWaitAfter:true});
      await toolLayers.getByRole('button',{name:'Expand Map Layers',exact:true}).click({noWaitAfter:true});
      if(await toolHeader.getAttribute('aria-expanded')!=='true')throw new Error('Map Layers chevron did not expand');
      await toolLayers.getByRole('button',{name:'Collapse Map Layers',exact:true}).click({noWaitAfter:true});
      await toolLayers.getByRole('button',{name:'Expand Map Layers',exact:true}).click({noWaitAfter:true});
      await toolLayers.getByRole('button',{name:'Toggle Environmental Panels',exact:true}).click({noWaitAfter:true});
      await shot('tools-before-track-filters');
      await toolLayers.getByRole('button',{name:/Aircraft.*types selected/}).click({noWaitAfter:true});
      await toolLayers.getByRole('checkbox',{name:'Helicopters',exact:true}).click({noWaitAfter:true});
      await bounded('.mobile-tools-layer-menu button, .mobile-tools-layer-menu label');
      await shot('tools-expanded-map-layers');
      await page.getByRole('tab',{name:'Display',exact:true}).click({noWaitAfter:true});
      await bounded('.mobile-tools-actions button');
      await shot('tools-mobile-display');
      await page.getByRole('tab',{name:'System',exact:true}).click({noWaitAfter:true});
      await bounded('.mobile-tools-system');
      await shot('tools-mobile-system');
      await page.getByRole('button',{name:'Close tools',exact:true}).click({noWaitAfter:true});
     }
     await page.getByRole('button',{name:launcher,exact:true}).click({noWaitAfter:true});
     if(await page.locator('.map-control-bar:visible').count())throw new Error('Map controls remain over an open drawer');
     for(const section of sections){
      await page.getByRole('tablist',{name:sectionLabel,exact:true}).getByRole('tab',{name:section,exact:true}).click({noWaitAfter:true});
      if(label==='Tactical' && (section==='Feeds' || section==='Layers')){
       if(section==='Feeds')await page.getByRole('button',{name:'Toggle filter options',exact:true}).click({noWaitAfter:true});
       const trackFilters=page.locator('#hud-left-panel .mobile-section[data-active="true"] .mobile-track-filters');
       for(const group of ['Aircraft','Maritime','Orbital']){
        await trackFilters.getByRole('button',{name:new RegExp(group+'.*types selected')}).click({noWaitAfter:true});
        await bounded('.mobile-section[data-active="true"] .mobile-filter-options label');
        const shortLabels=await trackFilters.locator('label').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().height<44).length);
        if(shortLabels)throw new Error('Filter touch targets below 44px');
        await shot('tactical-'+section.toLowerCase()+'-'+group.toLowerCase());
       }
       if(section==='Feeds'){
        const feedLayers=page.locator('.feed-map-layers');
        const feedHeader=feedLayers.getByRole('button',{name:'Toggle Map Layers',exact:true});
        if(await feedHeader.getAttribute('aria-expanded')!=='true')await feedHeader.click({noWaitAfter:true});
        await feedLayers.getByRole('button',{name:'Toggle Global Network Panels',exact:true}).click({noWaitAfter:true});
        await bounded('.feed-map-layers button, .feed-map-layers label');await shot('tactical-feeds-map-layers');
       }
       if(section==='Layers'){
        await page.locator('.mobile-section[data-active="true"]').getByRole('button',{name:'Toggle Map Layers',exact:true}).click({noWaitAfter:true});
        for(const group of ['RF Infrastructure','Global Network','Environmental','Analysis','Hazards']){
         await page.locator('.mobile-section[data-active="true"]').getByRole('button',{name:'Toggle '+group+' Panels',exact:true}).click({noWaitAfter:true});
        }
        await bounded('.layer-visibility-controls button, .layer-visibility-controls label');
        await shot('tactical-expanded-layers');
       }
      }
      await bounded('#hud-left-panel button, #hud-left-panel input, #hud-left-panel select');
      await shot(label.toLowerCase()+'-'+section.toLowerCase());
      if(label==='Orbital' && section==='Passes'){
       for(let attempt=0;attempt<2;attempt++){
        await page.getByRole('button',{name:'View details for pass Workspace Satellite',exact:true}).click({noWaitAfter:true});
        const details=page.getByRole('dialog',{name:'Details',exact:true});
        await details.waitFor();
        await page.waitForTimeout(350);
        const rect=await details.boundingBox();
        const viewport=await page.locator('.hud-viewport').boundingBox();
        if(Math.abs(rect.width-(viewport.width-16))>2)throw new Error('Details is not full width');
        const nav=await page.locator('nav[aria-label="Views"]').boundingBox();
        if(rect.y+rect.height>nav.y)throw new Error('Details overlaps bottom navigation: '+JSON.stringify({rect,nav,viewport}));
        await bounded('#hud-right-panel button, #hud-right-panel input');
        await shot('orbital-details-full-width');
        await page.getByRole('button',{name:'Close details panel',exact:true}).click({noWaitAfter:true});
        await page.getByRole('button',{name:'Satellites',exact:true}).click({noWaitAfter:true});
       }
      }
     }
     if(await page.getByRole('button',{name:'Map',exact:true}).isVisible())await page.getByRole('button',{name:'Map',exact:true}).click({noWaitAfter:true});
     else await page.getByRole('button',{name:'Close layers panel',exact:true}).click({noWaitAfter:true});
     if(await page.locator('#hud-left-panel').isVisible())throw new Error('Map did not dismiss '+label+' panel');
    }
   }
   if(width>=1280)for(const [label,sectionLabel] of [['Tactical','Tactical sections'],['Orbital','Orbital sections'],['Intel','Intel sections']]){
    await view(label);
    if(!await page.locator('#hud-left-panel').isVisible())throw new Error('Desktop sidebar disappeared: '+label);
    if(await page.getByRole('tablist',{name:sectionLabel,exact:true}).isVisible())throw new Error('Mobile section tabs leak onto desktop: '+label);
    await shot(label.toLowerCase());
   }
   await view('Dashboard');
   if(width<1280){
    for(const section of ['Summary','Maps','Intel','Feeds']){
     await page.getByRole('tablist',{name:'Dashboard sections',exact:true}).getByRole('tab',{name:section,exact:true}).click({noWaitAfter:true});
     if(section==='Maps')for(const map of ['Mission map','Global globe']){
      await page.getByRole('tablist',{name:'Dashboard maps',exact:true}).getByRole('tab',{name:map,exact:true}).click({noWaitAfter:true});
      await page.waitForTimeout(500);
      const canvases=await page.locator('.dashboard-maps canvas:visible').count();
      if(canvases<1)throw new Error('Dashboard map did not mount');
      await shot('dashboard-'+map.replace(' ','-'));
     }
     if(section==='Feeds'){
      await page.getByRole('tablist',{name:'Dashboard feeds',exact:true}).getByRole('tab',{name:'Passes',exact:true}).click({noWaitAfter:true});
      await page.getByText('Workspace Satellite',{exact:true}).waitFor();
      for(const feed of ['Outages','News'])await page.getByRole('tablist',{name:'Dashboard feeds',exact:true}).getByRole('tab',{name:feed,exact:true}).click({noWaitAfter:true});
      await page.getByText('Workspace News Item',{exact:true}).waitFor();
     }
     await bounded('.dashboard-view button');
     if(section==='Summary'){
      const bluePanels=await page.locator('.dashboard-summary > div').evaluateAll(nodes=>nodes.filter(el=>{const colors=getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number);return colors && colors[2]>colors[1];}).length);
      if(bluePanels)throw new Error('Dashboard summary still has blue panel backgrounds');
      const overview=await page.locator('.mobile-dashboard-overview .mobile-overview-card').boundingBox();
      if(width===390 && overview.height>180)throw new Error('Dashboard overview is no longer compact: '+overview.height);
      if(width===390)console.log(JSON.stringify({dashboardOverviewHeight:overview.height}));
     }
     await shot('dashboard-'+section.toLowerCase());
    }
   }
   await view('Radio');
   if(width<1280){
    for(const section of ['Messages','Heard','Listen','Receivers']){
     await page.getByRole('tablist',{name:'Radio sections',exact:true}).getByRole('tab',{name:section,exact:true}).click({noWaitAfter:true});
     if(section==='Heard'){
      if(!await page.locator('.radio-stations').isVisible())throw new Error('Heard stations inaccessible');
      await page.getByRole('button',{name:/GhostNet/}).click({noWaitAfter:true});
     }
     if(section==='Listen')for(const listening of ['Waterfall','Tuning','Audio & gain']){
      await page.getByRole('tablist',{name:'Listening sections',exact:true}).getByRole('tab',{name:listening,exact:true}).click({noWaitAfter:true});
      await bounded('.listening-post button, .listening-post input');await shot('radio-'+listening.replaceAll(' ','-'));
     }
     await bounded('.radio-terminal > header button, .radio-send-form input, .radio-send-form button');await shot('radio-'+section.toLowerCase());
    }
    await page.getByRole('tablist',{name:'Radio sections',exact:true}).getByRole('tab',{name:'Messages',exact:true}).click({noWaitAfter:true});
    await page.getByRole('button',{name:'Setup',exact:true}).click({noWaitAfter:true});
    await bounded('.radio-terminal > header button');await shot('radio-setup');
   }else{
    if(await page.getByRole('tablist',{name:'Radio sections'}).isVisible())throw new Error('Mobile radio tabs leak onto desktop');
    await page.locator('.radio-stations').waitFor({state:'visible'});
   }
   const bodyWidth=await page.evaluate(()=>document.body.scrollWidth);
   if(bodyWidth>width)throw new Error('Body exceeds viewport');
   if(errors.length)throw new Error('Runtime errors: '+JSON.stringify(errors));
   results.push({width,height,views:5,result:'passed'});console.log(JSON.stringify(results.at(-1)));
   await page.close();
  }
 } finally {await browser.close();writeFileSync(output+'/workspaces.json',JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
