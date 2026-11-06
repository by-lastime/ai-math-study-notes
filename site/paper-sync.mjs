import fs from 'node:fs';
import path from 'node:path';

// Reuse canonical proofs and source questions; supplementary QA stays in dialogs/archives.
export const paperMirrors = {
  '03':['P01','P07','P09','P11','P49'],
  '09':['H3-2-11','P30']
};
export const paperArrangement=JSON.parse(fs.readFileSync(new URL('../纸电编排.json',import.meta.url),'utf8'));
const {proofMap,extensionMap}=paperArrangement;
const diagramMap = {'03':'bayes','05':'normal','09':'triangle'};
const stagePractice = {
  '03':{stage:'一',workbooks:['27'],topics:[],transfers:'ABC',quiz:'S1',ai:[]},
  '08':{stage:'二',workbooks:['28','29'],topics:['T01','T02','T09'],transfers:'DHIK',quiz:'S2',ai:['26-A','26-B']},
  '33':{stage:'三',workbooks:[],topics:['T03','T04','T05'],transfers:'EFGJL',quiz:'S3',ai:['26-C']}
};
function sections(md) {
  return [...md.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map(m=>({title:m[1].trim(),body:m[2].replace(/\n<a id="[^"]+"><\/a>\s*$/,'').trim()}));
}
function namedSection(md, title) {
  const section=sections(md).find(s=>s.title===title);
  if(!section)throw Error('纸电同步缺少小节：'+title);
  return section;
}
function namespace(result, prefix) {
  const idMap = new Map([...result.html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],prefix+'-'+m[1]]));
  return {...result,
    html:result.html.replace(/\bid="([^"]+)"/g,(_,id)=>`id="${idMap.get(id)}"`),
    toc:result.toc.map(t=>({...t,anchor:idMap.get(t.anchor)}))};
}
export function syncPaperLesson({base,doc,result,render}) {
  const read=id=>fs.readFileSync(path.join(base,'讲次',id+'.md'),'utf8');
  const chunks=[];
  for(const number of proofMap[doc.id]||[]) {
    const section=sections(read('35')).find(s=>s.title.startsWith(number+'｜'));
    if(!section)throw Error('纸电同步缺少证明：'+number);
    chunks.push({key:'proof-'+String(number).padStart(2,'0'),md:'## 证明细讲｜'+section.title.split('｜').slice(1).join('｜')+'\n\n'+section.body+'\n\n[查看完整证明专题](#doc=35&section=proof-'+String(number).padStart(2,'0')+')'});
  }
  for(const [i,title] of (extensionMap[doc.id]||[]).entries()) {
    const section=namedSection(read('26'),title);
    chunks.push({key:'application-'+(i+1),md:'## '+(title==='课堂概率示意图怎样读'?'图示理解｜':title.startsWith('新版讲义补充')?'拓展阅读｜':'课程应用｜')+title+'\n\n'+section.body+'\n\n[查看AI应用与拓展专题](#doc=26)'});
  }
  const practice=stagePractice[doc.id];
  if(practice) {
    const link=(label,id,anchor='')=>`[${label}](#doc=${id}${anchor?'&section='+anchor:''})`;
    const lines=[`与纸质版第${practice.stage}阶段对应。先完成本讲知识、证明和例题，再按下面的入口做题，做完后展开网页解析核对。`];
    if(practice.workbooks.length)lines.push('教材作业：'+practice.workbooks.map(id=>link({'27':'作业A','28':'作业B','29':'作业C'}[id],id)).join('、')+'。');
    if(practice.ai.length)lines.push('AI应用自练：'+practice.ai.map(id=>link(id,'26','q-'+id)).join('、')+'。');
    if(practice.topics.length)lines.push('难题专题：'+practice.topics.map(id=>link(id,'32','q-'+id)).join('、')+'。');
    lines.push('难题变式：'+[...practice.transfers].map(letter=>link('36-'+letter,'36','q-36-'+letter)).join('、')+'。');
    lines.push('阶段检测：'+link(practice.quiz,'30','q-'+practice.quiz)+'。'+(doc.id==='33'?' 最后做'+link('期中100分诊断卷','34')+'。':''));
    chunks.push({key:'stage-practice',md:'## 本阶段纸质版对应练习\n\n'+lines.join('\n\n')});
  }
  if(!chunks.length&&!diagramMap[doc.id]&&!paperArrangement.sourceOrder[doc.id])return result;
  let html=result.html,toc=[...result.toc],search=result.search;
  const bankMarker='<h2 id="source-bank">';
  let sourceHtml='',sourceToc=[],homeworkHtml='',homeworkToc=[];
  if(paperArrangement.sourceOrder[doc.id]&&html.includes(bankMarker)){
    const index=html.indexOf(bankMarker);sourceHtml=html.slice(index);html=html.slice(0,index);
    const start=toc.findIndex(t=>t.anchor==='source-bank');sourceToc=toc.splice(start);
    const homeworkIndex=sourceToc.findIndex(t=>paperArrangement.homeworkIds.includes(t.anchor.replace(/^q-/,'')));
    if(homeworkIndex>=0){
      homeworkToc=sourceToc.splice(homeworkIndex);
      const first=homeworkToc[0],marker=`<h${first.level} id="${first.anchor}">`;
      const split=sourceHtml.indexOf(marker);
      homeworkHtml=sourceHtml.slice(split);sourceHtml=sourceHtml.slice(0,split);
    }
  }
  const diagram=diagramMap[doc.id];
  if(diagram) {
    const section=namedSection(fs.readFileSync(path.join(base,'补充内容','纸电图示.md'),'utf8'),diagram);
    const body=render(section.body,'paper-diagram-'+doc.id);
    const target=`<div class="interactive" data-widget="${diagram}"></div>`;
    if(!html.includes(target))throw Error('纸电同步缺少图示位置：'+doc.id);
    html=html.replace(target,`<section class="paper-diagram" id="paper-diagram-${diagram}">${body.html}</section>\n`+target);
    search+='\n'+body.search;
  }
  if(chunks.length||sourceHtml) {
    const rendered=chunks.map(chunk=>namespace(render(chunk.md,'paper-'+doc.id+'-'+chunk.key),'paper-'+chunk.key));
    const practiceIndex=chunks.findIndex(c=>c.key==='stage-practice');
    const content=rendered.filter((r,i)=>i!==practiceIndex).map(r=>r.html).join('\n');
    // An explicitly authored pre-exercise note stays next to the exercises,
    // after the mirrored proofs and source questions.
    const anchor=toc.find(t=>t.title==='练习前的符号说明')||toc.find(t=>t.title==='独立练习'||t.title.startsWith('九、收尾自检'));
    if(!anchor)throw Error('纸电同步缺少练习分界：'+doc.id);
    const marker=`<h${anchor.level} id="${anchor.anchor}">`;
    if(!html.includes(marker))throw Error('纸电同步缺少正文锚点：'+doc.id);
    html=html.replace(marker,content+'\n'+sourceHtml+'\n'+marker);
    toc.splice(toc.indexOf(anchor),0,...rendered.filter((r,i)=>i!==practiceIndex).flatMap(r=>r.toc),...sourceToc);
    if(practiceIndex>=0){html+='\n'+rendered[practiceIndex].html;toc.push(...rendered[practiceIndex].toc);}
    if(homeworkHtml){
      html+='\n<h2 id="paper-homework-bank">本讲相关作业原题与解答（对应纸质版阶段作业）</h2>\n'+homeworkHtml;
      toc.push({anchor:'paper-homework-bank',title:'本讲相关作业原题与解答（对应纸质版阶段作业）',level:2},...homeworkToc);
    }
    search+='\n'+rendered.map(r=>r.search).join('\n');
  }
  return {html,toc,search,paperSync:{blocks:chunks.map(c=>c.key),diagram:diagram||null}};
}
