// Assemble the review collection from the current, annotated lessons.
// Existing questions and detailed solutions remain owned by their original files.
export function buildReviewCollection({docs,bank,render}) {
 const target=docs.find(d=>d.id==='40');
 if(!target)return;
 const byDoc=new Map(docs.map(d=>[d.id,d]));
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const plain=s=>s.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g,'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
 const groups=[
  ['01','事件与概率规则','先把文字写成事件，再判断是否需要容斥或取补。'],
  ['02','计数、抽样与停止规则','先明确结果是否有序、是否放回，以及什么时候停止。'],
  ['03','条件概率、独立性与 Bayes','区分已知条件与所求事件；检查来源是否互斥且穷尽。'],
  ['04','离散分布与模型识别','先定义随机变量，再核对取值范围和分布参数。'],
  ['05','连续密度与常见分布','先写支持与参数含义，再把概率改写成积分。'],
  ['06','分布函数与一维变换','先找值域与点质量；分段、多原像都要保留。'],
  ['07','期望、指标变量与尾和','先判断能否拆和、直接用原分布，或按尾概率求和。'],
  ['08','方差、矩与预测误差','区分二阶矩与均值平方；线性变换后重新核对尺度。'],
  ['09','联合分布、边缘与支持','先画或列出支持，再确定对谁求和、对谁积分。'],
  ['10','条件分布与随机变量独立','固定条件、找切片、归一化；独立性要用等式检验。'],
  ['11','和、差、比值与二维换元','先选 CDF、卷积或换元，再由原支持确定新范围。'],
  ['12','协方差、条件期望与递推','计算交叉项；遇到分组或重复试验时明确条件和状态。'],
  ['mixed','综合训练与练习题 10.29','自己选择方法，完整写出支持、条件、计算和结果检查。']
 ].map(([id,title,intro])=>({id,title,intro,items:[]}));
 const entries=[],seen=new Set();
 function section(docId,predicate){
  const doc=byDoc.get(docId);if(!doc)throw Error('题集缺少讲次 '+docId);
  const headings=[...doc.html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/g)];
  const i=headings.findIndex(m=>predicate(plain(m[0]),m[0]));
  if(i<0)throw Error('题集找不到内容块 '+docId);
  const h=headings[i],body=doc.html.slice(h.index+h[0].length,headings[i+1]?.index??doc.html.length);
  return {heading:h[0],body:body.replace(/<a id="proof-\d+"><\/a>\s*$/,''),anchor:/\bid="([^"]+)"/.exec(h[0])?.[1],label:/data-learning-label="([^"]+)"/.exec(h[0])?.[1]};
 }
 function separate(html){
  const start=html.search(/<details\b/);
  if(start<0)throw Error('题集题目没有折叠解答');
  return {stem:html.slice(0,start),answer:html.slice(start)
   .replace(/<details class="original-pages">[\s\S]*$/,'')
   .replace(/<details\b[^>]*>/g,'<div class="review-answer-part">')
   .replace(/<\/details>/g,'</div>').replace(/<summary>/g,'<h4>').replace(/<\/summary>/g,'</h4>')};
 }
 function add({id,docId,group,title,label,stem,answer,anchor,kind,rank=1}){
  if(seen.has(id))throw Error('题集重复编号 '+id);seen.add(id);
  if(!stem.trim()||!answer.trim()||!label)throw Error('题集题面、答案或要求缺失 '+id);
  const item={id,docId,group,title,label,stem,answer,anchor,kind,rank,optional:!/(?:掌握|理解)/.test(label)};
  const g=groups.find(g=>g.id===group);if(!g)throw Error('题集未知专题 '+group);
  g.items.push(item);entries.push(item);
 }
 // The fourteen-lecture homework spans earlier topics; file location is not its topic.
 const overrides={
  P01:'03',P07:'03',P09:'03',P11:'03',P49:'03',P30:'09','H3-2-11':'09',
  P35:'02',P36:'01',P37:'01',P38:'03',P39:'03',P40:'03',P41:'03',P44:'03',P45:'03',
  P54:'04',P55:'04',P56:'06',P57:'05',P58:'06',P59:'08',P60:'11',P61:'09',P62:'05',
  P63:'07',P64:'06',P65:'06',P66:'06',P67:'07',P68:'05',P69:'08',P70:'08'
 };
 const order=new Map();let n=0;
 for(const id of ['01','02','03','04','05','06','07','08','09','10','11','12','33','27','26','14','39'])
  for(const t of byDoc.get(id)?.toc||[])if(t.anchor.startsWith('q-')&&!order.has(t.anchor.slice(2)))order.set(t.anchor.slice(2),n++);
 const rows=bank.filter(q=>q.examScope==='midterm').sort((a,b)=>(order.get(a.id)??999)-(order.get(b.id)??999));
 for(const row of rows){
  const preferred=(row.id==='H3-2-11'||row.id==='P30')?'09':row.lesson;
  const s=section(preferred,(_,h)=>h.includes(`id="q-${row.id}"`));
  const {stem,answer}=separate(s.body);
  add({id:row.id,docId:preferred,group:overrides[row.id]||({'33':'12','39':'mixed'}[row.lesson]||row.lesson),title:row.title,label:s.label,stem,answer,anchor:s.anchor,kind:'来源题'});
 }
 // Standalone practice: use the complete original stem and all existing explanation.
 for(const docId of ['01','02','03','04','05','06','07','08','09','10','11','12','26','33']){
  const doc=byDoc.get(docId);
  const matches=[...doc.html.matchAll(new RegExp('<p><strong>('+docId+'-[A-Z])(?:<|：|:)[\\s\\S]*?<\\/strong>','g'))];
  for(const m of matches){
   const rest=doc.html.slice(m.index);
   const boundary=rest.slice(m[0].length).search(/<p><strong>\d{2}-[A-Z](?:<|：|:)|<h[23]\b/);
   let body=rest.slice(0,boundary<0?rest.length:m[0].length+boundary);
   const close=body.lastIndexOf('</details>');if(close<0)throw Error('独立练习缺少解答 '+m[1]);
   body=body.slice(0,close+'</details>'.length);
   const rec=doc.learningRequirements.find(r=>r.key===m[1]);
   const parts=separate(body.replace(/^<p><strong>[\s\S]*?<\/strong>[：:]?/,'<p>'));
   add({id:m[1],docId,group:docId==='26'?(m[1]==='26-C'?'10':'08'):docId==='33'?'12':docId,title:'独立练习',label:rec?.label,...parts,anchor:'q-'+m[1],kind:'独立练习',rank:0});
  }
 }
 const transfers={A:'02',B:'03',C:'03',D:'06',E:'09',F:'11',G:'12',H:'07',I:'12',J:'12',K:'08',L:'10'};
 for(const [letter,group] of Object.entries(transfers)){
  const s=section('36',t=>t.startsWith(letter+'｜'));
  const title=plain(s.heading).split('｜').slice(1).join('｜').replace(/（[^（）]*）$/,'');
  add({id:'36-'+letter,docId:'36',group,title,label:s.label,...separate(s.body.replace(/<p><strong>36-[A-L][\s\S]*?<\/strong>[：:]?/,'<p>')),anchor:s.anchor,kind:'难题变式',rank:4});
 }
 for(const [docId,key,group,kind,rank] of [
  ...[['T01','12'],['T02','12'],['T03','10'],['T04','10'],['T05','11'],['T09','06']].map(([k,g])=>['32',k,g,'方法专题',3]),
  ['27','A43','03','教材对照变式',3],['29','C18','07','教材证明题',2],
  ...Array.from({length:8},(_,i)=>['34','M'+String(i+1).padStart(2,'0'),'mixed','综合训练',5])
 ]){
  const s=section(docId,t=>t.startsWith(key+'｜'));
  add({id:key,docId,group,title:plain(s.heading).split('｜').slice(1).join('｜').replace(/（[^（）]*）$/,''),label:s.label,...separate(s.body),anchor:s.anchor,kind,rank});
 }
 // Turn explanatory proofs into independently readable prompts without changing their solutions.
 const proofStems=[
  ['01',String.raw`设 $(A_n)$ 为事件列。证明：若 $A_n\uparrow A=\bigcup_nA_n$ 或 $A_n\downarrow A=\bigcap_nA_n$，则 $P(A_n)\to P(A)$。另对任意可数事件列 $(C_n)$，证明 $P(\bigcup_n C_n)\le\sum_nP(C_n)$。不假设事件独立。`],
  ['06',String.raw`设 $X$ 为实值随机变量，$F(x)=P(X\le x)$。证明 $F$ 的取值范围、单调性、两端极限和右连续性；说明 $F(x-)=P(X<x)$ 及 $F(x)-F(x-)=P(X=x)$。再以 $X$ 各以 $1/2$ 取 $0,1$ 为例，求 $F(0)$。`],
  ['06',String.raw`设 $X$ 是概率空间 $(\Omega,\mathcal F,P)$ 上的实值随机变量，$f:\mathbb R\to\mathbb R$ 为 Borel 可测函数。证明 $Y=f(X)$ 仍是随机变量，并解释集合原像 $X^{-1}(B)$ 的含义。`],
  ['07',String.raw`设 $E|X|<\infty$。对 $\varepsilon>0$，当 $n\varepsilon<X\le(n+1)\varepsilon$（$n\in\mathbb Z$）时，定义 $X_\varepsilon^*=n\varepsilon$。证明 $|X-X_\varepsilon^*|\le\varepsilon$ 以及 $EX_\varepsilon^*\to EX$。这是否意味着足够小时 $X_\varepsilon^*=X$？说明理由。`],
  ['07',String.raw`设离散随机变量 $X$ 取值 $x_i$、概率为 $p_i$，且 $E|g(X)|<\infty$，或 $g\ge0$ 而允许期望为无穷。证明 $E[g(X)]=\sum_i g(x_i)p_i$，并写出二维连续情形的对应公式。若 $X,Y$ 独立且均服从 $U(0,1)$，用原联合分布计算 $E|X-Y|$。`],
  ['07',String.raw`总体有 $N\ge1$ 件物品，其中 $D$ 件次品。等概率、不放回抽取 $n$ 件，$D,n\in\{0,\ldots,N\}$，记次品数为 $X$。分别用指标变量与分布列证明 $EX=nD/N$；说明 $D=1$ 时 $X$ 的分布。`],
  ['10',String.raw`已知 $Y$ 的密度 $f_Y$ 和条件密度 $f_{X\mid Y}(x\mid y)$，在 $f_X(x)>0$ 时推导 $f_{Y\mid X}(y\mid x)$。具体地，先取 $Y\sim U(0,1)$，给定 $Y=y$ 后取 $X\sim U(0,y)$。对 $0<x<1$ 求 $f_{Y\mid X}(y\mid x)$ 和 $E(Y\mid X=x)$，写明支持。`],
  ['09',String.raw`设 $(X,Y)$ 为实值随机向量，$F(x,y)=P(X\le x,Y\le y)$。说明其取值范围、对每个坐标的单调性与右连续性，以及各坐标趋于正负无穷时的极限。对 $a<b,c<d$，推导 $P(a<X\le b,c<Y\le d)$ 的四项差分公式。`],
  ['11',String.raw`$(X,Y)$ 服从二元正态分布，均值为 $\mu_1,\mu_2$，标准差 $\sigma_1,\sigma_2>0$，相关系数 $|\rho|<1$。从二维密度出发，证明 $X+Y$ 服从正态分布，并求其均值与方差。`],
  ['11',String.raw`$(X,Y)$ 有联合密度 $f$。变换 $(u,v)=T(x,y)$ 在承载全部概率的区域上可逆、连续可微，且雅可比非零；反函数为 $x=x(u,v),y=y(u,v)$。由任意区域的概率相等，证明新密度为 $f(x(u,v),y(u,v))\left|\det\frac{\partial(x,y)}{\partial(u,v)}\right|$，并解释绝对值和新支持的作用。`],
  ['12',String.raw`设 $EX^2,EY^2<\infty$。说明 $\operatorname{Cov}(X,Y)$ 存在；在两个方差均为正时，证明相关系数满足 $|\rho|\le1$，并说明取等号与两个变量几乎必然呈线性关系之间的联系。`],
  ['12',String.raw`甲乙独立进行各局比赛，无平局；每局甲胜概率 $p$、乙胜概率 $q=1-p$，$0<p<1$。同一人连续赢两局即停止。求从尚未开赛起的平均局数，并解释为什么递推中使用的期望有限。`]
 ];
 proofStems.forEach(([group,stem],i)=>{
  const s=section('35',t=>t.startsWith((i+1)+'｜'));
  add({id:'R'+String(i+1).padStart(2,'0'),docId:'35',group,title:plain(s.heading).split('｜').slice(1).join('｜').replace(/（[^（）]*）$/,''),label:s.label,stem:render(stem,'review-proof-'+(i+1)).html,answer:s.body,anchor:s.anchor,kind:'证明与推导',rank:2});
 });
 function namespace(html,id){
  return html.replace(/\bid="([^"]+)"/g,(_,anchor)=>`id="review-${id}-${anchor}"`).replace(/href="#(?!doc=)([^"]+)"/g,(_,anchor)=>`href="#review-${id}-${anchor}"`);
 }
 function card(item){
  const {id,docId,title,label,kind}=item;
  return `<section class="review-card" data-review-id="${id}" data-review-label="${esc(label)}"><h3 class="review-question" id="q-${id}" data-review-question="${id}">${esc(id+'｜'+title)}<span class="learning-requirement">（${esc(label)}）</span></h3><p class="review-origin">${esc(kind)} · <a href="#doc=${docId}&amp;section=${item.anchor}">回到原讲义</a></p>${namespace(item.stem,id)}<details class="review-answer"><summary>展开解答与思路</summary><template>${namespace(item.answer,id)}</template></details></section>`;
 }
 const toc=[],parts=[];
 for(const g of groups){
  g.items.sort((a,b)=>a.rank-b.rank);
  const main=g.items.filter(i=>!i.optional),optional=g.items.filter(i=>i.optional);
  const anchor='review-topic-'+g.id;
  toc.push({anchor,title:g.title+' · '+g.items.length+'题',level:2});
  parts.push(`<h2 id="${anchor}">${esc(g.title)} · ${g.items.length}题</h2><p>${esc(g.intro)}</p>${main.map(card).join('\n')}${optional.length?`<h3 id="${anchor}-optional">了解与选读 · ${optional.length}题</h3><p>这部分标为“了解”的内容不考，按兴趣选读。</p>${optional.map(card).join('\n')}`:''}`);
 }
 const sourceCount=rows.length,optionalCount=entries.filter(e=>e.optional).length;
 const html=`<h1>期中复习题集｜从基础到综合</h1><p>共 <strong>${entries.length} 道题</strong>，按 13 个专题编排：${sourceCount} 条讲义、PPT、教材来源题，以及 ${entries.length-sourceCount} 道独立练习、证明、方法专题与综合训练。保留原题号；来源题按已有合并条目计数，小问不另拆题。</p><p>每个专题先做基础练习，再做来源例题、证明与变式。先独立作答，再点击题目下方的“展开解答与思路”。已有细讲直接沿用原讲义；同型题中有不同条件或训练角度的继续保留。</p><p>每题保留学习要求。纯“了解”题共 ${optionalCount} 道，放在各专题末尾；了解内容不考。混合题按括注区分掌握与了解的部分。</p><nav class="review-index" aria-label="题集专题">${toc.map(t=>`<a href="#doc=40&amp;section=${t.anchor}">${esc(t.title)}</a>`).join('')}</nav>${parts.join('\n')}`;
 Object.assign(target,{html,toc,questionCount:0,reviewCount:entries.length,reviewEntries:entries.map(({stem,answer,...item})=>item),search:entries.map(e=>e.id+' '+e.title+' '+plain(e.stem)).join('\n'),learningRequirements:entries.map(e=>({key:'q-'+e.id,kind:'heading',label:e.label})),reviewStats:{source:sourceCount,additional:entries.length-sourceCount,optional:optionalCount,total:entries.length}});
}
