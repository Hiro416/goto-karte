/* Run with Node.js 22+; no dependencies. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const folder = path.join(__dirname, '..');
const context = vm.createContext({console, URL});
vm.runInContext(fs.readFileSync(path.join(folder, 'core.js'), 'utf8'), context);
const N = context.CBTNotebook;
const clone = x => JSON.parse(JSON.stringify(x));
const sample = {source:'tecopla-cbt', key:'tecopla-cbt:123', questionId:'123', questionNumber:'TEST-123',
  url:'https://m3e-medical.com/users/cbt/practice_questions/456#123', question:'テスト問題',
  choices:[{label:'A',text:'甲',value:'1'},{label:'B',text:'乙',value:'2'}], result:'incorrect',
  answerId:'789', selected:['A'], selectedSource:'submission',correct:['B'],explanation:'テスト解説\n第二行',categories:['テスト'],related:[],images:[]};
let passed = 0;
function test(name, f) { f(); console.log('PASS', name); passed++; }
test('incorrect is saved',()=>assert.equal(N.mergeRecord(null,sample).questionNumber,'TEST-123'));
test('correct is not auto-saved',()=>assert.equal(N.mergeRecord(null,{...sample,result:'correct'}),null));
test('unanswered snapshot is rejected',()=>assert.throws(()=>N.mergeRecord(null,{...sample,result:null})));
test('pause stops new and existing captures',()=>{const r=N.mergeRecord(null,sample);assert.equal(N.mergeRecord(null,sample,{settings:{enabled:false}}),null);assert.equal(N.mergeRecord(r,sample,{settings:{enabled:false}}),null)});
test('manual capture works when paused',()=>assert.ok(N.mergeRecord(null,{...sample,result:'correct'},{manual:true,settings:{enabled:false}})));
test('uncertain requires option',()=>{assert.equal(N.mergeRecord(null,{...sample,result:'mistake'}),null);assert.ok(N.mergeRecord(null,{...sample,result:'mistake'},{settings:{includeUncertain:true}}))});
test('reload deduplicates answer id',()=>{const r=N.mergeRecord(null,sample);assert.equal(N.mergeRecord(r,sample).attempts.length,1)});
test('submission reload and later revisit deduplicate',()=>{let r=N.mergeRecord(null,{...sample,attemptToken:'test-token'});r=N.mergeRecord(r,{...sample,attemptToken:'test-token'});r=N.mergeRecord(r,sample);assert.equal(r.attempts.length,1)});
test('separate submissions create distinct observed attempts',()=>{let r=N.mergeRecord(null,{...sample,attemptToken:'first'});r=N.mergeRecord(r,{...sample,attemptToken:'second'});assert.equal(r.attempts.length,2)});
test('correct review preserves note and history',()=>{let r=N.mergeRecord(null,sample);r.note='覚える';r.reviewed=true;r=N.mergeRecord(r,{...sample,result:'correct',attemptToken:'again',selected:['B']});assert.equal(r.note,'覚える');assert.equal(r.reviewed,true);assert.equal(r.result,'correct');assert.equal(r.attempts.length,2)});
test('unknown selected answer is never inferred from correct answer',()=>assert.equal(N.mergeRecord(null,{...sample,selected:[]}).selected.length,0));
test('existing selected answer survives temporarily incomplete DOM',()=>{let r=N.mergeRecord(null,sample);assert.equal(N.mergeRecord(r,{...sample,selected:[]}).selected[0],'A')});
test('markdown includes expected data and line breaks',()=>{const md=N.markdown([N.mergeRecord(null,sample)]);assert.ok(md.includes('自分の回答：A'));assert.ok(md.includes('正答：B'));assert.ok(md.includes('テスト解説\n第二行'))});
test('backup round trip preserves note and state',()=>{const r=N.mergeRecord(null,sample);r.note='復習';r.reviewed=true;const restored=N.restoreRecord(clone(r));assert.equal(restored.note,'復習');assert.equal(restored.reviewed,true);assert.deepEqual(clone(restored.attempts),clone(r.attempts))});
test('invalid URLs and mismatched keys rejected',()=>{assert.throws(()=>N.validateSnapshot({...sample,url:'javascript:alert(1)'}));assert.throws(()=>N.validateSnapshot({...sample,key:'bad'}))});
test('unrelated input fields are not copied',()=>{const r=N.mergeRecord(null,{...sample,authenticity_token:'do-not-store',cookie:'do-not-store'});assert.ok(!JSON.stringify(r).includes('do-not-store'))});
test('only safe image links are retained',()=>{const r=N.mergeRecord(null,{...sample,images:[{kind:'question',url:'javascript:alert(1)'},{kind:'question',url:'https://example.com/image.png'}]});assert.equal(r.images.length,1)});

(async()=>{
  const storage={}; let listener;
  const chrome={storage:{local:{setAccessLevel:async()=>{},get:async keys=>keys===null?clone(storage):{[keys]:storage[keys]},
    set:async values=>{Object.assign(storage,clone(values))},remove:async key=>{delete storage[key]},getBytesInUse:async()=>JSON.stringify(storage).length}},
    runtime:{getURL:s=>'chrome-extension://test/'+s,onMessage:{addListener:f=>{listener=f}}},action:{onClicked:{addListener:()=>{}}},tabs:{create:()=>{}}};
  const ctx=vm.createContext({chrome,console,CBTNotebook:N,importScripts:()=>{}});
  vm.runInContext(fs.readFileSync(path.join(folder,'background.js'),'utf8'),ctx);
  const call=(m,url='https://m3e-medical.com/users/cbt/practice_questions/456')=>new Promise(resolve=>listener(m,{url},resolve));
  const results=await Promise.all(Array.from({length:8},(_,i)=>call({type:'capture',snapshot:{...sample,questionId:String(100+i),key:`tecopla-cbt:${100+i}`}})));
  assert.ok(results.every(r=>r.ok&&r.saved)); assert.equal(Object.keys(storage).length,8); console.log('PASS concurrent captures are serialized');passed++;
  const before=JSON.stringify(storage);
  const invalid=await call({type:'restore',backup:{format:'cbt-notebook',version:1,records:[N.mergeRecord(null,sample),{}]}},'chrome-extension://test/notebook.html');
  assert.equal(invalid.ok,false);assert.equal(JSON.stringify(storage),before);console.log('PASS invalid restore batch makes no changes');passed++;
  const rejected=await call({type:'list'},'https://example.com/');assert.equal(rejected.ok,false);console.log('PASS foreign sender rejected');passed++;
  const list=await call({type:'list'},'chrome-extension://test/notebook.html');assert.equal(list.records.length,8);console.log('PASS notebook lists saved records');passed++;
  const backup={format:'cbt-notebook',version:1,records:[N.mergeRecord(null,sample)]};
  const imported=await call({type:'restore',backup},'chrome-extension://test/notebook.html');const skipped=await call({type:'restore',backup},'chrome-extension://test/notebook.html');assert.equal(imported.imported,1);assert.equal(skipped.skipped,1);console.log('PASS JSON restore adds missing records and skips duplicates');passed++;
  const qb={...sample,source:'qb-cbt',key:'qb-cbt:123',url:'https://cbt.medilink-study.com/quiz?question_id=00000000-0000-4000-8000-000000000001'};
  const qbsaved=await call({type:'capture',snapshot:qb},qb.url);assert.equal(qbsaved.saved,true);assert.ok(storage['record:qb-cbt:123']);assert.ok(storage['record:tecopla-cbt:123']);console.log('PASS QB sender saves alongside existing Tecopla ID');passed++;
  const old=await call({type:'restore',backup},'chrome-extension://test/notebook.html');assert.equal(old.skipped,1);assert.equal(storage['record:tecopla-cbt:123'].selected[0],'A');console.log('PASS v0.1 Tecopla backup remains compatible');passed++;
  console.log(`${passed} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
