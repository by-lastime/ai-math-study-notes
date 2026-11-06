'use strict';
(() => {
  const article = document.querySelector('#article');
  const bar = document.querySelector('#selection-ask-bar');
  const dialog = document.querySelector('#selection-ask-dialog');
  const status = document.querySelector('#selection-ask-status');
  const copyButton = document.querySelector('#selection-ask-copy');
  const question = document.querySelector('#selection-ask-question');
  const preview = document.querySelector('#selection-ask-preview');
  const feedback = document.querySelector('#selection-ask-feedback');
  let draft = null, lastKey = '', copiedPrompt = '', selecting = false, selectionTimer;

  // Recover the original TeX once per formula, rather than copying KaTeX's
  // duplicate accessibility/visual trees or losing superscripts and fractions.
  function readableText(fragment) {
    const root = document.createElement('div');
    root.append(fragment);
    root.querySelectorAll('.katex').forEach(math => {
      const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      if (tex) math.replaceWith(document.createTextNode(math.closest('.katex-display')
        ? `\n$$\n${tex}\n$$\n` : `$${tex}$`));
    });
    root.querySelectorAll('details:not([open])').forEach(details => {
      const summary = details.querySelector(':scope > summary');
      details.replaceWith(summary ? summary.cloneNode(true) : document.createTextNode(''));
    });
    root.querySelectorAll('.question-tools,.source-chips,.question-scope,button,input,textarea,script,style,[hidden],[aria-hidden="true"]').forEach(el => el.remove());
    root.querySelectorAll('svg').forEach(svg => svg.replaceWith(document.createTextNode(
      svg.getAttribute('aria-label') || svg.textContent || '（所选区域含示意图）')));
    root.querySelectorAll('img').forEach(img => img.replaceWith(document.createTextNode(img.alt ? `（题图：${img.alt}）` : '')));
    const blocks = new Set(['P','DIV','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','PRE','UL','OL','DETAILS','SUMMARY','FIGURE','FIGCAPTION','TR']);
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.tagName === 'BR') return '\n';
      const text = [...node.childNodes].map(walk).join('');
      if (node.tagName === 'TD' || node.tagName === 'TH') return text + '\t';
      if (node.tagName === 'LI') return '\n- ' + text + '\n';
      return blocks.has(node.tagName) ? '\n' + text + '\n' : text;
    }
    return walk(root).replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function elementFor(node) { return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement; }
  function precedesOrContains(node, target) {
    return node.contains(target) || !!(node.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
  }
  function questionAt(node) {
    const boundary = [...article.querySelectorAll('h1,h2,[id^="q-"]')].filter(el => precedesOrContains(el, node)).at(-1);
    return boundary?.id.startsWith('q-') ? boundary : null;
  }
  function contextFromSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || dialog.open || document.querySelector('dialog[open]')) return null;
    const original = selection.getRangeAt(0);
    if (!article.contains(original.startContainer) || !article.contains(original.endContainer)) return null;
    if ([original.startContainer, original.endContainer].some(n => elementFor(n)?.closest('button,input,textarea,.question-tools'))) return null;
    const range = original.cloneRange();
    const startMath = elementFor(range.startContainer)?.closest('.katex');
    const endMath = elementFor(range.endContainer)?.closest('.katex');
    if (startMath) range.setStartBefore(startMath.closest('.katex-display') || startMath);
    if (endMath) range.setEndAfter(endMath.closest('.katex-display') || endMath);
    const text = readableText(range.cloneContents());
    if (!text) return null;
    const docs = window.MATH_DATA?.docs || [];
    const h1 = article.querySelector('h1')?.textContent || document.title;
    const doc = docs.find(d => d.id === new URLSearchParams(location.hash.slice(1)).get('doc')) || docs.find(d => d.title === h1);
    const heading = [...article.querySelectorAll('h2,h3,h4')].filter(el => precedesOrContains(el, original.startContainer)).at(-1);
    const firstQuestion = questionAt(original.startContainer);
    const questions = [...new Set([firstQuestion, ...article.querySelectorAll('[id^="q-"]')].filter(el => el && range.intersectsNode(el)).map(el => el.id.slice(2)))];
    // The anchor can precede a selected solution; it need not intersect it.
    if (firstQuestion && !questions.includes(firstQuestion.id.slice(2))) questions.unshift(firstQuestion.id.slice(2));
    const anchor = firstQuestion?.id || heading?.id || '';
    const docId = doc?.id || new URLSearchParams(location.hash.slice(1)).get('doc') || 'guide';
    const url = location.href.split('#')[0]+'#' + new URLSearchParams({doc:docId, ...(anchor ? {section:anchor} : {})});
    return {text, title:doc?.title || h1, section:heading?.textContent || '', questions, url, range:original.cloneRange(), question:''};
  }

  function promptFor(value) {
    const position = [value.title, value.section, ...value.questions.filter(id => !value.section.includes(id))].filter(Boolean).join(' → ');
    return `位置：${position}\n${value.url}\n\n原文：\n${value.text}\n\n我的问题：${value.question.trim() ? '\n' + value.question.trim() : ''}`;
  }
  function updateStatus() {
    if (!draft) return;
    const copied = copiedPrompt === promptFor(draft);
    status.textContent = copied ? '提问已复制，可直接粘贴到对话' : '提问已生成，点击复制后发给对话';
    copyButton.textContent = copied ? '再次复制' : '复制提问';
    document.querySelector('#selection-ask-dialog-copy').textContent = copied ? '再次复制完整提问' : '复制完整提问';
  }
  async function writeClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* Browsers can require a second, explicit copy gesture. */ }
    const selection = window.getSelection();
    const ranges = selection ? Array.from({length:selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    const focus = document.activeElement, scroll = {left:scrollX, top:scrollY};
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('aria-label', '复制提问临时内容');
    textarea.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;';
    (dialog.open ? dialog : document.body).append(textarea);
    let copied = false;
    try { textarea.focus({preventScroll:true}); textarea.select(); copied = document.execCommand('copy'); }
    catch { copied = false; }
    finally {
      textarea.remove(); focus?.focus({preventScroll:true});
      if (selection) { selection.removeAllRanges(); ranges.forEach(range => { if (range.startContainer.isConnected) selection.addRange(range); }); }
      window.scrollTo({...scroll, behavior:'instant'});
    }
    return copied;
  }
  async function copyPrompt(manual = false) {
    if (!draft) return;
    const value = draft, text = promptFor(value);
    const copied = await writeClipboard(text);
    if (value !== draft) return;
    if (copied) copiedPrompt = text;
    updateStatus();
    if (manual) {
      if (copied) {
        feedback.textContent = '提问已复制，直接粘贴到对话即可。';
      } else {
        openEditor(); preview.focus({preventScroll:true}); preview.select();
        feedback.textContent = '自动复制未获允许。已选中完整提问，可按 ⌘C / Ctrl+C，或长按复制。';
      }
    }
  }
  function captureSelection() {
    if (selecting || dialog.open) return;
    const value = contextFromSelection();
    if (!value) {
      if (!bar.contains(document.activeElement)) { bar.hidden = true; lastKey = ''; }
      return;
    }
    const key = promptFor(value);
    if (key === lastKey) return;
    lastKey = key; draft = value; bar.hidden = false; updateStatus();
    // Start the write inside pointerup/keyup when available, preserving activation.
    void copyPrompt();
  }
  function openEditor() {
    if (!draft) return;
    clearTimeout(selectionTimer);
    question.value = draft.question;
    preview.value = promptFor(draft);
    document.querySelector('#selection-ask-context').textContent = [draft.title, draft.section, ...draft.questions].filter(Boolean).join(' · ');
    feedback.textContent = copiedPrompt === preview.value ? '提问已复制；修改问题后请重新复制。' : '原文与提问仅在当前页面处理。';
    bar.hidden = true;
    if (!dialog.open) { document.documentElement.classList.add('selection-ask-open'); dialog.showModal(); }
    question.focus({preventScroll:true});
  }
  function finishEditor() {
    document.documentElement.classList.remove('selection-ask-open');
    if (!draft) return;
    lastKey = promptFor({...draft, question:''});
    bar.hidden = false; updateStatus();
    document.querySelector('#selection-ask-edit').focus({preventScroll:true});
    if (draft.range.startContainer.isConnected) {
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(draft.range);
    }
  }
  function reset() {
    clearTimeout(selectionTimer); selecting = false; draft = null; lastKey = ''; bar.hidden = true;
    if (dialog.open) dialog.close();
  }
  const tip = document.createElement('p');
  tip.id = 'selection-ask-tip';
  tip.textContent = '选中一段正文，即可自动复制提问；也可补充你的具体疑问。';
  article.before(tip);
  document.addEventListener('pointerdown', event => {
    selecting = article.contains(event.target) && !event.target.closest('button,input,textarea');
    if (selecting) lastKey = '';
  });
  document.addEventListener('pointerup', () => { selecting = false; captureSelection(); });
  document.addEventListener('pointercancel', () => { selecting = false; });
  document.addEventListener('keyup', event => {
    if (!event.target.closest('input,textarea,select,button,[contenteditable="true"]') && !event.metaKey && !event.ctrlKey && event.key !== 'Escape') captureSelection();
  });
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    if (!selecting && !dialog.open) selectionTimer = setTimeout(captureSelection, 450);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.open) { bar.hidden = true; clearTimeout(selectionTimer); }
  });
  bar.addEventListener('mousedown', event => event.preventDefault());
  copyButton.onclick = () => void copyPrompt(true);
  document.querySelector('#selection-ask-edit').onclick = openEditor;
  document.querySelector('#selection-ask-dismiss').onclick = () => { bar.hidden = true; clearTimeout(selectionTimer); };
  document.querySelector('#selection-ask-close').onclick = () => dialog.close();
  document.querySelector('#selection-ask-dialog-copy').onclick = () => void copyPrompt(true);
  question.oninput = () => {
    if (!draft) return;
    draft.question = question.value; preview.value = promptFor(draft); updateStatus();
    feedback.textContent = '问题已更新，点击“复制完整提问”后发送。';
  };
  dialog.addEventListener('close', finishEditor);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  window.addEventListener('hashchange', reset);
  new MutationObserver(reset).observe(article, {childList:true});
})();
