/* Antet (letterhead) modeli ve çizimi.
 * Tüm ölçüler A4 sayfa için CSS pikseli (96 dpi): 794 x 1123 px.
 */
(function () {
  const PAGE_W = 794;
  const PAGE_H = 1123;

  const DEFAULT_CFG = {
    version: 1,
    mode: 'design', // 'design' = düzenlenebilir antet, 'image' = hazır görsel/PDF arka plan
    bgImage: null,
    font: 'Lexend',
    band: { show: true, color: '#85C7BB', height: 42, accentColor: '#C4E4DE', accentHeight: 5 },
    logo: { show: true, src: null, width: 267, top: 79, tint: false, tintColor: '#86C8BC' },
    title: { show: true, text: 'DEFNE ÇOCUK VE AİLE', size: 10.7, spacing: 0.40, color: '#621E30', top: 251 },
    divider: { show: true, color: '#A6D6CD', width: 30, thickness: 2, top: 277 },
    watermark: { show: true, src: null, opacity: 0.16, width: 773, left: 23, top: 566 },
    footer: {
      lineShow: true, lineColor: '#A6D6CD', lineWidth: 477, lineTop: 1003,
      text: '0505 920 56 61\nKONUTKENT 3035. CADDE SUIT TOWERS A BLOK NO 57 ÇANKAYA/ANKARA\nwww.defnecocukveaile.com',
      boldFirst: true, size: 11, lineGap: 19, color: '#621E30', top: 1029
    },
    content: {
      font: 'Lexend', size: 11, lineHeight: 1.5, color: '#222222',
      top: 305, bottom: 150, left: 76, right: 76, topCompact: 90
    },
    laterPages: 'full' // 'full' = her sayfada tam antet, 'compact' = sonraki sayfalarda logo/başlık yok
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function mergeDeep(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (!(k in extra)) continue;
      const bv = base[k], ev = extra[k];
      if (bv && typeof bv === 'object' && !Array.isArray(bv) && ev && typeof ev === 'object') mergeDeep(bv, ev);
      else if (ev === null || typeof ev === typeof bv || bv === null) base[k] = ev;
    }
    return base;
  }

  function defaults() { return clone(DEFAULT_CFG); }
  function fromSaved(saved) { return mergeDeep(defaults(), saved); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fontStack(name) {
    const serif = /times|georgia|garamond/i.test(name);
    return `"${name}", ${serif ? 'Georgia, serif' : 'Arial, Helvetica, sans-serif'}`;
  }

  // Tek renkli logoyu istenen renge boyar (canvas). Sonuç önbelleğe alınır.
  const tintCache = new Map();
  function tintImage(src, color) {
    const key = color + '|' + src.length + '|' + src.slice(-80);
    if (tintCache.has(key)) return tintCache.get(key);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, c.width, c.height);
        try { resolve(c.toDataURL('image/png')); } catch (e) { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
    tintCache.set(key, p);
    return p;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve();
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = src;
    });
  }

  // Antetin ihtiyaç duyduğu görselleri hazırlar.
  async function prepare(cfg) {
    const A = window.DEFNE_ASSETS || {};
    let logo = cfg.logo.src || A.logo;
    if (logo && cfg.logo.tint) logo = await tintImage(logo, cfg.logo.tintColor);
    const watermark = cfg.watermark.src || A.watermark;
    await Promise.all([loadImage(logo), loadImage(watermark), loadImage(cfg.bgImage)]);
    if (document.fonts) {
      try {
        await Promise.all([
          document.fonts.load(`400 16px "${cfg.font}"`),
          document.fonts.load(`700 16px "${cfg.font}"`),
          document.fonts.load(`400 16px "${cfg.content.font}"`),
          document.fonts.load(`700 16px "${cfg.content.font}"`)
        ]);
      } catch (e) { /* yazı tipi yüklenemezse yedek font kullanılır */ }
    }
    return { logo, watermark };
  }

  function layerHTML(cfg, assets, pageIndex) {
    if (cfg.mode === 'image') {
      return cfg.bgImage
        ? `<img class="lh-el" src="${cfg.bgImage}" alt="" style="left:0;top:0;width:${PAGE_W}px;height:${PAGE_H}px">`
        : '';
    }
    const compact = pageIndex > 0 && cfg.laterPages === 'compact';
    const out = [];
    const f = fontStack(cfg.font);
    const w = cfg.watermark;
    if (w.show && assets.watermark) {
      out.push(`<img class="lh-el" src="${assets.watermark}" alt="" style="left:${w.left}px;top:${w.top}px;width:${w.width}px;opacity:${w.opacity}">`);
    }
    const b = cfg.band;
    if (b.show) {
      out.push(`<div class="lh-el" style="left:0;top:0;width:${PAGE_W}px;height:${b.height}px;background:${b.color}"></div>`);
      if (b.accentHeight > 0) out.push(`<div class="lh-el" style="left:0;top:${b.height}px;width:${PAGE_W}px;height:${b.accentHeight}px;background:${b.accentColor}"></div>`);
    }
    if (!compact) {
      const l = cfg.logo;
      if (l.show && assets.logo) {
        out.push(`<img class="lh-el" src="${assets.logo}" alt="" style="left:${(PAGE_W - l.width) / 2}px;top:${l.top}px;width:${l.width}px">`);
      }
      const t = cfg.title;
      if (t.show && t.text.trim()) {
        out.push(`<div class="lh-el lh-text" style="left:0;top:${t.top}px;width:${PAGE_W}px;font-family:${f};font-size:${t.size}px;line-height:${Math.round(t.size * 1.35)}px;letter-spacing:${t.spacing}em;text-indent:${t.spacing}em;color:${t.color}">${esc(t.text)}</div>`);
      }
      const d = cfg.divider;
      if (d.show && d.width > 0) {
        out.push(`<div class="lh-el" style="left:${(PAGE_W - d.width) / 2}px;top:${d.top}px;width:${d.width}px;height:${d.thickness}px;background:${d.color}"></div>`);
      }
    }
    const ft = cfg.footer;
    if (ft.lineShow && ft.lineWidth > 0) {
      out.push(`<div class="lh-el" style="left:${(PAGE_W - ft.lineWidth) / 2}px;top:${ft.lineTop}px;width:${ft.lineWidth}px;height:1px;background:${ft.lineColor}"></div>`);
    }
    const lines = String(ft.text || '').split('\n');
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      const bold = ft.boldFirst && i === 0;
      out.push(`<div class="lh-el lh-text" style="left:0;top:${ft.top + i * ft.lineGap}px;width:${PAGE_W}px;font-family:${f};font-size:${ft.size}px;line-height:${ft.lineGap}px;font-weight:${bold ? 700 : 400};letter-spacing:${bold ? '0.13em' : '0.01em'};color:${ft.color}">${esc(line)}</div>`);
    });
    return out.join('');
  }

  function contentRect(cfg, pageIndex) {
    const c = cfg.content;
    const compact = cfg.mode === 'design' && pageIndex > 0 && cfg.laterPages === 'compact';
    const top = compact ? c.topCompact : c.top;
    return { left: c.left, top, width: PAGE_W - c.left - c.right, height: PAGE_H - top - c.bottom };
  }

  function applyContentStyle(el, cfg) {
    const c = cfg.content;
    el.style.fontFamily = fontStack(c.font);
    el.style.fontSize = (c.size * 4 / 3) + 'px';
    el.style.lineHeight = c.lineHeight;
    el.style.color = c.color;
  }

  // Tek bir antetli sayfa oluşturur, içerik kutusunu döndürür.
  function createPage(cfg, assets, pageIndex) {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `<div class="lh-layer">${layerHTML(cfg, assets, pageIndex)}</div>`;
    const box = document.createElement('div');
    box.className = 'page-content doc-content docx';
    const r = contentRect(cfg, pageIndex);
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    applyContentStyle(box, cfg);
    page.appendChild(box);
    return { page, box };
  }

  window.Letterhead = { PAGE_W, PAGE_H, defaults, fromSaved, prepare, createPage, contentRect, applyContentStyle, fontStack, esc };
})();
