/* Carnet de budget — lecture des relevés bancaires (PDF via pdf.js, CSV).
   Aucune donnée ne quitte l'appareil : tout est lu localement. */
(function (root) {
  "use strict";

  const NUM = "(?:\\d{1,3}(?:[ \\u00a0\\u202f.]\\d{3})+|\\d+),\\d{2}";
  const AMT = new RegExp("^([+\\-−])?\\s?(" + NUM + ")\\s?(?:€|EUR|¤)?\\s?([+\\-−])?$");
  const AMT_TAIL = new RegExp("([+\\-−])?\\s?(" + NUM + ")\\s?(?:€|EUR|¤)?\\s?$");
  const DATE = /^(\d{2})[\/.\-](\d{2})(?:[\/.\-](\d{4}|\d{2}))?(?!\d)/;
  const FULLDATE = /^\d{2}[\/.\-]\d{2}[\/.\-](\d{4}|\d{2})$/;
  const STOP = /NOUVEAU SOLDE|ANCIEN SOLDE|SOLDE (AU|CR[EÉ]DITEUR|D[EÉ]BITEUR|EN |FINAL|PR[EÉ]C[EÉ]DENT)|TOTAL DES|MONTANT FRAIS|^TOTAL\b/i;
  const CREDIT_RE = /VIR(EMENT)?\s+(SEPA\s+)?(RECU|DE |EN VOTRE FAVEUR)|SALAIRE|\bPAIE\b|REMISE|REMBOURS|AVOIR|\bCAF\b|DEPOT|FRANCE TRAVAIL|POLE EMPLOI|PRIME D'ACTIVITE/;

  const BANKS = [
    ["BoursoBank", /BOURSO/i], ["Crédit Agricole", /CR[EÉ]DIT AGRICOLE/i], ["LCL", /\bLCL\b/],
    ["Société Générale", /SOCI[EÉ]T[EÉ] G[EÉ]N[EÉ]RALE/i], ["BNP Paribas", /BNP/i], ["Caisse d'Épargne", /CAISSE D.[EÉ]PARGNE/i],
    ["Banque Populaire", /BANQUE POPULAIRE/i], ["La Banque Postale", /BANQUE POSTALE/i], ["Crédit Mutuel", /CR[EÉ]DIT MUTUEL/i],
    ["CIC", /\bCIC\b/], ["Fortuneo", /FORTUNEO/i], ["Hello bank!", /HELLO ?BANK/i], ["Revolut", /REVOLUT/i],
    ["N26", /\bN26\b/], ["Qonto", /QONTO/i], ["Shine", /\bSHINE\b/i], ["Nickel", /\bNICKEL\b/i], ["Monabanq", /MONABANQ/i]
  ];

  const toNum = s => parseFloat(s.replace(/[   .]/g, "").replace(",", "."));
  const r2 = n => Math.round(n * 100) / 100;
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  /* Regroupe les morceaux de texte d'une page en lignes, puis en "tokens" (morceaux proches fusionnés). */
  function toRows(items) {
    const rows = [];
    items.forEach(it => {
      const s = (it.str || "").trim(); if (!s) return;
      let r = rows.find(r => Math.abs(r.y - it.y) < 2.5);
      if (!r) { r = { y: it.y, raw: [] }; rows.push(r); }
      r.raw.push({ s, x: it.x, x2: it.x + (it.width || 0) });
    });
    rows.sort((a, b) => b.y - a.y);
    rows.forEach(r => {
      r.raw.sort((a, b) => a.x - b.x); r.tok = [];
      r.raw.forEach(p => {
        const t = r.tok[r.tok.length - 1];
        if (t && p.x - t.x2 < 3.5) { t.s += (p.x - t.x2 > 0.6 ? " " : "") + p.s; t.x2 = Math.max(t.x2, p.x2); }
        else r.tok.push({ ...p });
      });
      r.tok.forEach(t => t.cx = (t.x + t.x2) / 2);
      r.text = r.tok.map(t => t.s).join(" ").replace(/\s+/g, " ").trim();
    });
    return rows;
  }

  function cleanLabel(l) {
    return l.replace(/^CARTE\s+\d{2}\/\d{2}(\/\d{2,4})?\s+/i, "")
      .replace(/\s*\bCB\s?\*\s?\d{4}\b/gi, "").replace(/\bX{2,}\d{2,4}\b/g, "")
      .replace(/\s+\d$/, "").replace(/\s+/g, " ").trim();
  }

  function parseStatement(pages) {
    const fullText = pages.map(rs => rs.map(r => r.text).join("\n")).join("\n");
    const period = fullText.match(/du\s+(\d{2})[\/.](\d{2})[\/.](20\d{2})\s+au\s+(\d{2})[\/.](\d{2})[\/.](20\d{2})/i);
    const fulls = [...fullText.matchAll(/\b(\d{2})[\/.](\d{2})[\/.](20\d{2})\b/g)];
    const endM = period ? { m: +period[5], y: +period[6] }
      : fulls.length ? { m: +fulls[fulls.length - 1][2], y: +fulls[fulls.length - 1][3] }
      : { m: new Date().getMonth() + 1, y: new Date().getFullYear() };
    const bank = (BANKS.find(([, re]) => re.test(fullText)) || [""])[0];
    const isHeader = r => /\bd.bit\b/i.test(r.text) && /\bcr.dit\b/i.test(r.text);
    const strict = pages.some(rs => rs.some(isHeader));
    const out = []; let cols = null, start = null, end = null;

    const colSign = tok => {
      if (!cols || cols.deb == null || cols.cred == null) return 0;
      const mid = (cols.deb + cols.cred) / 2;
      return (tok.cx > mid) === (cols.cred > cols.deb) ? 1 : -1;
    };

    for (const rows of pages) {
      let inTable = !strict;
      for (const r of rows) {
        if (isHeader(r)) {
          const f = re => { const t = r.tok.find(t => re.test(t.s)); return t ? t.cx : null; };
          cols = { deb: f(/\bd.bit\b/i), cred: f(/\bcr.dit\b/i) }; inTable = true; continue;
        }
        if (!inTable) continue;
        if (STOP.test(r.text)) {
          if (/SOLDE/i.test(r.text)) {
            const am = r.tok.filter(t => AMT.test(t.s));
            if (am.length) {
              const t = am[am.length - 1], m = t.s.match(AMT);
              let sg = colSign(t) || 1;
              if (/D[EÉ]BITEUR/i.test(r.text)) sg = -1;
              if (/CR[EÉ]DITEUR/i.test(r.text)) sg = 1;
              if ((m[1] || m[3]) && /[\-−]/.test(m[1] || m[3])) sg = -1;
              const v = r2(sg * toNum(m[2]));
              if (/ANCIEN|PR[EÉ]C[EÉ]DENT/i.test(r.text) || (!/NOUVEAU|FINAL/i.test(r.text) && out.length === 0 && start == null)) start = v;
              else end = v;
            }
          }
          if (/NOUVEAU|TOTAL|FRAIS/i.test(r.text) && strict) inTable = false;
          continue;
        }
        const first = r.tok[0]; const dm = first && first.s.match(DATE);
        if (!dm) continue;
        if (!strict && /\bdu\b.*\bau\b/i.test(r.text)) continue;
        const toks = r.tok.slice(1);
        const rest = first.s.slice(dm[0].length).trim();
        if (rest) toks.unshift({ ...first, s: rest });
        const cands = toks.filter(t => AMT.test(t.s));
        let val, sign = 0, amtTok = null;
        if (cands.length) {
          if (strict && cols && cols.deb != null && cols.cred != null) {
            const lo = Math.min(cols.deb, cols.cred) - 80;
            amtTok = cands.find(t => t.cx > lo) || cands[cands.length - 1];
            sign = colSign(amtTok);
          } else amtTok = cands[cands.length - 1];
          const m = amtTok.s.match(AMT); val = toNum(m[2]);
          if (m[1] || m[3]) sign = /[\-−]/.test(m[1] || m[3]) ? -1 : 1;
        } else {
          const lastTok = toks[toks.length - 1]; const m = lastTok && lastTok.s.match(AMT_TAIL); if (!m) continue;
          val = toNum(m[2]); if (m[1]) sign = /[\-−]/.test(m[1]) ? -1 : 1;
          lastTok.s = lastTok.s.slice(0, lastTok.s.length - m[0].length).trim();
        }
        let label = toks.filter(t => t !== amtTok && !AMT.test(t.s) && !FULLDATE.test(t.s)).map(t => t.s).join(" ");
        label = cleanLabel(label.replace(/\s\d{2}[\/.]\d{2}[\/.]\d{2,4}$/, ""));
        if (!label || !val) continue;
        if (!sign) sign = CREDIT_RE.test(label.toUpperCase()) ? 1 : -1;
        const d = +dm[1], mo = +dm[2]; if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
        const y = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : (mo > endM.m ? endM.y - 1 : endM.y);
        out.push({ date: iso(y, mo, d), label, amount: r2(sign * val) });
      }
    }
    const sum = r2(out.reduce((s, t) => s + t.amount, 0));
    const check = start != null && end != null ? { start, end, sum, ok: Math.abs(r2(start + sum) - end) < 0.011 } : null;
    const from = period ? iso(+period[3], +period[2], +period[1]) : (out.length ? out.map(t => t.date).sort()[0] : null);
    const to = period ? iso(+period[6], +period[5], +period[4]) : (out.length ? out.map(t => t.date).sort().pop() : null);
    return { tx: out, bank, from, to, start, end, check };
  }

  async function readPdf(file) {
    if (!root.pdfjsLib) throw new Error("Le lecteur PDF n'a pas pu se charger. Vérifie ta connexion internet puis réessaie.");
    const doc = await root.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      pages.push(toRows(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width }))));
    }
    if (pages.flat().map(r => r.text).join("").length < 20)
      throw new Error("Ce PDF ne contient pas de texte lisible (c'est sans doute un scan ou une photo). Télécharge le relevé depuis l'appli ou le site de ta banque.");
    return parseStatement(pages);
  }

  /* ---------- CSV ---------- */
  function csvRows(text, d) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  function parseAmount(s) {
    if (s == null) return NaN;
    s = String(s).trim().replace(/[€\s  ]|EUR/g, "").replace("−", "-");
    if (!s) return NaN;
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc > -1) s = s.replace(",", ".");
    return parseFloat(s);
  }
  function parseDate(s) {
    s = String(s || "").trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return iso(y, +m[2], +m[1]); }
    return null;
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const firstLines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5).join("\n");
    const delim = [";", ",", "\t"].sort((a, b) => firstLines.split(b).length - firstLines.split(a).length)[0];
    const rows = csvRows(text, delim);
    const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
    let hi = rows.slice(0, 20).findIndex(r => r.some(c => /date/.test(norm(c))) && r.some(c => /montant|amount|debit|credit/.test(norm(c))));
    if (hi < 0) throw new Error("Je ne trouve pas les colonnes Date et Montant dans ce fichier CSV.");
    const h = rows[hi].map(norm);
    const find = (...res) => { for (const re of res) { const i = h.findIndex(x => re.test(x)); if (i >= 0) return i; } return -1; };
    const iDate = find(/^dateop/, /^dateoperation/, /^date$/, /^date(?!val)/, /date/);
    const iLabel = find(/^libelle$/, /^label$/, /libelle/, /label/, /description/, /intitule/, /^operation$/, /detail/, /beneficiaire/);
    const iAmt = find(/^montant$/, /^amount$/, /^montant(?!.*solde)/, /amount(?!.*balance)/);
    const iDeb = find(/debit/), iCred = find(/credit/);
    const iBal = find(/accountbalance/, /^solde/, /balance/);
    if (iDate < 0 || (iAmt < 0 && iDeb < 0 && iCred < 0)) throw new Error("Je ne trouve pas les colonnes Date et Montant dans ce fichier CSV.");
    const tx = []; let lastBal = null;
    for (const r of rows.slice(hi + 1)) {
      const date = parseDate(r[iDate]); if (!date) continue;
      let amount;
      if (iAmt >= 0) amount = parseAmount(r[iAmt]);
      else { const d = Math.abs(parseAmount(r[iDeb])) || 0, c = Math.abs(parseAmount(r[iCred])) || 0; amount = c - d; }
      if (!amount || isNaN(amount)) continue;
      const label = cleanLabel(String(iLabel >= 0 ? r[iLabel] : "Opération").replace(/\s+/g, " ").trim()) || "Opération";
      tx.push({ date, label, amount: r2(amount) });
      if (iBal >= 0 && lastBal == null) { const b = parseAmount(r[iBal]); if (!isNaN(b)) lastBal = r2(b); }
    }
    const dates = tx.map(t => t.date).sort();
    return { tx, bank: "", from: dates[0] || null, to: dates[dates.length - 1] || null, start: null, end: lastBal, check: null };
  }

  const api = { toRows, parseStatement, readPdf, parseCSV, cleanLabel, parseAmount, parseDate };
  root.Parser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
