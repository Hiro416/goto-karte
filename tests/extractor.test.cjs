/* All text, identifiers and answer histories here are fictional test data. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {Element}=require('./dom-adapter.cjs');
const ctx=vm.createContext({URL});
for(const file of ['core.js','extractor.js','qb-extractor.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
const e=(tag,attrs={},...children)=>({tag,attrs,children:children.flat()});
const options=['A','B','C'].map(label=>({label,text:`架空の選択肢 ${label}`}));
function tecopla(status='incorrect') {
 const result=status?e('div',{class:'d-issue__answer'},e('span',{id:'answer-result',class:status}),e('dl',{},e('dt',{},'正解'),e('dd',{},'C'))):null;
 return new Element(e('document',{},e('main',{id:'is_practice_question'},e('form',{class:status?'edit_answer':'new_answer',id:status?'edit_answer_900002':'new_answer',action:'https://m3e-medical.com/users/cbt/practice_questions/900003#900001'},
  e('div',{class:'d-issue__content__num'},'問題番号 : TEST-001'),
  e('div',{id:'question-body'},e('p',{id:'marker_body_900001'},'架空のテスト設問です。')),
  e('ul',{id:'practice_question_choice'},options.map((o,i)=>e('li',{},e('input',{value:String(i),...(o.label==='B'?{checked:''}:{})}),e('button',{},`${o.label}. ${o.text}`)))),
  ...(result?[result]:[]),e('div',{id:'question-explanation'},e('p',{},'架空の解説です。',e('br'),'次の行。'))))));
}
function qb(status='incorrect',selected='B',history='B') {
 const color=status==='correct'?'text-qb-sky':'text-qb-pink';
 const verdict=status==='correct'?'正解':'不正解';
 const panel=status?e('div',{},e('div',{},e('span',{},'結果：'),e('svg',{class:color})),e('div',{},e('span',{},'正解：'),e('span',{class:'font-semibold'},'c')),
  e('button',{},e('svg',{class:'text-qb-pink'})),
  e('table',{},e('thead',{},e('tr',{},e('th',{},'解答履歴'),e('th',{},'選択した解答'))),e('tbody',{},e('tr',{},e('td',{},'2000/01/01'),e('td',{},history.toLowerCase()),e('td',{},verdict))))):null;
 return new Element(e('document',{},e('main',{},
  e('div',{class:'rounded-lg'},e('span',{class:'font-semibold text-qb-blue'},'2099 9-001'),e('div',{class:'html_renderer small_img'},'架空のQB形式テスト設問です。'),
   options.map(o=>e('button',{class:o.label===selected?'border-qb-green':''},e('div',{class:'rounded-full'},e('span',{},o.label.toLowerCase())),e('div',{class:'html_renderer'},o.text)))),
  ...(panel?[panel]:[]),e('div',{},e('div',{'data-testid':'explanation-box-title'},'解説'),e('div',{class:'html_renderer'},'架空の解説。',e('br'),'第二行。'),e('div',{},e('div',{'data-testid':'explanation-sub-title'},'コア・カリキュラム'),e('span',{},'テスト分野'))),
  e('div',{},'[掲載頁：架空のテスト] ID : 900001'))));
}
const tecoURL='https://m3e-medical.com/users/cbt/practice_questions/900003#900001';
const qbURL='https://cbt.medilink-study.com/quiz?question_id=00000000-0000-4000-8000-000000000001';
let count=0;
function test(name,f){f();count++;console.log('PASS',name)}
test('Tecopla incorrect question extracts selected B and correct C',()=>{const s=ctx.TecoplaExtractor.read(tecopla(),tecoURL);assert.equal(s.result,'incorrect');assert.equal(s.selected.join(),'B');assert.equal(s.correct.join(),'C');assert.equal(s.choices.length,3)});
test('Tecopla unanswered page remains unanswered with hidden explanation available',()=>{const s=ctx.TecoplaExtractor.read(tecopla(null),tecoURL);assert.equal(s.result,null);assert.ok(s.explanation.includes('次の行'))});
test('Tecopla correct result is excluded from auto-save',()=>{const s=ctx.TecoplaExtractor.read(tecopla('correct'),tecoURL);assert.equal(ctx.CBTNotebook.mergeRecord(null,s),null)});
test('Tecopla line breaks are retained',()=>assert.ok(ctx.TecoplaExtractor.read(tecopla(),tecoURL).explanation.includes('\n')));
test('QB incorrect extracts B and explicit correct C',()=>{const s=ctx.QBExtractor.read(qb(),qbURL);assert.equal(s.result,'incorrect');assert.equal(s.selected.join(),'B');assert.equal(s.correct.join(),'C');assert.equal(s.choices.length,3)});
test('QB correct result is excluded from auto-save',()=>assert.equal(ctx.CBTNotebook.mergeRecord(null,ctx.QBExtractor.read(qb('correct','C','C'),qbURL)),null));
test('QB identity uses the printed ID and URL is marked as a session link',()=>{const s=ctx.QBExtractor.read(qb(),qbURL);assert.equal(s.key,'qb-cbt:900001');assert.equal(s.urlKind,'session')});
test('QB self-evaluation icon does not change primary correct verdict',()=>assert.equal(ctx.QBExtractor.read(qb('correct','C','C'),qbURL).result,'correct'));
test('QB without result remains unanswered',()=>assert.equal(ctx.QBExtractor.read(qb(null),qbURL).result,null));
test('QB hidden result remains unanswered',()=>{const d=qb();d.querySelectorAll('span').find(n=>n.textContent==='結果：').parentElement.attrs.style='display:none';assert.equal(ctx.QBExtractor.read(d,qbURL).result,null)});
test('QB waits while selection differs from latest history',()=>assert.equal(ctx.QBExtractor.read(qb('incorrect','A','B'),qbURL).result,null));
test('QB history supplies selection when no button is highlighted',()=>{const s=ctx.QBExtractor.read(qb('incorrect','','B'),qbURL);assert.equal(s.selected.join(),'B');assert.equal(s.selectedSource,'answer-history')});
test('QB explanation and curriculum exclude unrelated controls',()=>{const s=ctx.QBExtractor.read(qb(),qbURL);assert.ok(s.explanation.includes('第二行'));assert.equal(s.categories.join(),'テスト分野')});
test('same fictional printed ID can coexist across services',()=>{const t=ctx.TecoplaExtractor.read(tecopla(),tecoURL),q=ctx.QBExtractor.read(qb(),qbURL);assert.notEqual(ctx.CBTNotebook.validateSnapshot(t).key,ctx.CBTNotebook.validateSnapshot(q).key)});
console.log(`${count} synthetic extraction checks passed`);
