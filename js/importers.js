/* Yüklenen dosyaları (Word, PDF, metin, HTML, görsel) düzenlenebilir HTML'e çevirir. */
(function () {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function sanitize(root) {
    root.querySelectorAll('script,iframe,object,embed,link,meta,base,form,input,button,textarea,select,style,title,noscript').forEach(e => e.remove());
    root.querySelectorAll('*').forEach(el => {
      for (const a of Array.from(el.attributes)) {
        const n = a.name.toLowerCase();
        const v = a.value.trim().toLowerCase();
        if (n.startsWith('on') || n === 'contenteditable') el.removeAttribute(a.name);
        else if ((n === 'href' || n === 'src' || n === 'xlink:href') && (v.startsWith('javascript:') || v.startsWith('vbscript:'))) el.removeAttribute(a.name);
      }
    });
    return root;
  }

  function sanitizeHTML(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return sanitize(doc.body).innerHTML;
  }

  function textToHTML(text) {
    const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
    return paras.map(p => p.trim() ? `<p>${esc(p).replace(/\n/g, '<br>')}</p>` : '').join('');
  }

  function readAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }

  async function fromDocx(file) {
    if (!window.docx || !window.docx.renderAsync) throw new Error('Word okuyucu yüklenemedi.');
    const buf = await file.arrayBuffer();
    const body = document.createElement('div');
    const styles = document.createElement('div');
    body.style.cssText = 'position:fixed;left:-20000px;top:0;width:800px';
    document.body.appendChild(body);
    try {
      await window.docx.renderAsync(buf, body, styles, {
        className: 'docx',
        inWrapper: false,
        ignoreWidth: true,
        ignoreHeight: true,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: false,
        renderFooters: false,
        renderFootnotes: true,
        renderEndnotes: true,
        useBase64URL: true,
        experimental: false
      });
      const sections = Array.from(body.querySelectorAll('section.docx'));
      const parts = sections.map(sec => {
        const art = sec.querySelector(':scope > article') || sec;
        return art.innerHTML;
      }).filter(h => h.replace(/<[^>]+>/g, '').trim() || /<img|<table/i.test(h));
      const html = sanitizeHTML(parts.join('<hr class="page-break">'));
      let css = Array.from(styles.querySelectorAll('style')).map(s => s.textContent).join('\n');
      // Sayfa düzeni kurallarını antetimize bırak: section/wrapper ölçülerini kaldır
      css = css.replace(/section\.docx\s*\{[^}]*\}/g, '').replace(/\.docx-wrapper[^{]*\{[^}]*\}/g, '');
      return { html, css };
    } finally {
      body.remove();
    }
  }

  async function fromPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF okuyucu yüklenemedi.');
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const pagesHTML = [];
    let anyText = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const items = tc.items.filter(it => it.str !== undefined);
      // Satırları y koordinatına göre grupla
      const lines = [];
      for (const it of items) {
        const y = it.transform[5], x = it.transform[4], h = Math.abs(it.transform[3]) || it.height || 10;
        let line = lines.find(l => Math.abs(l.y - y) < h * 0.5);
        if (!line) { line = { y, h, parts: [] }; lines.push(line); }
        line.parts.push({ x, str: it.str, w: it.width });
        line.h = Math.max(line.h, h);
      }
      lines.sort((a, b) => b.y - a.y);
      let html = '', para = [], prevY = null, prevH = 0;
      const flush = () => { if (para.length) { html += `<p>${para.map(esc).join('<br>')}</p>`; para = []; } };
      for (const l of lines) {
        l.parts.sort((a, b) => a.x - b.x);
        let s = '', lastEnd = null;
        for (const p of l.parts) {
          if (lastEnd !== null && p.x - lastEnd > 2 && !s.endsWith(' ') && !p.str.startsWith(' ')) s += ' ';
          s += p.str;
          lastEnd = p.x + (p.w || 0);
        }
        s = s.replace(/\s+/g, ' ').trim();
        if (!s) continue;
        anyText = true;
        if (prevY !== null && prevY - l.y > Math.max(prevH, l.h) * 1.8) flush();
        para.push(s);
        prevY = l.y; prevH = l.h;
      }
      flush();
      pagesHTML.push(html);
    }
    if (anyText) return { html: pagesHTML.filter(Boolean).join('<hr class="page-break">') };
    // Metin yoksa (taranmış PDF) sayfaları görsel olarak ekle
    const imgs = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      imgs.push(`<p style="text-align:center"><img src="${c.toDataURL('image/jpeg', 0.9)}" alt=""></p>`);
    }
    return { html: imgs.join('<hr class="page-break">') };
  }

  // PDF veya görsel dosyasından tam sayfa antet arka planı üretir
  async function letterheadBackground(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await window.pdfjsLib.getDocument({ data }).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 1654 / base.width }); // ~200 dpi A4
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return c.toDataURL('image/jpeg', 0.92);
    }
    if (/^(png|jpe?g|webp|gif)$/.test(ext)) return readAsDataURL(file);
    throw new Error('Antet için PDF, PNG veya JPG dosyası seçin.');
  }

  async function importFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    switch (ext) {
      case 'docx':
      case 'docm':
      case 'dotx':
        return fromDocx(file);
      case 'doc':
        throw new Error('Eski .doc biçimi tarayıcıda okunamıyor. Word’de “Farklı Kaydet → Word Belgesi (.docx)” seçip tekrar yükleyin.');
      case 'pdf':
        return fromPdf(file);
      case 'txt':
      case 'md':
      case 'csv':
      case 'log':
        return { html: textToHTML(await file.text()) };
      case 'html':
      case 'htm':
        return { html: sanitizeHTML(await file.text()) };
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        return { html: `<p style="text-align:center"><img src="${await readAsDataURL(file)}" alt=""></p>` };
      default:
        throw new Error(`“.${ext}” dosya türü desteklenmiyor. Word (.docx), PDF, metin, HTML veya görsel yükleyin.`);
    }
  }

  window.Importers = { importFile, letterheadBackground, sanitizeHTML, readAsDataURL };
})();
