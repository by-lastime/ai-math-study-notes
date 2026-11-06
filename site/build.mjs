import {buildReviewCollection} from './review-collection.mjs';
import {applyRequirements} from './requirements.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Marked} from './vendor/marked/lib/marked.esm.js';
import katex from './vendor/katex-package/dist/katex.mjs';
import {paperMirrors,syncPaperLesson,paperArrangement} from './paper-sync.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const base=path.dirname(root);
let errors=[],mathCount=0;
const sources=JSON.parse(fs.readFileSync(path.join(root,'sources.json'),'utf8'));
const bank=JSON.parse(fs.readFileSync(path.join(base,'原题库/题目.json'),'utf8'));
const midtermAudit=JSON.parse(fs.readFileSync(path.join(base,'期中核对/逐项清单.json'),'utf8'));
// Source hashes are retained as provenance; original PDFs are not distributed.

const supplements=[];
const qaRoot=path.join(base,'补充问答');
for(const filename of fs.readdirSync(qaRoot).filter(n=>/^\d{2}.*\.md$/.test(n)).sort()){
 const lesson=filename.slice(0,2),md=fs.readFileSync(path.join(qaRoot,filename),'utf8');
 const sections=[...md.matchAll(/^## (Q\d{3,})[：:]\s*(.+)$/gm)];
 sections.forEach((m,i)=>{const id=lesson+'/'+m[1];if(supplements.some(q=>q.id===id))throw Error('补充问答编号重复：'+id);supplements.push({id,lesson,number:m[1],title:m[2],markdown:md.slice(m.index+m[0].length,sections[i+1]?.index??md.length).trim()});});
}
const knownQa=new Set(supplements.map(q=>q.id));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(md,id){
 let num=0,toc=[];
 const math=(s,d)=>{mathCount++;try{return katex.renderToString(s,{displayMode:d,throwOnError:true,strict:'ignore',trust:false,output:'htmlAndMathml'});}catch(e){errors.push({id,tex:s,error:e.message});return esc(s);}};
 const marked=new Marked({gfm:true,breaks:false});
 marked.use({extensions:[
 {name:'mathBlock',level:'block',start:s=>s.indexOf('$$'),tokenizer(s){const m=/^\$\$\s*([\s\S]+?)\s*\$\$(?:\n|$)/.exec(s);if(m)return{type:'mathBlock',raw:m[0],text:m[1]};},renderer(t){return `<div class="math-block">${math(t.text,true)}</div>`;}},
 {name:'mathInline',level:'inline',start:s=>s.indexOf('$'),tokenizer(s){const m=/^\$(?!\$)((?:\\.|[^\n$])+?)\$(?!\$)/.exec(s);if(m)return{type:'mathInline',raw:m[0],text:m[1]};},renderer(t){return math(t.text,false);}}
 ]});
 let html=marked.parse(md);
 html=html.replace(/<a href="qa:(\d{2}\/Q\d{3,})">([\s\S]*?)<\/a>/g,(_,key,label)=>{if(!knownQa.has(key))throw Error('补充问答链接不存在：'+key);return `<a href="#doc=qa-${key.slice(0,2)}&amp;section=${key.split('/')[1]}" data-qa="${key}" aria-haspopup="dialog" aria-controls="qa-dialog">${label}</a>`;});
 html=html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g,(all,l,t)=>{const plain=t.replace(/<[^>]*>/g,'');const q=/^(H\d+-\d+-\d+|[PU]\d{2,})[｜：]/.exec(plain);const qa=/^(Q\d{3,})[：:]/.exec(plain);const anchor=plain==='本讲原题与解答'?'source-bank':q?'q-'+q[1]:qa?qa[1]:'s-'+(++num);toc.push({anchor,title:t.replace(/<[^>]*>/g,''),level:Number(l)});return `<h${l} id="${anchor}">${t}</h${l}>`;});
 html=html.replace(/<table>/g,'<div class="table-scroll"><table>').replace(/<\/table>/g,'</table></div>');
 const search=md.replace(/<details>[\s\S]*?<\/details>/g,'').replace(/<[^>]*>/g,'').replace(/[#*$>]/g,'');
 return {html,toc,search};
}
function sourceChips(row){return row.sources.map(ref=>{const src=sources.find(s=>s.id===ref.id);if(!src)throw Error('未知来源 '+ref.id);return ref.pages.map(p=>`<button data-source="${ref.id}" data-page="${p}">${esc(src.title)} · PDF ${p}</button>`).join(' ');}).join(' ');}
function facsimile(row){return '';}

const scopeLabels={midterm:'期中进度内',after:'期中后',extension:'拓展阅读'};
function rowMarkdown(row){
 if(!row.question||!row.answer||!row.sources.length)throw Error('原题不完整 '+row.id);
 return `## ${row.id}｜${row.title}\n\n<p class="question-scope ${row.examScope||''}">${scopeLabels[row.examScope]||'按所在章节复习'}</p>\n\n<div class="source-chips">${sourceChips(row)}</div>\n\n${row.question}\n\n${(row.figures||[]).map(src=>`<figure class="question-figure"><img src="${src}" loading="lazy" alt="${esc(row.title)}的原题图"><figcaption>原讲义题图 · 可点击下方原页核对</figcaption></figure>`).join("\n")}\n\n<details>\n<summary>展开解答与易错点</summary>\n\n${row.answer}\n\n${(row.answerFigures||[]).map(src=>`<figure class="question-figure"><img src="${src}" loading="lazy" alt="原讲义中的完整生成树画法"></figure>`).join("\n")}\n\n</details>\n\n${facsimile(row)}`;
}
const descriptors=JSON.parse(fs.readFileSync(path.join(base,'课程目录.json'),'utf8'));
const expected=JSON.parse(fs.readFileSync(path.join(base,'原题库/总讲义编号索引.json'),'utf8'));
for(const [id,ref] of Object.entries(expected)){const row=bank.find(q=>q.id===id);if(!row||!row.sources.some(s=>s.id==='handout'&&s.pages.includes(ref.page)))throw Error('缺失原讲义题目或出处：'+id);}
const newer=JSON.parse(fs.readFileSync(path.join(base,'原题库/新版讲义编号索引.json'),'utf8'));
for(const [id,ref] of Object.entries(newer)){const row=bank.find(q=>q.id===ref.questionId);if(!row?.sources.some(s=>s.id==='handout3'&&s.pages.includes(ref.page)))throw Error('新版讲义例题缺失：'+id);}
const pptHomework=JSON.parse(fs.readFileSync(path.join(base,'原题库/十四讲作业对应.json'),'utf8'));
for(const ref of pptHomework){const row=bank.find(q=>q.id===ref.id);if(!row?.sources.some(s=>s.id==='p14'&&ref.pages.every(p=>s.pages.includes(p))))throw Error('十四讲作业缺失：'+ref.pptQuestion);}
const ids=new Set();for(const row of bank){if(ids.has(row.id))throw Error('原题重复 '+row.id);ids.add(row.id);if(!descriptors.some(d=>d.id===row.lesson))throw Error('原题讲次不存在 '+row.id);}
for(const item of midtermAudit.knowledge){for(const target of item.targets)if(!descriptors.some(d=>d.id===target.doc))throw Error('知识点讲次失效：'+item.id);for(const id of item.questions)if(!ids.has(id))throw Error('知识点原题失效：'+item.id+' '+id);}
for(const [number,ref] of Object.entries(midtermAudit.handoutExamples)){const row=bank.find(q=>q.id===ref.questionId);if(!row?.sources.some(s=>s.id==='handout3'&&s.pages.includes(ref.page)))throw Error('独立复核编号失效：'+number);}
const docs=descriptors.map(d=>{
 let rows=[...bank.filter(q=>q.lesson===d.id),...(paperMirrors[d.id]||[]).map(id=>{const row=bank.find(q=>q.id===id);if(!row)throw Error('纸电同步缺少原题：'+id);return row;})];
 const paperIds=paperArrangement.sourceOrder[d.id];
 if(paperIds){
  const ordered=paperIds.map(id=>{const row=bank.find(q=>q.id===id);if(!row)throw Error('纸电编排原题不存在 '+id);return row;});
  rows=[...ordered,...rows.filter(q=>!paperIds.includes(q.id))];
 }
 let md=fs.readFileSync(path.join(base,d.file),'utf8');
 if(rows.length){const appendix=`# 本讲原题与解答\n\n共 ${rows.length} 条来源题目。H 为总讲义编号例题，P 为 PPT 题目、课堂示例或题设变体，U 为补充例题与证明（含教材例题）。重复出现的同题合并解答并列出所有来源；图示例子也保留。\n\n`+rows.map(row=>(row.lesson!==d.id?`> 与纸质版同位复习，本题也可在[原专题中阅读](#doc=${row.lesson}&section=q-${row.id})；题面与解答共用同一来源题。\n\n`:'')+rowMarkdown(row)).join('\n');fs.writeFileSync(path.join(base,'原题库',d.id+'.md'),appendix);md+='\n\n'+appendix.replace(/^# /,'## ');}
 return {...d,questionCount:rows.length,...syncPaperLesson({base,doc:d,result:render(md,d.id),render,supplements})};
});
for(const [id,file,title] of [['midterm-audit','期中逐项核对.md','期中逐项核对'],['midterm','期中范围与路线.md','期中范围与高分路线'],['guide','学习指南.md','学习指南与路线'],['audit','资料核对与覆盖索引.md','资料核对与勘误']])docs.push({id,title,short:title,stage:'学习工具',kind:'guide',pages:[],ppt:[],...render(fs.readFileSync(path.join(base,file),'utf8'),id)});
for(const q of supplements)Object.assign(q,render(q.markdown,'qa-'+q.id));
const lessons=[...new Set(supplements.map(q=>q.lesson))];
for(const lesson of lessons){const qs=supplements.filter(q=>q.lesson===lesson);docs.push({id:'qa-'+lesson,title:lesson+' 讲补充问答',short:lesson+' 讲补充问答',stage:'补充问答',kind:'supplement',pages:[],ppt:[],...render('# '+lesson+' 讲补充问答\n\n'+qs.map(q=>'## '+q.number+'：'+q.title+'\n\n'+q.markdown).join('\n\n'),'qa-'+lesson)});}
const indexMd='# 原题逐项核对清单\n\n本清单把知识点覆盖与题目收录分开。总讲义 174 条编号例题均有题面与解答；另有 '+bank.filter(q=>q.id.startsWith('P')).length+' 条 PPT 题目、变体与课堂示例（含与教材作业同题的条目），及 '+bank.filter(q=>q.id.startsWith('U')).length+' 条补充例题、证明专题。小问不拆计，图示例子计为条目；来源之间重复的同题只合并解答，保留每次出处。它不是去重后的考试题总数。\n\n'+sources.filter(s=>s.id.startsWith('handout')||/^p/.test(s.id)||s.id==='book').map(src=>{const rows=bank.filter(r=>r.sources.some(s=>s.id===src.id));return '## '+src.title+'\n\n| PDF 页 | 原题条目 | 复习讲次 |\n|---|---|---|\n'+rows.sort((a,b)=>a.sources.find(s=>s.id===src.id).pages[0]-b.sources.find(s=>s.id===src.id).pages[0]).map(r=>'| '+r.sources.find(s=>s.id===src.id).pages.join(', ')+' | ['+r.id+' '+r.title+'](#doc='+r.lesson+'&section=q-'+r.id+') | '+r.lesson+' |').join('\n');}).join('\n\n');
fs.writeFileSync(path.join(base,'原题逐项核对清单.md'),indexMd);
docs.push({id:'question-index',title:'原题逐项核对清单',short:'原题核对清单',stage:'学习工具',kind:'guide',pages:[],ppt:[],...render(indexMd,'question-index')});
const qaMd='# 补充问答档案\n\n从各讲正文中的 Q 编号，或顶部“本讲问答”打开弹窗。关闭后回到原阅读位置。这里保存已编写的解释与后续追问解答；当前预置条目标为“讲解补充”，不是虚构的用户提问。新问题在对话中提出，解答写入对应讲次后，服务模式会自动更新。\n\n'+lessons.map(l=>'## '+l+' 讲\n\n'+supplements.filter(q=>q.lesson===l).map(q=>'- ['+q.number+'：'+q.title+'](qa:'+q.id+')').join('\n')).join('\n\n');
docs.push({id:'questions',title:'补充问答档案',short:'补充问答档案',stage:'学习工具',kind:'guide',pages:[],ppt:[],...render(qaMd,'questions')});
for(let i=0;i<docs.length;i++)docs[i]=applyRequirements(docs[i]);
for(const q of supplements){const originalId=q.id;Object.assign(q,applyRequirements({...q,id:'popup-'+q.id,requirementQaId:originalId}));q.id=originalId;}
buildReviewCollection({docs,bank,render});
const data={publicRelease:true,docs,supplements:supplements.map(({markdown,...q})=>q),bank:bank.map(({question,answer,...q})=>q),sources,coverage:JSON.parse(fs.readFileSync(path.join(root,'coverage.json'),'utf8'))};
data.version=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,20);
const checks={midtermAudit:{knowledgeGroups:midtermAudit.knowledge.length,numberedStatements:midtermAudit.numberedStatements.length,sourcePages:midtermAudit.pages.length,handoutExamples:Object.keys(midtermAudit.handoutExamples).length},newHandoutCoverage:{expected:Object.keys(newer).length,matched:Object.keys(newer).length},lecture14Homework:pptHomework.length,handoutCoverage:{expected:Object.keys(expected).length,matched:Object.keys(expected).filter(id=>ids.has(id)).length},reviewCollection:docs.find(d=>d.id==='40')?.reviewStats,documents:docs.length,sourceQuestions:bank.length,handoutExamples:bank.filter(q=>q.id.startsWith('H')).length,pptExtra:bank.filter(q=>q.id.startsWith('P')).length,additional:bank.filter(q=>q.id.startsWith('U')).length,supplements:supplements.length,mathCount,errors};
fs.writeFileSync(path.join(root,'build-check.json'),JSON.stringify(checks,null,2));
if(errors.length){console.error(JSON.stringify(errors,null,2));process.exit(1);}
const tmp=path.join(root,'content.js.tmp');fs.writeFileSync(tmp,'window.MATH_DATA='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n');fs.renameSync(tmp,path.join(root,'content.js'));
fs.writeFileSync(path.join(root,'build-version.json'),JSON.stringify({version:data.version,generatedAt:new Date().toISOString()}));
console.log(JSON.stringify(checks));
