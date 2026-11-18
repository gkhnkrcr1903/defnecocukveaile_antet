/* Defne Çocuk ve Aile Belge Uygulaması — ana uygulama */
(function () {
  const LH = window.Letterhead;
  const KEY_CFG = 'defne-antet-v1';
  const KEY_DOC = 'defne-belge-v1';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- Depolama ----------
  function load(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  let warnedQuota = false;
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) {
      if (!warnedQuota) { warnedQuota = true; toast('Tarayıcı depolama alanı dolu: değişiklikler bu tarayıcıya kaydedilemedi.', true); }
    }
  }

  let cfg = LH.fromSaved(load(KEY_CFG));
  const docState = Object.assign({ html: '', css: '', name: '' }, load(KEY_DOC) || {});

  // ---------- Yardımcılar ----------
  let toastTimer;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 6000 : 3000);
  }
  function busy(text) {
    const b = $('#busy');
    if (text) { $('#busy-text').textContent = text; b.hidden = false; } else b.hidden = true;
  }
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  const nextFrame = () => new Promise(r => setTimeout(r, 60));

  // ---------- Sekmeler ----------
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => {
    $$('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'document') renderPreview(); else renderLhPreview();
  }));

  // ---------- Editör ----------
  const editor = $('#editor');
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* yok say */ }

  function applyDocxCss(css) {
    const host = $('#docx-style-host');
    host.innerHTML = '';
    if (css) { const st = document.createElement('style'); st.textContent = css; host.appendChild(st); }
  }

  function applyEditorVars() {
    const r = LH.contentRect(cfg, 0);
    const c = cfg.content;
    editor.style.setProperty('--c-width', r.width + 'px');
    editor.style.setProperty('--c-font', LH.fontStack(c.font));
    editor.style.setProperty('--c-size', (c.size * 4 / 3) + 'px');
    editor.style.setProperty('--c-lh', c.lineHeight);
    editor.style.setProperty('--c-color', c.color);
  }

  function editorHTML() {
    const h = editor.innerHTML;
    return h.replace(/<[^>]+>/g, '').trim() || /<(img|table|hr)/i.test(h) ? h : '';
  }

  const saveDoc = debounce(() => {
    docState.html = editorHTML();
    save(KEY_DOC, docState);
  }, 500);

  editor.addEventListener('input', () => { saveDoc(); schedulePreview(); });

  $('#toolbar').addEventListener('mousedown', e => {
    if (e.target.closest('button')) e.preventDefault(); // seçimi koru
  });
  $('#toolbar').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    editor.focus();
    if (b.dataset.cmd) document.execCommand(b.dataset.cmd, false, null);
    else if (b.dataset.action === 'date') {
      const d = new Date();
      const s = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
      document.execCommand('insertText', false, s);
    } else if (b.dataset.action === 'pagebreak') {
      document.execCommand('insertHTML', false, '<hr class="page-break"><p><br></p>');
    }
    editor.dispatchEvent(new Event('input'));
  });
  $('[data-block]').addEventListener('change', e => {
    editor.focus();
    document.execCommand('formatBlock', false, e.target.value);
    e.target.value = 'p';
    editor.dispatchEvent(new Event('input'));
  });
  $('[data-color]').addEventListener('input', e => {
    editor.focus();
    document.execCommand('foreColor', false, e.target.value);
    editor.dispatchEvent(new Event('input'));
  });

  // ---------- Dosya yükleme ----------
  const dz = $('#dropzone');
  $('#file-input').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  // Sayfanın herhangi bir yerine bırakılırsa tarayıcı dosyayı açmasın
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { if (!dz.contains(e.target)) { e.preventDefault(); handleFiles(e.dataTransfer.files); } });

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const results = [];
    for (const f of files) {
      busy(`“${f.name}” okunuyor…`);
      try {
        results.push(await window.Importers.importFile(f));
      } catch (err) {
        console.error(err);
        toast(`${f.name}: ${err.message || 'Dosya okunamadı.'}`, true);
      }
    }
    busy(false);
    if (!results.length) return;
    const html = results.map(r => r.html).join('<hr class="page-break">');
    const css = results.map(r => r.css || '').filter(Boolean).join('\n');
    let replace = true;
    if (editorHTML()) {
      replace = confirm('Editörde zaten içerik var.\n\nTamam → Mevcut içeriği yeni dosyayla DEĞİŞTİR\nİptal → Yeni dosyayı belgenin SONUNA EKLE');
    }
    if (replace) {
      editor.innerHTML = html;
      docState.css = css;
    } else {
      editor.innerHTML = editor.innerHTML + '<hr class="page-break">' + html;
      docState.css = [docState.css, css].filter(Boolean).join('\n');
    }
    applyDocxCss(docState.css);
    docState.name = files[0].name.replace(/\.[^.]+$/, '');
    docState.html = editorHTML();
    save(KEY_DOC, docState);
    await renderPreview();
    toast(files.length > 1 ? `${results.length} dosya antete yerleştirildi.` : 'Belge antete yerleştirildi.');
  }

  $('#btn-new').addEventListener('click', () => {
    if (editorHTML() && !confirm('Editördeki içerik silinecek. Emin misiniz?')) return;
    editor.innerHTML = '';
    docState.html = ''; docState.css = ''; docState.name = '';
    applyDocxCss('');
    save(KEY_DOC, docState);
    renderPreview();
  });

  // ---------- Sayfalama ve önizleme ----------
  async function buildPages(target, html, lhCfg = cfg) {
    const assets = await LH.prepare(lhCfg);
    target.innerHTML = '';
    const pages = [];
    await window.Paginator.paginate(html, () => {
      const { page, box } = LH.createPage(lhCfg, assets, pages.length);
      target.appendChild(page);
      pages.push(page);
      return box;
    });
    return pages;
  }

  function frame(page, scale, num) {
    const f = document.createElement('div');
    f.className = 'page-frame';
    f.style.width = (LH.PAGE_W * scale) + 'px';
    f.style.height = (LH.PAGE_H * scale) + 'px';
    page.style.transform = `scale(${scale})`;
    f.appendChild(page);
    if (num) { const n = document.createElement('span'); n.className = 'page-num'; n.textContent = num; f.appendChild(n); }
    return f;
  }

  function fitScale(container) {
    const w = container.clientWidth - 24;
    return Math.max(0.3, Math.min(1, w / LH.PAGE_W));
  }

  let previewToken = 0;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-30000px;top:0;';
  document.body.appendChild(stage);

  async function renderPreview() {
    const token = ++previewToken;
    const preview = $('#preview');
    const st = document.createElement('div');
    stage.appendChild(st);
    try {
      const pages = await buildPages(st, editorHTML());
      if (token !== previewToken) return;
      const s = fitScale(preview);
      const total = pages.length;
      preview.replaceChildren(...pages.map((p, i) => frame(p, s, `${i + 1} / ${total}`)));
      $('#page-count').textContent = total + ' sayfa';
    } finally {
      st.remove();
    }
  }
  const schedulePreview = debounce(renderPreview, 450);

  function rescale(container) {
    const s = fitScale(container);
    $$('.page-frame', container).forEach(f => {
      f.style.width = (LH.PAGE_W * s) + 'px';
      f.style.height = (LH.PAGE_H * s) + 'px';
      const p = $('.page', f);
      if (p) p.style.transform = `scale(${s})`;
    });
  }
  window.addEventListener('resize', debounce(() => { rescale($('#preview')); rescale($('#lh-preview')); }, 120));

  // ---------- Dışa aktarma ----------
  async function exportPDF(html, filename) {
    if (!window.html2canvas || !window.jspdf) { toast('PDF kütüphanesi yüklenemedi.', true); return; }
    busy('Sayfalar hazırlanıyor…');
    const root = $('#render-root');
    try {
      const pages = await buildPages(root, html);
      await nextFrame();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      for (let i = 0; i < pages.length; i++) {
        busy(`PDF oluşturuluyor… (${i + 1}/${pages.length})`);
        const canvas = await window.html2canvas(pages[i], {
          scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false,
          width: LH.PAGE_W, height: LH.PAGE_H, windowWidth: LH.PAGE_W, scrollX: 0, scrollY: 0
        });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      pdf.save(filename);
      toast('PDF indirildi.');
    } catch (err) {
      console.error(err);
      toast('PDF oluşturulamadı: ' + (err.message || err), true);
    } finally {
      root.innerHTML = '';
      busy(false);
    }
  }

  function safeName(s) {
    return (s || 'belge').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'belge';
  }

  $('#btn-pdf').addEventListener('click', () => exportPDF(editorHTML(), safeName(docState.name || 'defne-belge') + '_antetli.pdf'));
  $('#lh-blank').addEventListener('click', () => exportPDF('', 'defne-antetli-bos-sayfa.pdf'));

  $('#btn-print').addEventListener('click', async () => {
    busy('Yazdırma hazırlanıyor…');
    const root = $('#render-root');
    try {
      await buildPages(root, editorHTML());
      await nextFrame();
    } finally { busy(false); }
    window.print();
  });
  window.addEventListener('afterprint', () => { $('#render-root').innerHTML = ''; });

  // ---------- Antet düzenleme formu ----------
  const FONTS = ['Lexend', 'Outfit', 'Montserrat', 'Poppins', 'Raleway', 'Nunito Sans', 'Open Sans', 'Roboto', 'Merriweather', 'Arial', 'Times New Roman', 'Georgia'];
  const fontOpts = FONTS.map(f => [f, f]);

  const SCHEMA = [
    { title: 'Antet türü', open: true, fields: [
      { path: 'mode', type: 'select', label: 'Antet türü', options: [['design', 'Düzenlenebilir antet (önerilen)'], ['image', 'Hazır görsel / PDF antet (arka plan)']] },
      { type: 'bg', when: 'image' },
      { type: 'hint', when: 'design', text: 'Antetteki tüm öğeler (bant, logo, başlık, filigran, alt bilgi) aşağıdan düzenlenebilir. Değişiklikler hemen önizlemeye ve belgelere yansır.' }
    ] },
    { title: 'Genel', design: true, fields: [
      { path: 'font', type: 'select', label: 'Antet yazı tipi', options: fontOpts }
    ] },
    { title: 'Üst bant', design: true, fields: [
      { path: 'band.show', type: 'check', label: 'Üst bandı göster' },
      { path: 'band.color', type: 'color', label: 'Bant rengi' },
      { path: 'band.height', type: 'range', label: 'Bant yüksekliği', min: 0, max: 150 },
      { path: 'band.accentColor', type: 'color', label: 'İnce şerit rengi' },
      { path: 'band.accentHeight', type: 'range', label: 'İnce şerit kalınlığı', min: 0, max: 20 }
    ] },
    { title: 'Logo', design: true, fields: [
      { path: 'logo.show', type: 'check', label: 'Logoyu göster' },
      { path: 'logo.src', type: 'image', label: 'Logo görseli', def: 'logo' },
      { path: 'logo.width', type: 'range', label: 'Logo genişliği', min: 40, max: 600 },
      { path: 'logo.top', type: 'range', label: 'Üstten konum', min: 0, max: 500 },
      { path: 'logo.tint', type: 'check', label: 'Logoyu tek renge boya' },
      { path: 'logo.tintColor', type: 'color', label: 'Logo rengi' }
    ] },
    { title: 'Başlık yazısı', design: true, fields: [
      { path: 'title.show', type: 'check', label: 'Başlık yazısını göster' },
      { path: 'title.text', type: 'text', label: 'Metin' },
      { path: 'title.size', type: 'range', label: 'Yazı boyutu', min: 6, max: 40, step: 0.1 },
      { path: 'title.spacing', type: 'range', label: 'Harf aralığı (em)', min: 0, max: 1, step: 0.01 },
      { path: 'title.color', type: 'color', label: 'Renk' },
      { path: 'title.top', type: 'range', label: 'Üstten konum', min: 0, max: 600 }
    ] },
    { title: 'Ayraç çizgisi', design: true, fields: [
      { path: 'divider.show', type: 'check', label: 'Ayraç çizgisini göster' },
      { path: 'divider.color', type: 'color', label: 'Renk' },
      { path: 'divider.width', type: 'range', label: 'Uzunluk', min: 0, max: 700 },
      { path: 'divider.thickness', type: 'range', label: 'Kalınlık', min: 1, max: 10 },
      { path: 'divider.top', type: 'range', label: 'Üstten konum', min: 0, max: 600 }
    ] },
    { title: 'Filigran (arka plan logosu)', design: true, fields: [
      { path: 'watermark.show', type: 'check', label: 'Filigranı göster' },
      { path: 'watermark.src', type: 'image', label: 'Filigran görseli', def: 'watermark' },
      { path: 'watermark.opacity', type: 'range', label: 'Saydamlık', min: 0, max: 1, step: 0.01 },
      { path: 'watermark.width', type: 'range', label: 'Genişlik', min: 50, max: 1200 },
      { path: 'watermark.left', type: 'range', label: 'Soldan konum', min: -400, max: 794 },
      { path: 'watermark.top', type: 'range', label: 'Üstten konum', min: -300, max: 1123 }
    ] },
    { title: 'Alt bilgi', design: true, fields: [
      { path: 'footer.text', type: 'textarea', label: 'Alt bilgi satırları (her satır ayrı)' },
      { path: 'footer.boldFirst', type: 'check', label: 'İlk satır kalın' },
      { path: 'footer.color', type: 'color', label: 'Yazı rengi' },
      { path: 'footer.size', type: 'range', label: 'Yazı boyutu', min: 6, max: 24, step: 0.1 },
      { path: 'footer.lineGap', type: 'range', label: 'Satır aralığı', min: 10, max: 40 },
      { path: 'footer.top', type: 'range', label: 'Üstten konum', min: 600, max: 1123 },
      { path: 'footer.lineShow', type: 'check', label: 'Üstünde çizgi göster' },
      { path: 'footer.lineColor', type: 'color', label: 'Çizgi rengi' },
      { path: 'footer.lineWidth', type: 'range', label: 'Çizgi uzunluğu', min: 0, max: 794 },
      { path: 'footer.lineTop', type: 'range', label: 'Çizgi konumu', min: 600, max: 1123 }
    ] },
    { title: 'Belge metni ve kenar boşlukları', fields: [
      { path: 'content.font', type: 'select', label: 'Varsayılan metin yazı tipi', options: fontOpts },
      { path: 'content.size', type: 'range', label: 'Yazı boyutu (pt)', min: 7, max: 20, step: 0.5 },
      { path: 'content.lineHeight', type: 'range', label: 'Satır aralığı', min: 1, max: 2.5, step: 0.05 },
      { path: 'content.color', type: 'color', label: 'Metin rengi' },
      { path: 'content.top', type: 'range', label: 'Üst boşluk (metin başlangıcı)', min: 20, max: 700 },
      { path: 'content.bottom', type: 'range', label: 'Alt boşluk', min: 20, max: 500 },
      { path: 'content.left', type: 'range', label: 'Sol boşluk', min: 20, max: 250 },
      { path: 'content.right', type: 'range', label: 'Sağ boşluk', min: 20, max: 250 },
      { path: 'laterPages', type: 'select', label: '2. ve sonraki sayfalar', design: true, options: [['full', 'Tam antet (logo ve başlık dahil)'], ['compact', 'Sade (yalnızca bant, filigran ve alt bilgi)']] },
      { path: 'content.topCompact', type: 'range', label: 'Sade sayfalarda üst boşluk', min: 20, max: 400, design: true },
      { type: 'hint', text: 'Word dosyasındaki kendi yazı tipi ve boyutları korunur; buradaki değerler yalnızca biçim içermeyen metinlere uygulanır.' }
    ] }
  ];

  const getP = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), cfg);
  const setP = (path, val) => {
    const ks = path.split('.');
    const last = ks.pop();
    ks.reduce((o, k) => o[k], cfg)[last] = val;
  };

  const persistCfg = debounce(() => save(KEY_CFG, cfg), 400);
  const scheduleLh = debounce(() => renderLhPreview(), 120);
  function cfgChanged(rebuildForm) {
    persistCfg();
    applyEditorVars();
    if (rebuildForm) buildForm();
    scheduleLh();
    schedulePreview();
  }

  function fieldEl(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    if (f.when) wrap.dataset.when = f.when;
    if (f.design) wrap.dataset.when = 'design';
    const val = f.path ? getP(f.path) : null;
    const id = f.path ? 'f-' + f.path.replace(/\./g, '-') : '';

    if (f.type === 'hint') { wrap.innerHTML = `<p class="hint"></p>`; wrap.firstChild.textContent = f.text; return wrap; }

    if (f.type === 'check') {
      wrap.innerHTML = `<label class="check"><input type="checkbox" id="${id}"> <span></span></label>`;
      const inp = $('input', wrap);
      $('span', wrap).textContent = f.label;
      inp.checked = !!val;
      inp.addEventListener('change', () => { setP(f.path, inp.checked); cfgChanged(); });
      return wrap;
    }

    if (f.type === 'bg') {
      wrap.innerHTML = `
        <span>Antet görseli</span>
        <div class="img-field"><img alt=""><div class="field-row" style="flex-wrap:wrap">
          <label class="btn">PDF / görsel yükle<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden></label>
          <button type="button" class="btn ghost" data-orig>Orijinal Defne anteti</button>
        </div></div>
        <p class="hint">Hazır antetli kâğıdınızı (PDF'in ilk sayfası veya A4 görsel) arka plan olarak kullanır. Metin alanını aşağıdaki kenar boşluklarıyla ayarlayın.</p>`;
      const img = $('img', wrap);
      if (cfg.bgImage) img.src = cfg.bgImage; else img.style.visibility = 'hidden';
      $('input', wrap).addEventListener('change', async (e) => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        busy('Antet hazırlanıyor…');
        try { cfg.bgImage = await window.Importers.letterheadBackground(file); cfgChanged(true); toast('Antet görseli güncellendi.'); }
        catch (err) { toast(err.message || 'Antet okunamadı.', true); }
        finally { busy(false); }
      });
      $('[data-orig]', wrap).addEventListener('click', async () => {
        busy('Orijinal antet yükleniyor…');
        try {
          const blob = await (await fetch('assets/antet_orijinal.png')).blob();
          cfg.bgImage = await window.Importers.readAsDataURL(blob);
          cfgChanged(true);
        } catch (err) { toast('Orijinal antet yüklenemedi (uygulamayı web sunucusu üzerinden açın).', true); }
        finally { busy(false); }
      });
      return wrap;
    }

    const lab = document.createElement('span');
    lab.textContent = f.label;
    wrap.appendChild(lab);

    if (f.type === 'image') {
      const row = document.createElement('div');
      row.className = 'img-field';
      row.innerHTML = `<img alt=""><label class="btn">Değiştir<input type="file" accept="image/*" hidden></label><button type="button" class="btn ghost">Orijinal</button>`;
      $('img', row).src = val || (window.DEFNE_ASSETS || {})[f.def] || '';
      $('input', row).addEventListener('change', async (e) => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        const url = await window.Importers.readAsDataURL(file);
        setP(f.path, url);
        if (f.path === 'logo.src') cfg.logo.tint = false;
        cfgChanged(true);
      });
      $('button', row).addEventListener('click', () => { setP(f.path, null); cfgChanged(true); });
      wrap.appendChild(row);
      return wrap;
    }

    if (f.type === 'select') {
      const sel = document.createElement('select');
      sel.id = id;
      f.options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
      sel.value = val;
      sel.addEventListener('change', () => { setP(f.path, sel.value); cfgChanged(f.path === 'mode'); });
      wrap.appendChild(sel);
      return wrap;
    }

    if (f.type === 'text' || f.type === 'textarea') {
      const inp = document.createElement(f.type === 'text' ? 'input' : 'textarea');
      if (f.type === 'text') inp.type = 'text';
      inp.id = id;
      inp.value = val;
      inp.addEventListener('input', () => { setP(f.path, inp.value); cfgChanged(); });
      wrap.appendChild(inp);
      return wrap;
    }

    if (f.type === 'color') {
      const row = document.createElement('div');
      row.className = 'field-row';
      row.innerHTML = `<input type="color" id="${id}"><span class="hex"></span>`;
      const inp = $('input', row), hex = $('.hex', row);
      inp.value = val; hex.textContent = String(val).toUpperCase();
      inp.addEventListener('input', () => { setP(f.path, inp.value); hex.textContent = inp.value.toUpperCase(); cfgChanged(); });
      wrap.appendChild(row);
      return wrap;
    }

    if (f.type === 'range') {
      const row = document.createElement('div');
      row.className = 'field-row';
      row.innerHTML = `<input type="range" id="${id}"><input type="number">`;
      const [r, n] = $$('input', row);
      [r, n].forEach(x => { x.min = f.min; x.max = f.max; x.step = f.step || 1; x.value = val; });
      n.min = ''; n.max = ''; // sayı kutusunda serbest değer
      r.addEventListener('input', () => { n.value = r.value; setP(f.path, parseFloat(r.value)); cfgChanged(); });
      n.addEventListener('input', () => {
        const v = parseFloat(n.value);
        if (isNaN(v)) return;
        r.value = v; setP(f.path, v); cfgChanged();
      });
      wrap.appendChild(row);
      return wrap;
    }
    return wrap;
  }

  const openGroups = new Set(['Antet türü']);
  function buildForm() {
    const form = $('#lh-form');
    form.innerHTML = '';
    for (const g of SCHEMA) {
      if (g.design && cfg.mode !== 'design') continue;
      const d = document.createElement('details');
      d.className = 'lh-group';
      d.open = openGroups.has(g.title);
      d.addEventListener('toggle', () => { if (d.open) openGroups.add(g.title); else openGroups.delete(g.title); });
      const s = document.createElement('summary');
      s.textContent = g.title;
      d.appendChild(s);
      const fields = document.createElement('div');
      fields.className = 'fields';
      for (const f of g.fields) {
        const el = fieldEl(f);
        const when = el.dataset.when;
        if (when && when !== cfg.mode) continue;
        fields.appendChild(el);
      }
      d.appendChild(fields);
      form.appendChild(d);
    }
  }

  const SAMPLE = `
    <p style="text-align:right">18.11.2026</p>
    <p><strong>Sayın Veli,</strong></p>
    <p>Bu alan, yüklediğiniz belgelerin antetli kâğıt üzerinde nereye yerleşeceğini gösteren örnek metindir. Kenar boşluklarını ve yazı ayarlarını sol taraftan değiştirebilirsiniz.</p>
    <p>Defne Çocuk ve Aile olarak çocuklarımızın ve ailelerimizin gelişimini desteklemeye devam ediyoruz. Görüşme ve randevu talepleriniz için bizimle iletişime geçebilirsiniz.</p>
    <p>Saygılarımızla,</p>
    <p><strong>Defne Çocuk ve Aile</strong></p>`;

  let lhToken = 0;
  async function renderLhPreview() {
    const token = ++lhToken;
    const preview = $('#lh-preview');
    const assets = await LH.prepare(cfg);
    if (token !== lhToken) return;
    const count = $('#lh-second').checked ? 2 : 1;
    const s = fitScale(preview);
    const frames = [];
    for (let i = 0; i < count; i++) {
      const { page, box } = LH.createPage(cfg, assets, i);
      box.innerHTML = SAMPLE;
      if ($('#lh-guides').checked) page.classList.add('show-guides');
      frames.push(frame(page, s, `${i + 1}. sayfa`));
    }
    preview.replaceChildren(...frames);
  }
  $('#lh-guides').addEventListener('change', renderLhPreview);
  $('#lh-second').addEventListener('change', renderLhPreview);

  $('#lh-reset').addEventListener('click', () => {
    if (!confirm('Antet ayarları orijinal Defne Çocuk ve Aile antetine döndürülsün mü?')) return;
    cfg = LH.defaults();
    cfgChanged(true);
    toast('Antet varsayılana döndürüldü.');
  });
  $('#lh-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'defne-antet-ayarlari.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#lh-import').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      cfg = LH.fromSaved(JSON.parse(await file.text()));
      cfgChanged(true);
      toast('Antet ayarları yüklendi.');
    } catch (err) { toast('Ayar dosyası okunamadı.', true); }
  });

  // ---------- Başlangıç ----------
  applyDocxCss(docState.css);
  editor.innerHTML = docState.html || '';
  applyEditorVars();
  buildForm();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => renderPreview());
})();
