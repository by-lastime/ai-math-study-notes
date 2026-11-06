import fs from 'node:fs';
import crypto from 'node:crypto';
const config=JSON.parse(fs.readFileSync(new URL('../学习要求标注.json',import.meta.url),'utf8'));
const rules=JSON.parse(fs.readFileSync(new URL('../学习要求逐块规则.json',import.meta.url),'utf8'));
// Source metadata retained; publication builds do not read omitted course PDFs.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=s=>s.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g,'').replace(/<[^>]*>/g,'').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&').trim();
const rootLabel=id=>rules.defaults[id]||'了解';
const stripLabel=t=>t.replace(/（(?:了解|掌握|掌握计算|掌握定义|理解|知晓|不做要求)）$/,'');
function byTitle(doc,title){
 const exact=rules.sections[doc+'|'+title];if(exact)return exact;
 for(const [key,label] of Object.entries(rules.sections))if(key.startsWith(doc+'|prefix:')&&title.startsWith(key.split('|prefix:')[1]))return label;
 return null;
}
function questionKey(t){return /^(H\d+-\d+-\d+|[PU]\d{2,}|[ABCT]\d{2}|S\d|M\d{2}|\d\d-[A-Z])(?:[｜：:\s]|$)/.exec(t)?.[1];}
function questionLevel(key,doc){
 if(rules.inline[key])return rules.inline[key];
 if(rules.questions[key])return rules.questions[key];
 if(key?.startsWith('H3-'))return /均值|期望/.test(key)?'掌握计算':'掌握';
 if(key?.startsWith('H8-'))return '掌握';
 return rootLabel(doc);
}
export function applyRequirements(doc){
 const qaId=doc.requirementQaId,lesson=qaId?qaId.slice(0,2):doc.id.startsWith('qa-')?doc.id.slice(3):doc.id;
 const base=qaId?(rules.qa[qaId]||rootLabel(lesson)):rootLabel(lesson);
 const explicit=config.entries.filter(e=>e.doc===doc.id);
 const toc=(doc.toc||[]).map(t=>({...t})),records=[];let active=base,section=base,activeQa=qaId||null,activeQuiz=false;
 function labelHtml(label,basis){return `<span class="learning-requirement" title="${esc(basis)}">（${label.split('；').map(s=>`<span class="requirement-clause${s.length>16?' long':''}">${esc(s)}</span>`).join('；<wbr>')}）</span>`;}
 function finish(content,label,basis,key,kind){records.push({key,kind,label,basis});return content.endsWith('（'+label+'）')?content:content+labelHtml(label,basis);}
 const pattern=/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>|<p>(\s*<strong>)([\s\S]*?)(<\/strong>)|<div class="table-scroll">|<figcaption>([\s\S]*?)<\/figcaption>|<div class="interactive" data-widget="([^"]+)"><\/div>|<li>([\s\S]*?)<\/li>/g;
 let html=doc.html.replace(pattern,(all,level,attrs,body,strongOpen,strongText,strongClose,caption,widget,listBody,offset,fullText)=>{
  if(level){
   const title=plain(body),id=/\bid="([^"]+)"/.exec(attrs)?.[1];
   if(Number(level)<=2){activeQa=qaId||null;activeQuiz=/^S\d｜/.test(title);}
   const qaMatch=/^Q\d{3}[：:]/.exec(title);
   if(qaMatch)activeQa=lesson+'/'+qaMatch[0].slice(0,-1);
   const mirrorQa=/^paper-qa-(\d{2})-(Q\d{3})-/.exec(id||'');if(mirrorQa)activeQa=mirrorQa[1]+'/'+mirrorQa[2];
   const inherited=Number(level)>2?section:base;
   const original=explicit.find(e=>e.anchor?e.anchor===id:e.title===title);
   const key=questionKey(title);
   let label=original?.label,basis=original?'原讲义 PDF '+original.pages.join('、')+' 页：'+original.basis:'按本块对应知识点与解题要求';
   if(!label&&key)label=questionLevel(key,lesson);
   if(!label&&lesson==='36'&&/^[A-L]｜/.test(title))label=rules.questions['36-'+title[0]];
   const proof=/^paper-proof-(\d+)-/.exec(id||'')||((lesson==='35')?/^(\d+)｜/.exec(title):null);
   if(!label&&proof)label=rules.sections['35|number:'+Number(proof[1])];
   const application=title.replace(/^(?:课程应用|拓展阅读|图示理解)｜/,'');
   if(!label)label=byTitle(lesson,title)||byTitle('26',application);
   if(activeQa)label=byTitle(activeQa,title)||rules.qa[activeQa]||inherited;
   if(!label&&/（了解）$/.test(title))label='了解';
   if(!label)label=inherited;
   if(Number(level)<=2)section=label;
   active=label;
   const result=finish(body,label,basis,id||'heading-'+records.length,'heading');
   const t=toc.find(t=>t.anchor===id);if(t&&!t.title.endsWith('（'+label+'）'))t.title+='（'+label+'）';
   return `<h${level}${attrs} data-learning-label="${esc(label)}">${result}</h${level}>`;
  }
  if(strongOpen){
   const text=plain(strongText),key=questionKey(text);
   if(key)active=questionLevel(key,lesson);
   if(!key&&/^(题目|题干|教学例题题干|教学变式题干)/.test(text)){
    const tail=fullText.slice(offset+all.length);
    const until=tail.search(/<p>\s*<strong>解答|<h[1-6]\b/);
    const stem=plain(tail.slice(0,until<0?Math.min(tail.length,2500):until));
    if(/伽马|Gamma|Γ/.test(stem))active=/正态/.test(stem)?'正态：掌握；伽马：了解':'了解';
    else if(/分位数|中位数/.test(stem))active=/均值|期望/.test(stem)?'均值：掌握计算；分位数：了解':'了解';
    else if(/求[^。]*(?:期望|均值|方差|E\(|EX|EY)/.test(stem)&&!/分布函数|概率密度/.test(stem))active='掌握计算';
   }
   // These are complete teaching/exercise/answer blocks, not every emphasized phrase.
   if(key||/^(题目|题干|例题|例[：:]|教学例|教学变式|解答|证明|读题|计算结果|起笔|完整解析|方法|第\s*\d+\s*步|怎样想到|能否独立起笔|理解检查|检查[：:]|闭卷迁移)/.test(text))return '<p>'+strongOpen+finish(strongText,active,'按所在题目与方法块的学习要求',key||'block-'+records.length,'block')+strongClose;
   return all;
  }
  if(all.startsWith('<div class="table-scroll"'))return `<div class="table-scroll" data-learning-label="${esc(active)}"><p class="table-learning-level">${finish('',active,'按本表所处内容的学习要求','table-'+records.length,'table')}</p>`;
  if(caption!==undefined)return '<figcaption>'+finish(caption,active,'按本图所处内容的学习要求','figure-'+records.length,'figure')+'</figcaption>';
  if(widget)return `<div class="interactive" data-widget="${widget}" data-learning-label="${esc(active)}"></div>`;
  if(listBody!==undefined&&activeQuiz)return '<li>'+finish(listBody,active,'按该阶段训练涉及的知识点','quiz-'+records.length,'quiz')+'</li>';
  return all;
 });
 if(qaId){html='<p class="qa-learning-level">'+labelHtml(base,'按本条补充问答对应知识点')+'</p>'+html;records.unshift({key:qaId,kind:'qa',label:base});}
 return {...doc,html,toc,learningRequirements:records,requirementLabel:base};
}
