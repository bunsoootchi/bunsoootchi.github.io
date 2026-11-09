// Liquid glass: the glass bends what's behind it at its rounded edges, like a lens.
// Only Chromium can use an SVG filter inside backdrop-filter; other browsers keep the frosted glass.
(() => {
  const chromium = !!(navigator.userAgentData && navigator.userAgentData.brands.some(b => /Chromium/.test(b.brand)));
  if (!chromium || matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  document.documentElement.classList.add('liquid-glass');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  document.body.appendChild(svg);

  // displacement map: neutral gray in the middle, pixels near the rounded edge pushed inward
  const lensMap = (w, h, r, edge) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    r = Math.min(r, w / 2, h / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // nearest point on the inner rectangle (corners rounded by r)
      const cx = Math.min(Math.max(x + .5, r), w - r), cy = Math.min(Math.max(y + .5, r), h - r);
      let nx = x + .5 - cx, ny = y + .5 - cy; const len = Math.hypot(nx, ny);
      let dist = r - len;                                   // distance from the outer edge (corners)
      if (len === 0) { const e = Math.min(x + .5, w - x - .5, y + .5, h - y - .5); dist = e;
        nx = (x + .5 < w / 2 ? -1 : 1) * (Math.min(x + .5, w - x - .5) === e); ny = (y + .5 < h / 2 ? -1 : 1) * (Math.min(y + .5, h - y - .5) === e); }
      const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      const k = dist < edge ? Math.pow(1 - Math.max(dist, 0) / edge, 2) : 0;
      const i = (y * w + x) * 4;
      d[i] = 128 - nx * k * 127; d[i + 1] = 128 - ny * k * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return c.toDataURL();
  };

  let n = 0;
  const attach = (el, {edge = 22, scale = 40, blur = 3} = {}) => {
    const id = 'lg' + (n++);
    const f = document.createElementNS(NS, 'filter');
    f.setAttribute('id', id); f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('color-interpolation-filters', 'sRGB');
    const im = document.createElementNS(NS, 'feImage'); im.setAttribute('result', 'map'); im.setAttribute('preserveAspectRatio', 'none');
    const dm = document.createElementNS(NS, 'feDisplacementMap');
    dm.setAttribute('in', 'SourceGraphic'); dm.setAttribute('in2', 'map'); dm.setAttribute('scale', scale);
    dm.setAttribute('xChannelSelector', 'R'); dm.setAttribute('yChannelSelector', 'G');
    f.append(im, dm); svg.appendChild(f);
    const build = () => {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      for (const [a, v] of [['x', 0], ['y', 0], ['width', w], ['height', h]]) { f.setAttribute(a, v); im.setAttribute(a, v); }
      im.setAttribute('href', lensMap(w, h, r, edge));
      el.style.backdropFilter = `url(#${id}) blur(${blur}px) saturate(1.4)`;
    };
    build(); new ResizeObserver(build).observe(el);
  };
  document.querySelectorAll('[data-liquid-glass]').forEach(el => attach(el));
})();
