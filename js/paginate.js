/* İçeriği antetli A4 sayfalara böler.
 * Bloklar sığmadığında paragraflar kelime sınırından, listeler maddelerden,
 * tablolar satırlardan bölünür.
 */
(function () {
  const INLINE = new Set(['A', 'ABBR', 'B', 'BR', 'CODE', 'EM', 'FONT', 'I', 'IMG', 'MARK', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U', 'LABEL', 'BDI', 'BDO', 'Q', 'TIME', 'WBR', 'DEL', 'INS', 'KBD', 'VAR', 'CITE']);
  const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DETAILS', 'DIV', 'DL', 'FIELDSET', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL']);

  function isPageBreak(n) {
    return n.nodeType === 1 && n.classList && (n.classList.contains('page-break') || n.classList.contains('docx-page-break'));
  }

  function isInline(n) {
    return n.nodeType === 3 || (n.nodeType === 1 && INLINE.has(n.tagName));
  }

  function hasBlockChildren(el) {
    for (const c of el.children) if (BLOCK.has(c.tagName)) return true;
    return false;
  }

  // Üst seviyedeki serbest metin/satır içi öğeleri <p> içine toplar.
  function normalizeTop(nodes) {
    const out = [];
    let run = null;
    for (const n of nodes) {
      if (n.nodeType === 8) continue;
      if (n.nodeType === 3 && !n.textContent.trim()) { if (run) run.appendChild(n); continue; }
      if (isInline(n)) {
        if (!run) { run = document.createElement('p'); out.push(run); }
        run.appendChild(n);
      } else { run = null; out.push(n); }
    }
    return out;
  }

  function cut(node, n, keepHead) {
    const c = node.cloneNode(true);
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    let acc = 0, t, pos = null;
    while ((t = walker.nextNode())) {
      if (acc + t.data.length >= n) { pos = [t, n - acc]; break; }
      acc += t.data.length;
    }
    const r = document.createRange();
    if (!pos) { if (!keepHead) { r.selectNodeContents(c); r.deleteContents(); } return c; }
    if (keepHead) { r.setStart(pos[0], pos[1]); r.setEnd(c, c.childNodes.length); }
    else { r.setStart(c, 0); r.setEnd(pos[0], pos[1]); }
    r.deleteContents();
    return c;
  }

  function trimLeading(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) {
      const s = t.data.replace(/^\s+/, '');
      t.data = s;
      if (s.length) break;
    }
  }

  function splitText(node, parent, fits) {
    const text = node.textContent;
    const total = text.length;
    if (total < 2) return null;
    let lo = 1, hi = total, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = cut(node, mid, true);
      parent.appendChild(c);
      const ok = fits();
      parent.removeChild(c);
      if (ok) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best <= 0) return null;
    if (best >= total) { parent.appendChild(node); return { rest: null }; }
    let n = best;
    const ws = text.slice(0, n).search(/\s\S*$/);
    if (ws > 0) n = ws + 1;
    const first = cut(node, n, true);
    first.style.marginBottom = '0';
    parent.appendChild(first);
    const rest = cut(node, n, false);
    trimLeading(rest);
    rest.style.textIndent = '0';
    rest.style.marginTop = '0';
    return { rest };
  }

  function splitTable(table, parent, fits) {
    const head = table.tHead;
    const colgroups = Array.from(table.querySelectorAll(':scope > colgroup'));
    const rows = Array.from(table.rows).filter(r => !head || r.parentNode !== head);
    const makeShell = () => {
      const s = table.cloneNode(false);
      colgroups.forEach(cg => s.appendChild(cg.cloneNode(true)));
      if (head) s.appendChild(head.cloneNode(true));
      const tb = document.createElement('tbody');
      s.appendChild(tb);
      return [s, tb];
    };
    const [shell, tb] = makeShell();
    parent.appendChild(shell);
    let i = 0;
    for (; i < rows.length; i++) {
      tb.appendChild(rows[i]);
      if (!fits()) { tb.removeChild(rows[i]); break; }
    }
    if (i === 0) { parent.removeChild(shell); return null; }
    if (i === rows.length) return { rest: null };
    const [rest, rtb] = makeShell();
    for (let j = i; j < rows.length; j++) rtb.appendChild(rows[j]);
    return { rest };
  }

  function splitChildren(node, parent, fits) {
    const shell = node.cloneNode(false);
    parent.appendChild(shell);
    const kids = Array.from(node.childNodes);
    let i = 0;
    for (; i < kids.length; i++) {
      shell.appendChild(kids[i]);
      if (!fits()) { shell.removeChild(kids[i]); break; }
    }
    if (i === kids.length) return { rest: null };
    let partial = null;
    if (kids[i].nodeType === 1) partial = splitNode(kids[i], shell, fits);
    const movedWhole = Array.from(shell.children).length - (partial ? 1 : 0);
    if (!shell.textContent.trim() && !shell.querySelector('img,table') && !partial) {
      parent.removeChild(shell);
      return null;
    }
    const rest = node.cloneNode(false);
    if (partial) { if (partial.rest) rest.appendChild(partial.rest); }
    else rest.appendChild(kids[i]);
    for (let j = i + 1; j < kids.length; j++) rest.appendChild(kids[j]);
    if (!rest.childNodes.length) return { rest: null };
    if (node.tagName === 'OL') {
      const start = parseInt(node.getAttribute('start') || '1', 10) || 1;
      rest.setAttribute('start', String(start + movedWhole));
    }
    if (partial && partial.rest && partial.rest.tagName === 'LI') partial.rest.style.listStyleType = 'none';
    rest.style.marginTop = '0';
    return { rest };
  }

  // Düğümün sığan kısmını parent'a ekler; { rest } döndürür ya da bölünemezse null.
  function splitNode(node, parent, fits) {
    if (node.nodeType !== 1) return null;
    const tag = node.tagName;
    if (tag === 'TABLE') return splitTable(node, parent, fits);
    if (tag === 'UL' || tag === 'OL' || hasBlockChildren(node)) return splitChildren(node, parent, fits);
    if (tag === 'IMG' || tag === 'HR') return null;
    return splitText(node, parent, fits);
  }

  async function preloadImages(root) {
    const imgs = Array.from(root.querySelectorAll('img'));
    await Promise.all(imgs.map(i => new Promise(res => {
      const im = new Image();
      im.onload = im.onerror = res;
      im.src = i.src;
    })));
  }

  /**
   * html içeriğini sayfalara dağıtır.
   * newPage(): yeni sayfa oluşturup DOM'a ekler ve içerik kutusunu döndürür.
   */
  async function paginate(html, newPage) {
    const src = document.createElement('div');
    src.innerHTML = html || '';
    await preloadImages(src);
    const queue = normalizeTop(Array.from(src.childNodes));
    let box = newPage();
    const fits = () => box.scrollHeight <= box.clientHeight + 1;
    let pages = 1;
    const next = () => { box = newPage(); pages++; };

    let guard = 0;
    while (queue.length && guard++ < 20000) {
      const node = queue.shift();
      if (isPageBreak(node)) { if (box.childNodes.length) next(); continue; }
      box.appendChild(node);
      if (fits()) continue;
      box.removeChild(node);
      const res = splitNode(node, box, fits);
      if (res) {
        if (res.rest) { next(); queue.unshift(res.rest); }
        continue;
      }
      if (!box.childNodes.length) {
        box.appendChild(node); // tek başına sayfaya sığmıyor: olduğu gibi bırak
        if (queue.length) next();
        continue;
      }
      // Başlığı sayfa sonunda yalnız bırakma
      const last = box.lastElementChild;
      if (last && /^H[1-6]$/.test(last.tagName) && box.children.length > 1) {
        box.removeChild(last);
        queue.unshift(node);
        queue.unshift(last);
      } else {
        queue.unshift(node);
      }
      next();
    }
    return pages;
  }

  window.Paginator = { paginate };
})();
