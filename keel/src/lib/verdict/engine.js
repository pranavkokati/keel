/**
 * Keel's local design-QA layer, adapted from the "verdict" project
 * (github.com/pranavkokati/verdict, MIT license, same author as Keel).
 *
 * verdict's own CLI/MCP server renders pages with Playwright + a real
 * headless Chromium — that half genuinely cannot run inside a browser tab
 * or a WebContainer, since it needs to launch an OS-level browser process.
 * But verdict's four check modules (contrast, type-scale, spacing-grid,
 * heading/hierarchy) never touch Playwright at all — they're plain
 * functions operating on `document`/`getComputedStyle`/`getBoundingClientRect`
 * data. verdict's own browser extension (extension/content.js) already
 * proves this: it's "a direct, dependency-free port... copied line-for-line
 * from the TypeScript source... because the check modules... only ever
 * touched `document`, `window.getComputedStyle`, and plain data."
 *
 * VERDICT_ENGINE_SCRIPT below is that same proven port, adapted to run
 * inside a Keel-generated project's own preview (the E2B sandbox iframe or
 * the Instant HTML mode srcDoc iframe) instead of an arbitrary page the
 * extension's user navigates to. It computes a score with zero Playwright,
 * zero server compute, and zero LLM call — see src/lib/verdict/inject.js
 * for how it's wired into a project's preview, and autofix.js for what
 * Keel does with the result before ever spending a token on it.
 */

export const VERDICT_ENGINE_SCRIPT = `
(function () {
  if (window.__keelVerdictRun) return;

  function cssSelector(el) {
    if (el.id) return "#" + el.id;
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      var part = node.tagName.toLowerCase();
      if (node.classList.length) part += "." + Array.from(node.classList).slice(0, 2).join(".");
      var parent = node.parentElement;
      if (parent) {
        var sameTag = Array.from(parent.children).filter(function (c) { return c.tagName === node.tagName; });
        if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function px(value) { var n = parseFloat(value); return Number.isFinite(n) ? n : 0; }

  function extractFromLiveDocument() {
    var elements = [];
    var all = Array.from(document.body.querySelectorAll("*"));
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      var directText = Array.from(el.childNodes).filter(function (n) { return n.nodeType === 3; })
        .map(function (n) { return (n.textContent || "").trim(); }).join(" ").trim();
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      elements.push({
        selector: cssSelector(el), tag: el.tagName.toLowerCase(), text: directText,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        style: {
          color: cs.color, backgroundColor: cs.backgroundColor,
          fontSize: px(cs.fontSize), fontWeight: px(cs.fontWeight) || (cs.fontWeight === "bold" ? 700 : 400),
          marginTop: px(cs.marginTop), marginRight: px(cs.marginRight), marginBottom: px(cs.marginBottom), marginLeft: px(cs.marginLeft),
          paddingTop: px(cs.paddingTop), paddingRight: px(cs.paddingRight), paddingBottom: px(cs.paddingBottom), paddingLeft: px(cs.paddingLeft),
          gap: px(cs.getPropertyValue("gap") || cs.getPropertyValue("row-gap")),
        },
      });
    }
    var headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(function (h) {
      return { level: Number(h.tagName[1]), text: (h.textContent || "").trim().slice(0, 120), selector: cssSelector(h) };
    });
    var landmarks = Array.from(document.querySelectorAll('main, nav, header, footer, aside, [role="main"], [role="navigation"]'))
      .map(function (l) { return { tag: l.tagName.toLowerCase(), selector: cssSelector(l) }; });
    var images = Array.from(document.querySelectorAll("img")).map(function (img) {
      return { selector: cssSelector(img), hasAlt: img.hasAttribute("alt"), alt: img.getAttribute("alt") || "" };
    });
    return { elements: elements, headings: headings, landmarks: landmarks, images: images };
  }

  function parseColor(value) {
    var m = /rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*(?:,\\s*([\\d.]+)\\s*)?\\)/i.exec(value);
    if (!m) return { r: 0, g: 0, b: 0, a: 1 };
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
  }
  function srgbToLinear(c) { var cs = c / 255; return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4); }
  function relativeLuminance(c) { return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b); }
  function contrastRatio(a, b) {
    var la = relativeLuminance(a), lb = relativeLuminance(b);
    var lighter = Math.max(la, lb), darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
  }
  function compositeOver(fg, bg) {
    if (fg.a >= 1) return fg;
    return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h: h, s: s, l: l };
  }
  function hslToRgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: 1 };
  }
  function toHex(c) {
    function h(n) { return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0"); }
    return "#" + h(c.r) + h(c.g) + h(c.b);
  }
  function suggestAccessibleColor(fg, bg, targetRatio) {
    var hsl = rgbToHsl(fg.r, fg.g, fg.b);
    var bgLum = relativeLuminance(bg);
    var darken = bgLum > 0.5;
    for (var steps = 0; steps <= 100; steps++) {
      var l2 = darken ? Math.max(0, hsl.l - steps / 100) : Math.min(1, hsl.l + steps / 100);
      var candidate = hslToRgb(hsl.h, hsl.s, l2);
      if (contrastRatio(candidate, bg) >= targetRatio) return toHex(candidate);
    }
    var black = { r: 0, g: 0, b: 0, a: 1 }, white = { r: 255, g: 255, b: 255, a: 1 };
    if (contrastRatio(black, bg) >= targetRatio) return toHex(black);
    if (contrastRatio(white, bg) >= targetRatio) return toHex(white);
    return null;
  }
  function isLargeText(fontSizePx, fontWeight) {
    if (fontSizePx >= 24) return true;
    if (fontSizePx >= 18.66 && fontWeight >= 700) return true;
    return false;
  }
  function truncate(s, n) { n = n || 40; return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function contains(outer, inner) {
    return outer.x <= inner.x + 0.5 && outer.y <= inner.y + 0.5 &&
      outer.x + outer.width >= inner.x + inner.width - 0.5 && outer.y + outer.height >= inner.y + inner.height - 0.5;
  }
  function findEffectiveBackground(el, all) {
    var candidates = all.filter(function (c) { return contains(c.rect, el.rect) && parseColor(c.style.backgroundColor).a > 0; })
      .sort(function (a, b) { return a.rect.width * a.rect.height - b.rect.width * b.rect.height; });
    if (candidates.length > 0) return parseColor(candidates[0].style.backgroundColor);
    return parseColor("rgb(255,255,255)");
  }

  var AA_NORMAL = 4.5, AA_LARGE = 3.0;

  function runContrastCheck(snapshot) {
    var issues = [];
    var textEls = snapshot.elements.filter(function (e) { return e.text.length > 0; });
    for (var i = 0; i < textEls.length; i++) {
      var el = textEls[i];
      var bg = findEffectiveBackground(el, snapshot.elements);
      if (!bg) continue;
      var fgColor = compositeOver(parseColor(el.style.color), bg);
      var ratio = contrastRatio(fgColor, bg);
      var large = isLargeText(el.style.fontSize, el.style.fontWeight);
      var threshold = large ? AA_LARGE : AA_NORMAL;
      if (ratio < threshold) {
        var fix = suggestAccessibleColor(fgColor, bg, threshold);
        issues.push({
          checkId: "contrast", severity: ratio < threshold * 0.7 ? "error" : "warning",
          message: 'Text "' + truncate(el.text) + '" has ' + ratio.toFixed(2) + ":1 contrast against its background, below the WCAG AA minimum for " + (large ? "large" : "normal") + " text.",
          selector: el.selector, measured: ratio.toFixed(2) + ":1", required: threshold.toFixed(1) + ":1",
          suggestedFix: fix ? "Change text color to " + fix + " to reach " + threshold.toFixed(1) + ":1." : "Increase contrast to at least " + threshold.toFixed(1) + ":1.",
          fixHex: fix,
        });
      }
    }
    return { checkId: "contrast", name: "Color Contrast (WCAG 2.1)", passed: issues.filter(function (i) { return i.severity === "error"; }).length === 0, issues: issues };
  }

  var CANONICAL_STEPS = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 30, 32, 36, 40, 48, 56, 64, 72, 96];
  var MAX_DISTINCT_SIZES = 8;
  function round1(n) { return Math.round(n * 10) / 10; }

  function runTypeScaleCheck(snapshot) {
    var issues = [];
    var sizeToSelectors = new Map();
    for (var i = 0; i < snapshot.elements.length; i++) {
      var el = snapshot.elements[i];
      if (!el.text) continue;
      var size = round1(el.style.fontSize);
      if (size <= 0) continue;
      if (!sizeToSelectors.has(size)) sizeToSelectors.set(size, []);
      sizeToSelectors.get(size).push(el.selector);
    }
    var distinctSizes = Array.from(sizeToSelectors.keys()).sort(function (a, b) { return a - b; });
    var offScale = distinctSizes.filter(function (s) { return !CANONICAL_STEPS.some(function (step) { return Math.abs(step - s) <= 0.75; }); });
    offScale.forEach(function (size) {
      var nearest = CANONICAL_STEPS.reduce(function (a, b) { return Math.abs(b - size) < Math.abs(a - size) ? b : a; });
      var selectors = sizeToSelectors.get(size);
      issues.push({
        checkId: "type-scale", severity: "warning",
        message: "Font-size " + size + "px (" + selectors.length + " element" + (selectors.length > 1 ? "s" : "") + ") doesn't land on a clean type-scale step.",
        selector: selectors[0], measured: size + "px", required: nearest + "px",
        suggestedFix: "Round to " + nearest + "px, the nearest standard type-scale step.",
      });
    });
    if (distinctSizes.length > MAX_DISTINCT_SIZES) {
      issues.push({
        checkId: "type-scale", severity: "warning",
        message: distinctSizes.length + " distinct font sizes are in use (" + distinctSizes.join(", ") + "px). A coherent type system typically uses " + MAX_DISTINCT_SIZES + " or fewer.",
        measured: distinctSizes.length + " sizes", required: "<= " + MAX_DISTINCT_SIZES + " sizes",
        suggestedFix: "Consolidate onto a fixed scale (e.g. 12/14/16/18/24/32/48px).",
      });
    }
    return { checkId: "type-scale", name: "Type Scale Consistency", passed: offScale.length === 0 && distinctSizes.length <= MAX_DISTINCT_SIZES, issues: issues };
  }

  function runSpacingGridCheck(snapshot) {
    var samples = [];
    snapshot.elements.forEach(function (el) {
      var s = el.style;
      [["margin-top", s.marginTop], ["margin-right", s.marginRight], ["margin-bottom", s.marginBottom], ["margin-left", s.marginLeft],
       ["padding-top", s.paddingTop], ["padding-right", s.paddingRight], ["padding-bottom", s.paddingBottom], ["padding-left", s.paddingLeft],
       ["gap", s.gap]].forEach(function (pair) { if (pair[1] > 0) samples.push({ value: pair[1], selector: el.selector, prop: pair[0] }); });
    });
    if (samples.length < 6) return { checkId: "spacing-grid", name: "Spacing Grid Consistency", passed: true, issues: [] };
    function isMultiple(value, unit) { var r = value % unit; return r <= 0.5 || unit - r <= 0.5; }
    var bestUnit = 8, bestFit = -1;
    [8, 4].forEach(function (unit) {
      var fit = samples.filter(function (s) { return isMultiple(s.value, unit); }).length / samples.length;
      if (fit > bestFit) { bestFit = fit; bestUnit = unit; }
    });
    var issues = [];
    var offGrid = samples.filter(function (s) { return !isMultiple(s.value, bestUnit); });
    var grouped = new Map();
    offGrid.forEach(function (s) {
      var key = s.prop + ":" + s.value;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(s);
    });
    grouped.forEach(function (group, key) {
      var parts = key.split(":");
      var prop = parts[0], value = Number(parts[1]);
      var nearest = Math.round(value / bestUnit) * bestUnit;
      issues.push({
        checkId: "spacing-grid", severity: group.length >= 3 ? "warning" : "info",
        message: prop + " of " + value + "px on " + group.length + " element" + (group.length > 1 ? "s" : "") + ' (e.g. "' + group[0].selector + '") isn\'t a multiple of the page\'s ' + bestUnit + "px spacing unit.",
        selector: group[0].selector, measured: value + "px", required: "multiple of " + bestUnit + "px (nearest: " + nearest + "px)",
        suggestedFix: "Change " + prop + " to " + nearest + "px to stay on the " + bestUnit + "px grid.",
      });
    });
    var gridAdherence = 1 - offGrid.length / samples.length;
    return { checkId: "spacing-grid", name: "Spacing Grid Consistency", passed: gridAdherence >= 0.85, issues: issues };
  }

  function runHierarchyCheck(snapshot) {
    var issues = [];
    var headings = snapshot.headings, landmarks = snapshot.landmarks, images = snapshot.images;
    var h1s = headings.filter(function (h) { return h.level === 1; });
    if (h1s.length === 0) issues.push({ checkId: "hierarchy", severity: "error", message: "No <h1> found.", suggestedFix: "Add a single <h1>." });
    else if (h1s.length > 1) issues.push({ checkId: "hierarchy", severity: "warning", message: h1s.length + " <h1> elements found; there should be exactly one.", selector: h1s[1].selector });
    var prevLevel = 0;
    headings.forEach(function (h) {
      if (prevLevel > 0 && h.level > prevLevel + 1) {
        issues.push({ checkId: "hierarchy", severity: "warning", message: "Heading level jumps from h" + prevLevel + " to h" + h.level + ".", selector: h.selector });
      }
      prevLevel = h.level;
    });
    if (!landmarks.some(function (l) { return l.tag === "main"; })) {
      issues.push({ checkId: "hierarchy", severity: "warning", message: "No <main> landmark found.", suggestedFix: "Wrap primary content in <main>." });
    }
    images.filter(function (i) { return !i.hasAlt; }).forEach(function (img) {
      issues.push({ checkId: "hierarchy", severity: "error", message: '<img> at "' + img.selector + '" has no alt attribute.', selector: img.selector });
    });
    return { checkId: "hierarchy", name: "Heading & Landmark Hierarchy", passed: issues.filter(function (i) { return i.severity === "error"; }).length === 0, issues: issues };
  }

  var SEVERITY_WEIGHT = { error: 8, warning: 3, info: 1 };

  function scoreSnapshot(snapshot, threshold) {
    threshold = threshold || 80;
    var checks = [runContrastCheck(snapshot), runTypeScaleCheck(snapshot), runSpacingGridCheck(snapshot), runHierarchyCheck(snapshot)];
    var allIssues = checks.reduce(function (acc, c) { return acc.concat(c.issues); }, []);
    var deduction = 0;
    checks.forEach(function (check) {
      var bySeverity = { error: 0, warning: 0, info: 0 };
      check.issues.forEach(function (issue) { bySeverity[issue.severity]++; });
      ["error", "warning", "info"].forEach(function (sev) {
        var n = bySeverity[sev];
        if (n === 0) return;
        var checkDeduction = 0;
        for (var i = 0; i < n; i++) checkDeduction += SEVERITY_WEIGHT[sev] / Math.sqrt(i + 1);
        deduction += Math.min(checkDeduction, 40);
      });
    });
    var score = Math.max(0, Math.round(100 - deduction));
    return { timestamp: new Date().toISOString(), score: score, passed: score >= threshold, threshold: threshold, checks: checks, issues: allIssues };
  }

  window.__keelVerdictRun = function (threshold) {
    var snapshot = extractFromLiveDocument();
    return scoreSnapshot(snapshot, threshold || 80);
  };
})();
`;

/** Pulls a computable {selector, hex} pair out of every contrast issue Verdict found a real replacement color for. */
export function extractContrastFixes(result) {
  if (!result?.issues) return [];
  return result.issues
    .filter((issue) => issue.checkId === 'contrast' && issue.fixHex && issue.selector)
    .map((issue) => ({ selector: issue.selector, hex: issue.fixHex }));
}

/** Agent-pasteable summary, ported from verdict's src/score/fixList.ts formatFixListForAgent. */
export function formatFixListForAgent(result) {
  const lines = [];
  lines.push(`Verdict design QA: ${result.score}/100 (threshold ${result.threshold}) -- ${result.passed ? 'PASS' : 'FAIL'}.`);
  lines.push('');
  const bySeverity = { error: [], warning: [], info: [] };
  for (const issue of result.issues) bySeverity[issue.severity]?.push(issue);
  for (const sev of ['error', 'warning', 'info']) {
    const issues = bySeverity[sev];
    if (!issues?.length) continue;
    lines.push(`${sev.toUpperCase()} (${issues.length}):`);
    for (const issue of issues) {
      const loc = issue.selector ? ` [${issue.selector}]` : '';
      lines.push(`  - ${issue.message}${loc}`);
      if (issue.suggestedFix) lines.push(`    fix: ${issue.suggestedFix}`);
    }
    lines.push('');
  }
  if (result.issues.length === 0) lines.push('No issues found across contrast, type scale, spacing grid, or heading/landmark hierarchy.');
  return lines.join('\n');
}

export function scoreBadgeTone(score) {
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'good';
  if (score >= 60) return 'warning';
  return 'poor';
}
