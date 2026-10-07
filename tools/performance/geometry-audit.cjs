const fs=require('fs'),Module=require('module'),{performance}=require('perf_hooks');
const path=require('node:path');
const frontend=process.env.FRONTEND_DIR || path.resolve(__dirname,'../../frontend');
const dependencyRoot=process.env.DEPENDENCY_ROOT || frontend;
const ts=require(require.resolve('typescript',{paths:[dependencyRoot]}));
class Layer{constructor(props){this.props=props;}}
global.document={createElement:()=>({getContext:()=>new Proxy({}, {get:()=>()=>{}}),toDataURL:()=>''})};
const centroids=JSON.parse(fs.readFileSync(path.join(frontend,'public/country_centroids.json')));
global.fetch=async()=>({json:async()=>centroids});
function load(file,extra=''){
 const source=ts.transpileModule(fs.readFileSync(path.join(frontend,'src',file),'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod=new Module(file);mod.require=(name)=>name.startsWith('@deck.gl/')?new Proxy({},{get:()=>Layer}):name.startsWith('.')?load(path.posix.join(path.posix.dirname(file),name)+'.ts'):require(name);mod._compile(source,file);return mod.exports;
}
function bench(fn,n=15){for(let i=0;i<3;i++)fn();const times=[];for(let i=0;i<n;i++){let t=performance.now();fn();times.push(performance.now()-t)}times.sort((a,b)=>a-b);return{medianMs:+times[Math.floor(n/2)].toFixed(3),p95Ms:+times[Math.floor(n*.95)].toFixed(3)}}
(async()=>{
 const orbital=load('layers/satelliteMesh.ts');
 const arcs=load('layers/buildGdeltArcLayer.ts');await new Promise(r=>setImmediate(r));
 const results={environment:'Node22 CPU geometry construction; mocked deck constructors; excludes GPU, attribute uploads and browser React'};
 for(const count of [1000,12728]){const sats=Array.from({length:count},(_,i)=>({uid:'SAT-'+i,lat:(i%160)-80,lon:(i%360)-180,altitude:420000}));results['gemFaces_'+count]={sharedVertices:24,instances:count,...bench(()=>sats.map(sat=>orbital.satelliteMeshScale(sat,undefined,2)))};}
 for(const count of [100,1000]){const data={type:'FeatureCollection',features:Array.from({length:count},(_,i)=>({geometry:{type:'Point',coordinates:[(i%360)-180,(i%140)-70]},properties:{event_id:String(i),quad_class:4,actor1_country:'USA',actor2_country:'CHN',goldstein:-7,num_mentions:20}}))};let layers=arcs.buildGdeltArcLayer(data,true,true,.5);results['globeArcs_'+count]={pathSegments:layers[0]?.props.data?.length,...bench(()=>arcs.buildGdeltArcLayer(data,true,true,.5))};}
 console.log(JSON.stringify(results,null,2));
})();
