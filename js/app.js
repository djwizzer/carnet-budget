/* Carnet de budget — application. Données stockées sur l'appareil (localStorage),
   sauvegarde optionnelle dans Google Drive ou dans un fichier. */
(function () {
  "use strict";
  const VERSION = "2.0";
  const KEY = "carnet-budget.v2";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const fmt = n => (n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const fmt0 = n => Math.round(n || 0).toLocaleString("fr-FR") + " €";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const r2 = n => Math.round(n * 100) / 100;
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const monthLabel = m => { const [y, mm] = m.split("-"); return `${MOIS[+mm - 1]} ${y}`; };
  const shortMonth = m => { const [y, mm] = m.split("-"); return `${MOIS_C[+mm - 1]} ${y.slice(2)}`; };
  const addMonth = (m, n) => { let [y, mm] = m.split("-").map(Number); mm += n; while (mm < 1) { mm += 12; y--; } while (mm > 12) { mm -= 12; y++; } return `${y}-${String(mm).padStart(2, "0")}`; };
  const dateFR = iso => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const dayTitle = iso => { const d = new Date(iso + "T12:00:00"); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
  const ago = ts => {
    if (!ts) return "jamais"; const s = (Date.now() - ts) / 1000;
    if (s < 60) return "à l'instant"; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`; const d = Math.floor(s / 86400); return d === 1 ? "hier" : `il y a ${d} jours`;
  };

  /* ---------- Catégories et règles ---------- */
  const PALETTE = ["#3E9B5F", "#E07A3F", "#3B7DD8", "#8E5BC9", "#C9A227", "#D9487D", "#2BA3A8", "#D2503C",
    "#6E7FE0", "#A86B3C", "#B5475E", "#8A8F74", "#7C8C96", "#13915F", "#5B7F99", "#9AA39E"];
  const DEFAULT_CATS = [
    ["courses", "Courses", "#3E9B5F", "expense"], ["restaurants", "Restaurants", "#E07A3F", "expense"],
    ["transport", "Transport", "#3B7DD8", "expense"], ["logement", "Logement", "#8E5BC9", "expense"],
    ["factures", "Factures", "#C9A227", "expense"], ["abonnements", "Abonnements", "#D9487D", "expense"],
    ["shopping", "Shopping", "#2BA3A8", "expense"], ["sante", "Santé", "#D2503C", "expense"],
    ["loisirs", "Loisirs", "#6E7FE0", "expense"], ["tabac", "Tabac", "#A86B3C", "expense"],
    ["frais", "Frais bancaires", "#B5475E", "expense"], ["retraits", "Retraits", "#8A8F74", "expense"],
    ["virements", "Virements", "#7C8C96", "expense"], ["autre", "Autre", "#9AA39E", "expense"],
    ["revenus", "Revenus", "#13915F", "income"], ["internes", "Virements internes", "#5B7F99", "internal"]
  ].map(([id, name, color, kind]) => ({ id, name, color, kind, budget: 0 }));
  const PROTECTED = ["autre", "revenus", "internes"];
  const KIND_LABEL = { expense: "Dépense", income: "Revenu", internal: "Interne" };
  const INTERNAL_RE = /LIVRET|EPARGNE|ÉPARGNE|VIREMENT DEPUIS|VIREMENT VERS|\bLDDS?\b|\bLEP\b|\bPEL\b|\bCEL\b|ASSURANCE.?VIE|COMPTE A TERME/;
  const BUILTIN = [
    ["frais", /^\*?FRAIS|INTERETS DEBITEURS|AGIOS|COTISATION (CARTE|OFFRE)|COMMISSION/],
    ["tabac", /TABAC|\bPMU\b|\bFDJ\b|FRANCAISE DES JEUX/],
    ["retraits", /\bRETRAIT|\bDAB\b|\bRET DAB/],
    ["factures", /\bEDF\b|ENGIE|TOTALENERGIES|VEOLIA|SUEZ|ORANGE|\bSFR\b|BOUYGUES|\bFREE\b|SOSH|RED BY|IMPOT|DGFIP|TRESOR PUBLIC|ASSURANCE|MAIF|MACIF|\bAXA\b|MATMUT|\bGMF\b|MUTUELLE|ALLIANZ|GROUPAMA/],
    ["logement", /LOYER|FONCIA|NEXITY|HABITAT|BAILLEUR|SYNDIC|\bOPH\b/],
    ["abonnements", /NETFLIX|SPOTIFY|DEEZER|DISNEY|CANAL\+?|PRIME VIDEO|AMAZON PRIME|APPLE\.COM|ITUNES|YOUTUBE|GOOGLE ?(ONE|PLAY|STORAGE)|ABONNEMENT|BASIC.?FIT|FITNESS|\bOVH|CLAUDE|OPENAI|ANTHROPIC|ICLOUD|CHATGPT/],
    ["loisirs", /STEAM|PLAYSTATION|\bPSN\b|XBOX|NINTENDO|INSTANT.?GAMING|CINEMA|\bCINE|PATHE|\bUGC\b|GAUMONT|TICKETMASTER|FNAC SPECT|BOWLING|LASER|CONCERT|GAMES|SUPERCELL|ANKAMA|BLIZZARD|\bRIOT\b|TWITCH|EPIC ?GAMES/],
    ["shopping", /AMAZON|AMZN|\bFNAC\b|DARTY|\bBOULANGER\b|CDISCOUNT|DECATHLON|IKEA|LEROY|CASTORAMA|\bZARA\b|H ?& ?M|KIABI|PRIMARK|\bACTION\b|ALIEXPRESS|SHEIN|TEMU|VINTED|LEBONCOIN|LDLC|MATERIEL\.NET|PAYPAL ?\*|PRLV SEPA PAYPAL/],
    ["courses", /CARREFOUR|LECLERC|AUCHAN|\bLIDL\b|\bALDI\b|INTERMARCHE|MONOPRIX|FRANPRIX|CASINO|SUPER ?U\b|HYPER ?U\b|U EXPRESS|PICARD|NETTO|GRAND FRAIS|BIOCOOP|\bSPAR\b|COCCINELLE|PROXI|VIVAL/],
    ["restaurants", /MC ?DO|MCDONALD|BURGER|\bKFC\b|UBER ?EATS|DELIVEROO|JUST ?EAT|RESTAU|BOULANG|\bCAFE|STARBUCKS|PIZZ|SUSHI|BRASSERIE|TACOS|KEBAB|SUBWAY|DOMINO|QUICK|MIE CALINE|BRIOCHE DOREE|\bPAUL\b|TGTG|TOO ?GOOD|BUFFALO|HIPPOPOTAMUS|COURTEPAILLE|AU BUREAU|SALOON|CREPERIE|TICKET ?REST|BISTRO|FIVE GUYS/],
    ["transport", /\bSNCF|\bRATP|\bTOTAL\b|ESSO|SHELL|\bBP\b|\bAVIA\b|\bUBER\b|\bBOLT\b|BLABLACAR|PEAGE|AUTOROUTE|VINCI|SANEF|APRR|PARKING|INDIGO|TISSEO|NAVIGO|\bTCL\b|CARBU|STATION|\bTER\b|OUIGO|TRAINLINE/],
    ["sante", /PHARMA|DOCTOLIB|MEDECIN|\bDR\b|DENTISTE|LABO|OPTIC|OPTIQUE|LUNETTE|HOPITAL|CLINIQUE|KINE/],
    ["virements", /\bVIR\b|VIREMENT|LYDIA|PAYLIB|\bWERO\b|PAYPAL|TDF EMIS/]
  ];

  const SAMPLE = [
    ["10-01", "VIR SEPA SALAIRE ENTREPRISE", 2150], ["10-02", "PRLV SEPA FONCIA LOYER OCT", -720], ["10-03", "CARREFOUR MARKET", -64.32],
    ["10-04", "UBER EATS PARIS", -23.9], ["10-05", "PRLV SEPA EDF CLIENTS", -58], ["10-06", "NETFLIX.COM", -13.49],
    ["10-07", "TOTAL ACCESS STATION", -52.1], ["10-09", "LIDL", -41.75], ["10-10", "PRLV FREE MOBILE", -19.99],
    ["10-12", "STEAM PURCHASE", -29.99], ["10-14", "PHARMACIE DU CENTRE", -12.6], ["10-15", "RETRAIT DAB", -40],
    ["10-17", "AMAZON PAYMENTS", -34.99], ["10-19", "BOULANGERIE PAUL", -6.8], ["10-21", "LECLERC DRIVE", -88.4],
    ["10-23", "SNCF INTERNET", -45], ["10-25", "SPOTIFY", -11.12], ["10-27", "MCDONALDS", -14.2], ["10-29", "VIR CAF ALLOCATIONS", 120],
    ["10-30", "VIR Virement vers Livret A", -150],
    ["09-01", "VIR SEPA SALAIRE ENTREPRISE", 2150], ["09-02", "PRLV SEPA FONCIA LOYER SEPT", -720], ["09-06", "NETFLIX.COM", -13.49],
    ["09-08", "CARREFOUR MARKET", -112.5], ["09-10", "PRLV FREE MOBILE", -19.99], ["09-12", "DELIVEROO", -31], ["09-18", "DECATHLON", -59.9],
    ["09-24", "TOTAL ACCESS", -48.3], ["09-25", "SPOTIFY", -11.12], ["09-26", "PRLV SEPA EDF CLIENTS", -58]
  ].map(([md, label, amount], i) => ({ id: "ex" + i, date: "2026-" + md, label, amount }));

  /* ---------- État ---------- */
  function defaults() {
    return {
      version: 2, tx: [], categories: DEFAULT_CATS.map(c => ({ ...c })), rules: [], learned: {}, balances: {},
      settings: { theme: "auto", autoBackup: true, driveClientId: "", pinHash: "", pinSalt: "" },
      sample: false, updatedAt: 0, lastBackup: 0, lastFileBackup: 0, backupPending: false, imports: []
    };
  }
  function normalize(s) {
    const d = defaults();
    s = Object.assign(d, s); s.settings = Object.assign(defaults().settings, s.settings || {});
    s.tx = (s.tx || []).filter(t => t && t.date && typeof t.amount === "number");
    if (!Array.isArray(s.categories) || !s.categories.length) s.categories = DEFAULT_CATS.map(c => ({ ...c }));
    for (const p of PROTECTED) if (!s.categories.find(c => c.id === p)) s.categories.push({ ...DEFAULT_CATS.find(c => c.id === p) });
    return s;
  }
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (s && s.version === 2) return normalize(s);
    const d = defaults();
    let old = null; try { old = JSON.parse(localStorage.getItem("budget.v1")); } catch (e) {}
    if (old && Array.isArray(old.tx) && !old.sample && old.tx.length) {
      const byName = n => (d.categories.find(c => c.name === n) || {}).id;
      d.tx = old.tx.map(t => ({ id: t.id || uid(), date: t.date, label: t.label, amount: t.amount, cat: t.cat ? byName(t.cat) : undefined }));
      for (const [n, b] of Object.entries(old.budgets || {})) { const c = d.categories.find(c => c.name === n); if (c) c.budget = b; }
      for (const [k, n] of Object.entries(old.learned || {})) { const id = byName(n); if (id) d.learned[k] = id; }
    } else {
      d.tx = SAMPLE.map(t => ({ ...t })); d.sample = true;
      d.categories.find(c => c.id === "courses").budget = 250;
      d.categories.find(c => c.id === "restaurants").budget = 80;
      d.categories.find(c => c.id === "loisirs").budget = 40;
    }
    return d;
  }
  let state = load();
  let catMap = {};
  const rebuildCats = () => { catMap = Object.fromEntries(state.categories.map(c => [c.id, c])); };
  rebuildCats();
  const C = id => catMap[id] || catMap.autre;

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { toast("Impossible d'enregistrer sur l'appareil : le stockage est peut-être plein."); return false; } }
  function save() { state.updatedAt = Date.now(); rebuildCats(); persist(); scheduleBackup(); }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

  /* ---------- Classement ---------- */
  function keyOf(label) {
    return String(label).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\b(CB|CARTE|PRLV|SEPA|PAIEMENT|ACHAT|FACT(URE)?|X\d+|VIR|VIREMENT|INST|M|MME|MR|DE|DU|LA|LE|LES|DES)\b/g, " ")
      .replace(/[^A-Z ]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(w => w.length > 1).slice(0, 2).join(" ");
  }
  const titleCase = s => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, m => m.toUpperCase());
  function catOf(t) {
    if (t.cat && catMap[t.cat]) return t.cat;
    const k = keyOf(t.label);
    if (k && state.learned[k] && catMap[state.learned[k]]) return state.learned[k];
    const L = String(t.label).toUpperCase();
    const Ln = L.normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const r of state.rules) {
      const kw = String(r.kw || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      if (kw && Ln.includes(kw) && catMap[r.cat]) return r.cat;
    }
    if (INTERNAL_RE.test(L) || INTERNAL_RE.test(Ln)) return "internes";
    if (t.amount > 0) return "revenus";
    for (const [id, re] of BUILTIN) if (catMap[id] && re.test(L)) return id;
    return "autre";
  }

  /* ---------- Calculs ---------- */
  const months = () => [...new Set(state.tx.map(t => t.date.slice(0, 7)))].sort();
  function stats(m) {
    const tx = state.tx.filter(t => t.date.startsWith(m));
    let inc = 0, exp = 0, iIn = 0, iOut = 0; const byCat = {};
    for (const t of tx) {
      const c = C(catOf(t));
      if (c.kind === "internal") { if (t.amount > 0) iIn += t.amount; else iOut -= t.amount; }
      else if (c.kind === "income") inc += t.amount;
      else { exp -= t.amount; byCat[c.id] = (byCat[c.id] || 0) - t.amount; }
    }
    return { tx, inc: r2(inc), exp: r2(exp), iIn: r2(iIn), iOut: r2(iOut), byCat };
  }
  function lastBalance(m) {
    const end = m + "-31";
    const e = Object.entries(state.balances || {}).filter(([d]) => d <= end).sort((a, b) => b[0].localeCompare(a[0]))[0];
    return e ? { date: e[0], value: e[1] } : null;
  }
  function recurring() {
    const ms = months(); const last = ms.slice(-4); if (last.length < 2) return [];
    const g = {};
    state.tx.filter(t => t.amount < 0 && last.includes(t.date.slice(0, 7)) && C(catOf(t)).kind === "expense").forEach(t => {
      const k = keyOf(t.label); if (!k) return; (g[k] = g[k] || []).push(t);
    });
    return Object.entries(g).map(([k, list]) => {
      const mset = new Set(list.map(t => t.date.slice(0, 7)));
      const amts = list.map(t => -t.amount); const avg = amts.reduce((a, b) => a + b, 0) / amts.length;
      const stable = amts.every(a => Math.abs(a - avg) <= Math.max(2, avg * 0.25));
      return { k, n: mset.size, avg: r2(avg), count: list.length, stable, cat: catOf(list[list.length - 1]), label: list[list.length - 1].label };
    }).filter(r => r.n >= 2 && r.stable && r.count <= r.n + 1).sort((a, b) => b.avg - a.avg);
  }

  /* ---------- Navigation ---------- */
  const VIEWS = { accueil: "Carnet de budget", operations: "Opérations", analyse: "Analyse", reglages: "Réglages" };
  let view = "accueil";
  let month = null;
  const ops = { q: "", cat: "all", type: "all", allMonths: false };
  function currentView() { const h = location.hash.replace("#", ""); return VIEWS[h] ? h : "accueil"; }
  function ensureMonth() {
    const ms = months();
    if (!ms.length) { month = month || todayISO().slice(0, 7); return; }
    if (!month || !ms.includes(month)) month = ms[ms.length - 1];
  }

  function render() {
    view = currentView(); ensureMonth();
    $$(".tabbar a").forEach(a => a.setAttribute("aria-current", a.dataset.tab === view ? "page" : "false"));
    $("#pageTitle").textContent = VIEWS[view];
    const ms = months();
    $("#monthNav").hidden = view === "reglages";
    $("#monthLabel").textContent = monthLabel(month);
    $("#prevM").disabled = !ms.length || month <= ms[0];
    $("#nextM").disabled = !ms.length || month >= ms[ms.length - 1];
    $("#fab").hidden = view !== "operations";
    renderBanners();
    const v = $("#view");
    if (view === "accueil") v.innerHTML = viewHome();
    else if (view === "operations") { v.innerHTML = viewOps(); renderOpsList(); }
    else if (view === "analyse") { v.innerHTML = viewAnalyse(); }
    else v.innerHTML = viewSettings();
  }

  function renderBanners() {
    const b = [];
    if (state.sample) b.push(`<div class="banner"><span>Ce sont des <b>données d'exemple</b>. Importe ton relevé pour commencer.</span><span class="row"><button class="btn btn-sm btn-primary" data-act="import">Importer un relevé</button><button class="btn btn-sm" data-act="clearSample">Effacer l'exemple</button></span></div>`);
    if (state.settings.driveClientId && state.backupPending && !state.sample)
      b.push(`<div class="banner warn"><span>Des changements ne sont pas encore sauvegardés dans Google Drive.</span><button class="btn btn-sm" data-act="driveBackup">Sauvegarder</button></div>`);
    else if (!state.sample && state.tx.length && !state.settings.driveClientId && Date.now() - Math.max(state.lastFileBackup || 0, state.lastBackup || 0) > 30 * 86400000 && view !== "reglages")
      b.push(`<div class="banner warn"><span>Aucune sauvegarde récente. Si tu changes de téléphone, tes données seront perdues.</span><a class="btn btn-sm" href="#reglages" data-act="goBackup">Sauvegarder</a></div>`);
    $("#banners").innerHTML = b.join("");
  }

  /* ---------- Accueil ---------- */
  function donut(list, total) {
    const r = 54, Cc = 2 * Math.PI * r; let off = 0;
    let h = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--soft)" stroke-width="15"/>`;
    if (total > 0) list.forEach(([id, v]) => {
      const len = v / total * Cc;
      h += `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${C(id).color}" stroke-width="15" stroke-dasharray="${Math.max(len - 1.5, .5)} ${Cc}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
      off += len;
    });
    h += `<text x="70" y="64" text-anchor="middle" fill="var(--muted)" font-size="10" font-family="Figtree,sans-serif">dépensé</text>
      <text x="70" y="84" text-anchor="middle" fill="var(--ink)" font-size="17" font-weight="700" font-family="Bricolage Grotesque,sans-serif">${esc(fmt0(total))}</text>`;
    return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Répartition des dépenses : ${esc(fmt(total))}">${h}</svg>`;
  }
  function delta(cur, prev, invert) {
    if (!prev) return "";
    const p = Math.round((cur - prev) / prev * 100); if (!isFinite(p) || p === 0) return `<span class="muted small">= mois précédent</span>`;
    const good = invert ? p < 0 : p > 0;
    return `<span class="small ${good ? "pos" : "neg"}">${p > 0 ? "+" : ""}${p} % vs ${MOIS_C[+addMonth(month, -1).slice(5) - 1]}</span>`;
  }
  function viewHome() {
    const s = stats(month), p = stats(addMonth(month, -1));
    if (!s.tx.length) return `<div class="card empty"><h2>Rien pour ${esc(monthLabel(month))}</h2><p>Importe le relevé de ce mois pour voir où part ton argent.</p><button class="btn btn-primary" data-act="import">Importer un relevé</button></div>`;
    const rest = r2(s.inc - s.exp);
    const list = Object.entries(s.byCat).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
    const budgetOnly = state.categories.filter(c => c.kind === "expense" && c.budget > 0 && !(c.id in s.byCat)).map(c => [c.id, 0]);
    const rows = list.concat(budgetOnly);
    const alerts = state.categories.filter(c => c.kind === "expense" && c.budget > 0).map(c => ({ c, v: s.byCat[c.id] || 0 }))
      .filter(x => x.v > x.c.budget * 0.85).sort((a, b) => b.v / b.c.budget - a.v / a.c.budget);
    const bal = lastBalance(month);
    const isCurrent = month === todayISO().slice(0, 7);
    let pace = "";
    if (isCurrent && s.exp > 0) {
      const d = new Date(), dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      pace = `<p class="small muted">À ce rythme : environ <b class="num">${esc(fmt0(s.exp / d.getDate() * dim))}</b> de dépenses sur le mois.</p>`;
    }
    return `
    <section class="hero">
      <div><div class="lbl">Reste ce mois-ci</div><div class="hero-big ${rest >= 0 ? "pos" : "neg"}">${rest >= 0 ? "+" : ""}${esc(fmt(rest))}</div></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Revenus</span><span class="v pos">${esc(fmt(s.inc))}</span>${delta(s.inc, p.inc, false)}</div>
        <div class="kpi"><span class="lbl">Dépenses</span><span class="v neg">${esc(fmt(s.exp))}</span>${delta(s.exp, p.exp, true)}</div>
      </div>
      ${pace}
      ${bal ? `<p class="small muted">Solde du compte au ${esc(dateFR(bal.date))} : <b class="num" style="color:var(--ink)">${esc(fmt(bal.value))}</b></p>` : ""}
      ${s.iIn || s.iOut ? `<p class="small muted">Virements internes (épargne, entre tes comptes), non comptés : <span class="num">+${esc(fmt(s.iIn))}</span> reçus, <span class="num">−${esc(fmt(s.iOut))}</span> envoyés.</p>` : ""}
    </section>
    ${alerts.length ? `<section class="alerts">${alerts.map(({ c, v }) => {
      const over = v > c.budget;
      return `<div class="alert"><span class="stripe" style="background:${over ? "var(--neg)" : "var(--warn)"}"></span><span style="flex:1"><b>${esc(c.name)}</b> : ${over ? `budget dépassé de <b class="neg num">${esc(fmt(v - c.budget))}</b>` : `<span class="num">${Math.round(v / c.budget * 100)} %</span> du budget utilisé`}</span><span class="badge ${over ? "bad" : "mid"}">${esc(fmt0(v))} / ${esc(fmt0(c.budget))}</span></div>`;
    }).join("")}</section>` : ""}
    <section class="card">
      <div class="sec-head"><h2>Où part ton argent</h2><button class="linkbtn" data-act="budgets">Budgets</button></div>
      <div class="split">
        ${donut(list, s.exp)}
        <div class="cats">${rows.slice(0, 6).map(([id]) => catRow(id, s)).join("")}</div>
      </div>
      ${rows.length > 6 ? `<div class="cats">${rows.slice(6).map(([id]) => catRow(id, s)).join("")}</div>` : ""}
    </section>
    <section>
      <div class="sec-head"><h2>Dernières opérations</h2><a class="linkbtn" href="#operations">Tout voir</a></div>
      <div class="list">${s.tx.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(txRow).join("")}</div>
    </section>`;
  }
  function catRow(id, s) {
    const c = C(id), v = s.byCat[id] || 0, b = c.budget || 0;
    const pct = b ? Math.min(100, v / b * 100) : (s.exp ? v / s.exp * 100 : 0);
    const over = b && v > b, near = b && !over && v > b * 0.85;
    const color = over ? "var(--neg)" : near ? "var(--warn)" : c.color;
    return `<button class="cat" data-act="catDetail" data-id="${esc(id)}">
      <span class="cat-top"><span class="dot" style="background:${c.color}"></span><span class="cat-name">${esc(c.name)}</span><span class="num" style="font-weight:600">${esc(fmt(v))}</span></span>
      <span class="bar"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></span>
      <span class="cat-sub"><span>${b ? (over ? `<span class="neg">Dépassé de ${esc(fmt(v - b))}</span>` : `Reste ${esc(fmt(b - v))}`) : Math.round(s.exp ? v / s.exp * 100 : 0) + " % des dépenses"}</span><span>${b ? "Budget " + esc(fmt0(b)) : ""}</span></span>
    </button>`;
  }
  function txRow(t) {
    const c = C(catOf(t));
    return `<button class="item" data-act="editTx" data-id="${esc(t.id)}">
      <span class="cat-ico" style="background:${c.color}" aria-hidden="true">${esc(c.name.charAt(0))}</span>
      <span class="item-main"><span class="item-title">${esc(t.label)}</span><span class="item-sub">${esc(c.name)} · ${esc(dateFR(t.date).slice(0, 5))}${t.note ? " · " + esc(t.note) : ""}</span></span>
      <span class="item-end ${t.amount > 0 ? "pos" : ""}">${t.amount > 0 ? "+" : ""}${esc(fmt(t.amount))}</span>
    </button>`;
  }

  /* ---------- Opérations ---------- */
  function viewOps() {
    const opts = state.categories.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")).map(c => `<option value="${esc(c.id)}" ${ops.cat === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    return `<section class="ops-tools">
      <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="input" id="opSearch" type="search" placeholder="Rechercher un commerçant, une note, un montant…" value="${esc(ops.q)}" aria-label="Rechercher"></label>
      <div style="display:flex;flex-direction:column;gap:10px">
        <select class="input" id="opCat" aria-label="Catégorie"><option value="all">Toutes catégories</option>${opts}</select>
        <div class="seg" role="group" aria-label="Type">
          <button data-act="opType" data-v="all" aria-pressed="${ops.type === "all"}">Tout</button>
          <button data-act="opType" data-v="out" aria-pressed="${ops.type === "out"}">Sorties</button>
          <button data-act="opType" data-v="in" aria-pressed="${ops.type === "in"}">Entrées</button>
        </div>
      </div>
      <label class="row small muted" style="gap:10px"><span class="switch"><input type="checkbox" id="opAll" ${ops.allMonths ? "checked" : ""}><i></i></span>Chercher dans tous les mois</label>
    </section>
    <div id="opsList" style="display:flex;flex-direction:column;gap:14px"></div>`;
  }
  function filteredOps() {
    const q = ops.q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const qn = parseFloat(q.replace(",", "."));
    return state.tx.filter(t => {
      if (!ops.allMonths && !t.date.startsWith(month)) return false;
      if (ops.cat !== "all" && catOf(t) !== ops.cat) return false;
      if (ops.type === "out" && t.amount >= 0) return false;
      if (ops.type === "in" && t.amount <= 0) return false;
      if (q) {
        const hay = (t.label + " " + (t.note || "") + " " + C(catOf(t)).name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const amtMatch = !isNaN(qn) && /^[\d.,]+$/.test(q) && Math.abs(Math.abs(t.amount) - qn) < 0.01;
        if (!hay.includes(q) && !amtMatch) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || (a.id < b.id ? 1 : -1));
  }
  function renderOpsList() {
    const el = $("#opsList"); if (!el) return;
    const list = filteredOps();
    if (!list.length) { el.innerHTML = `<div class="card empty"><p>Aucune opération ne correspond.</p></div>`; return; }
    const tin = list.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), tout = list.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const groups = {}; list.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
    el.innerHTML = `<p class="small muted">${list.length} opération${list.length > 1 ? "s" : ""} · <span class="pos num">+${esc(fmt(tin))}</span> · <span class="neg num">${esc(fmt(tout))}</span></p>` +
      Object.entries(groups).slice(0, 120).map(([d, ts]) => {
        const tot = ts.reduce((s, t) => s + t.amount, 0);
        return `<div class="daygroup"><div class="day"><span>${esc(dayTitle(d))}${ops.allMonths ? " " + d.slice(0, 4) : ""}</span><span class="num">${tot > 0 ? "+" : ""}${esc(fmt(tot))}</span></div><div class="list">${ts.map(txRow).join("")}</div></div>`;
      }).join("") + (Object.keys(groups).length > 120 ? `<p class="small muted">Affine la recherche pour voir les opérations plus anciennes.</p>` : "");
  }

  /* ---------- Analyse ---------- */
  function niceMax(v) { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function barChart(rows, series, opts = {}) {
    const W = 340, H = 170, L = 40, R = 6, T = 10, B = 22, iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(1, ...rows.flatMap(r => series.map(s => r[s.key] || 0))));
    const step = iw / rows.length, gw = Math.min(step * 0.78, 34), bw = gw / series.length;
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const y = T + ih - ih * i / 4;
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 5}" y="${y + 3}" text-anchor="end">${(max * i / 4) >= 1000 ? Math.round(max * i / 4 / 100) / 10 + "k" : Math.round(max * i / 4)}</text>`;
    }
    rows.forEach((r, i) => {
      const x0 = L + step * i + (step - gw) / 2;
      series.forEach((s, j) => {
        const v = r[s.key] || 0, h = ih * v / max;
        g += `<rect x="${(x0 + j * bw + .5).toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${Math.max(bw - 1, 1).toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="2" fill="${s.color}" opacity="${r.dim ? .45 : 1}"><title>${esc(r.label)} · ${esc(s.name)} : ${esc(fmt(v))}</title></rect>`;
      });
      if (rows.length <= 12 && (rows.length <= 6 || i % 2 === (rows.length - 1) % 2)) g += `<text x="${(L + step * i + step / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" ${r.bold ? 'style="font-weight:700;fill:var(--ink)"' : ""}>${esc(r.label)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "Graphique")}">${g}</svg>`;
  }
  let trendCat = null;
  function viewAnalyse() {
    const ms = months();
    if (!ms.length) return `<div class="card empty"><p>Importe un relevé pour voir tes analyses.</p><button class="btn btn-primary" data-act="import">Importer un relevé</button></div>`;
    const span = []; for (let i = 11; i >= 0; i--) { const m = addMonth(month, -i); if (m >= ms[0]) span.push(m); }
    const S = Object.fromEntries(span.map(m => [m, stats(m)]));
    const rows = span.map(m => ({ label: MOIS_C[+m.slice(5) - 1].replace(".", ""), inc: S[m].inc, exp: S[m].exp, bold: m === month }));
    const tot = span.reduce((a, m) => ({ inc: a.inc + S[m].inc, exp: a.exp + S[m].exp }), { inc: 0, exp: 0 });
    const s = S[month] || stats(month), p = stats(addMonth(month, -1));
    const expCats = state.categories.filter(c => c.kind === "expense");
    if (!trendCat || !catMap[trendCat]) trendCat = (Object.entries(s.byCat).sort((a, b) => b[1] - a[1])[0] || ["courses"])[0];
    const tc = C(trendCat);
    const trows = span.map(m => ({ label: MOIS_C[+m.slice(5) - 1].replace(".", ""), v: S[m].byCat[trendCat] || 0, bold: m === month }));
    const tAvg = trows.length ? trows.reduce((a, r) => a + r.v, 0) / trows.length : 0;
    const allIds = [...new Set([...Object.keys(s.byCat), ...Object.keys(p.byCat)])].sort((a, b) => (s.byCat[b] || 0) - (s.byCat[a] || 0));
    const merch = {}; s.tx.filter(t => t.amount < 0 && C(catOf(t)).kind === "expense" && catOf(t) !== "virements").forEach(t => { const k = keyOf(t.label) || t.label; merch[k] = merch[k] || { v: 0, n: 0, label: t.label }; merch[k].v -= t.amount; merch[k].n++; });
    const top = Object.entries(merch).sort((a, b) => b[1].v - a[1].v).slice(0, 8);
    const rec = recurring();
    const outs = s.tx.filter(t => t.amount < 0 && C(catOf(t)).kind === "expense");
    const biggest = outs.slice().sort((a, b) => a.amount - b.amount)[0];
    const [yy, mm] = month.split("-").map(Number);
    const days = month === todayISO().slice(0, 7) ? new Date().getDate() : new Date(yy, mm, 0).getDate();
    const saveRate = s.inc > 0 ? Math.round((s.inc - s.exp) / s.inc * 100) : null;
    return `
    <section class="card">
      <div class="sec-head"><h2>Revenus et dépenses</h2><span class="small muted">${span.length} mois</span></div>
      ${barChart(rows, [{ key: "inc", name: "Revenus", color: "var(--chart-in)" }, { key: "exp", name: "Dépenses", color: "var(--chart-out)" }], { label: "Revenus et dépenses par mois" })}
      <div class="legend"><span><i class="dot" style="background:var(--chart-in)"></i>Revenus</span><span><i class="dot" style="background:var(--chart-out)"></i>Dépenses</span></div>
      <p class="small muted">Sur la période : <span class="pos num">+${esc(fmt0(tot.inc))}</span> de revenus, <span class="neg num">−${esc(fmt0(tot.exp))}</span> de dépenses, soit <b class="num ${tot.inc - tot.exp >= 0 ? "pos" : "neg"}">${tot.inc - tot.exp >= 0 ? "+" : ""}${esc(fmt0(tot.inc - tot.exp))}</b>. Moyenne mensuelle des dépenses : <b class="num">${esc(fmt0(tot.exp / span.length))}</b>.</p>
    </section>
    <section class="stats">
      <div class="kpi"><span class="lbl">Épargné ce mois</span><span class="v ${saveRate != null && saveRate >= 0 ? "pos" : "neg"}">${saveRate == null ? "—" : saveRate + " %"}</span><span class="small muted">des revenus</span></div>
      <div class="kpi"><span class="lbl">Par jour</span><span class="v">${esc(fmt(s.exp / Math.max(days, 1)))}</span><span class="small muted">en moyenne</span></div>
      <div class="kpi"><span class="lbl">Opérations</span><span class="v">${s.tx.length}</span><span class="small muted">${outs.length} dépenses</span></div>
      <div class="kpi"><span class="lbl">Plus grosse dépense</span><span class="v">${biggest ? esc(fmt0(-biggest.amount)) : "—"}</span><span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${biggest ? esc(biggest.label) : ""}</span></div>
    </section>
    <section class="card">
      <div class="sec-head"><h2>Évolution d'une catégorie</h2></div>
      <select class="input" id="trendCat" aria-label="Catégorie">${expCats.map(c => `<option value="${esc(c.id)}" ${c.id === trendCat ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      ${barChart(trows, [{ key: "v", name: tc.name, color: tc.color }], { label: "Évolution de " + tc.name })}
      <p class="small muted">Moyenne : <b class="num">${esc(fmt0(tAvg))}</b> par mois${tc.budget ? ` · budget <b class="num">${esc(fmt0(tc.budget))}</b>` : ""}.</p>
    </section>
    <section class="card">
      <h2>Comparé à ${esc(monthLabel(addMonth(month, -1)))}</h2>
      ${!p.tx.length ? `<p class="muted small">Pas de relevé importé pour ${esc(monthLabel(addMonth(month, -1)))}. Importe-le pour comparer.</p>` : allIds.length ? `<div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>${esc(MOIS_C[+addMonth(month, -1).slice(5) - 1])}</th><th>${esc(MOIS_C[+month.slice(5) - 1])}</th><th>Écart</th></tr></thead><tbody>
      ${allIds.map(id => { const a = p.byCat[id] || 0, b = s.byCat[id] || 0, d = b - a; return `<tr><td><span class="row" style="gap:8px;flex-wrap:nowrap"><i class="dot" style="background:${C(id).color}"></i>${esc(C(id).name)}</span></td><td>${esc(fmt0(a))}</td><td>${esc(fmt0(b))}</td><td class="${d > 0.5 ? "neg" : d < -0.5 ? "pos" : "muted"}">${d > 0 ? "+" : ""}${esc(fmt0(d))}</td></tr>`; }).join("")}
      </tbody></table></div>` : `<p class="muted small">Pas de dépenses à comparer.</p>`}
    </section>
    <section>
      <h2>Où tu dépenses le plus</h2>
      ${top.length ? `<div class="list">${top.map(([k, m]) => `<div class="item" style="cursor:default"><span class="item-main"><span class="item-title">${esc(titleCase(k))}</span><span class="item-sub">${m.n} achat${m.n > 1 ? "s" : ""}</span></span><span class="item-end">${esc(fmt(m.v))}</span></div>`).join("")}</div>` : `<p class="muted small">Aucune dépense ce mois-ci.</p>`}
    </section>
    <section>
      <div class="sec-head"><h2>Paiements récurrents</h2>${rec.length ? `<span class="small muted num">≈ ${esc(fmt0(rec.reduce((a, r) => a + r.avg, 0)))} / mois</span>` : ""}</div>
      ${rec.length ? `<div class="list">${rec.map(r => `<div class="item" style="cursor:default"><span class="cat-ico" style="background:${C(r.cat).color}" aria-hidden="true">${esc(C(r.cat).name.charAt(0))}</span><span class="item-main"><span class="item-title">${esc(r.label)}</span><span class="item-sub">${esc(C(r.cat).name)} · vu ${r.n} mois</span></span><span class="item-end">${esc(fmt(r.avg))}</span></div>`).join("")}</div>
      <p class="small muted">Abonnements et prélèvements qui reviennent chaque mois avec un montant proche.</p>` : `<p class="muted small">Il faut au moins deux mois de relevés pour repérer tes abonnements et prélèvements.</p>`}
    </section>`;
  }

  /* ---------- Réglages ---------- */
  function viewSettings() {
    const st = state.settings, connected = window.Drive && Drive.connected();
    const realTx = state.sample ? 0 : state.tx.length;
    const cats = state.categories;
    const ruleItems = state.rules.map((r, i) => ({ kind: "rule", i, kw: r.kw, cat: r.cat }))
      .concat(Object.entries(state.learned).map(([k, c]) => ({ kind: "learned", k, kw: k, cat: c })));
    return `
    <section>
      <h2>Importer</h2>
      <div class="card" style="display:flex;flex-direction:column;gap:10px">
        <p class="small muted">Relevé PDF téléchargé depuis ta banque, ou export CSV. Tu peux en choisir plusieurs à la fois. Les doublons sont ignorés.</p>
        <button class="btn btn-primary btn-block" data-act="import">Importer des relevés (PDF ou CSV)</button>
        ${state.imports.length ? `<div class="small muted">Derniers imports :<br>${state.imports.slice(-4).reverse().map(i => `${esc(i.name)} · ${i.n} opérations · ${esc(ago(i.at))}${i.ok === true ? " · totaux vérifiés" : ""}`).join("<br>")}</div>` : ""}
      </div>
    </section>

    <section id="sauvegarde">
      <h2>Sauvegarde</h2>
      <div class="card" style="display:flex;flex-direction:column;gap:12px">
        <div class="row" style="justify-content:space-between"><h3>Google Drive</h3>${st.driveClientId ? (connected ? `<span class="badge ok">Connecté</span>` : `<span class="badge">Non connecté</span>`) : `<span class="badge">À configurer</span>`}</div>
        ${st.driveClientId ? `
          <p class="small muted">Dernière sauvegarde : <b>${esc(ago(state.lastBackup))}</b>${state.backupPending ? ` · <span class="warn">changements en attente</span>` : ""}. Les fichiers sont dans le dossier « Carnet de budget - sauvegardes » de ton Drive, avec une copie par jour sur 30 jours.</p>
          <div class="grid2">
            <button class="btn btn-primary" data-act="driveBackup">${connected ? "Sauvegarder maintenant" : "Se connecter et sauvegarder"}</button>
            <button class="btn" data-act="driveRestore">Restaurer depuis Drive</button>
          </div>
          <label class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="small">Sauvegarde automatique après chaque modification</span><span class="switch"><input type="checkbox" id="autoBackup" ${st.autoBackup ? "checked" : ""}><i></i></span></label>
          <div class="row">${connected ? `<button class="linkbtn" data-act="driveDisconnect">Se déconnecter</button> · ` : ""}<button class="linkbtn" data-act="driveSetup">Modifier l'ID client</button></div>`
          : `<p class="small muted">Sauvegarde automatique dans ton Google Drive. Il faut une configuration unique de 5 minutes côté Google.</p>
          <button class="btn btn-block" data-act="driveSetup">Configurer Google Drive</button>`}
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:12px">
        <h3>Fichier de sauvegarde</h3>
        <p class="small muted">Sans configuration : crée un fichier et choisis Drive dans le menu de partage d'Android pour l'y enregistrer. Dernier fichier : ${esc(ago(state.lastFileBackup))}.</p>
        <div class="grid2">
          <button class="btn btn-primary" data-act="fileBackup">Créer une sauvegarde</button>
          <button class="btn" data-act="fileRestore">Restaurer un fichier</button>
        </div>
        <button class="btn" data-act="exportCsv">Exporter les opérations (CSV, pour Excel)</button>
      </div>
    </section>

    <section>
      <div class="sec-head"><h2>Catégories</h2><button class="linkbtn" data-act="newCat">+ Nouvelle</button></div>
      <div class="list">${["expense", "income", "internal"].flatMap(k => cats.filter(c => c.kind === k)).map(c => `
        <button class="item" data-act="editCat" data-id="${esc(c.id)}">
          <span class="cat-ico" style="background:${c.color}" aria-hidden="true">${esc(c.name.charAt(0))}</span>
          <span class="item-main"><span class="item-title">${esc(c.name)}</span><span class="item-sub">${KIND_LABEL[c.kind]}${c.budget ? " · budget " + esc(fmt0(c.budget)) + " / mois" : ""}</span></span>
          <span class="muted" aria-hidden="true">›</span>
        </button>`).join("")}</div>
      <p class="small muted">Les catégories « Interne » (épargne, virements entre tes comptes) ne comptent ni en revenus ni en dépenses.</p>
    </section>

    <section>
      <div class="sec-head"><h2>Règles de classement</h2><button class="linkbtn" data-act="newRule">+ Nouvelle règle</button></div>
      <p class="small muted">Une règle classe automatiquement toute opération dont le libellé contient un mot. Quand tu changes la catégorie d'une opération, l'appli retient aussi le commerçant.</p>
      ${ruleItems.length ? `<div class="list">${ruleItems.map(r => `
        <div class="item" style="cursor:default">
          <span class="dot" style="background:${C(r.cat).color}"></span>
          <span class="item-main"><span class="item-title">« ${esc(r.kw)} » → ${esc(C(r.cat).name)}</span><span class="item-sub">${r.kind === "rule" ? "Règle" : "Appris"}</span></span>
          <button class="icon-btn" data-act="${r.kind === "rule" ? "delRule" : "delLearned"}" data-id="${esc(r.kind === "rule" ? r.i : r.k)}" aria-label="Supprimer la règle ${esc(r.kw)}">✕</button>
        </div>`).join("")}</div>` : `<p class="small muted">Aucune règle pour l'instant.</p>`}
      ${!state.sample && state.tx.length ? `<button class="btn" data-act="reclassify">Reclasser toutes les opérations</button>` : ""}
    </section>

    <section>
      <h2>Apparence et sécurité</h2>
      <div class="list">
        <div class="set-row"><span class="item-main"><span class="item-title">Thème</span></span>
          <div class="seg" role="group" aria-label="Thème">${[["auto", "Auto"], ["light", "Clair"], ["dark", "Sombre"]].map(([v, l]) => `<button data-act="theme" data-v="${v}" aria-pressed="${st.theme === v}">${l}</button>`).join("")}</div></div>
        <div class="set-row"><span class="item-main"><span class="item-title">Code de verrouillage</span><span class="item-sub">${st.pinHash ? "Activé : l'appli demande ton code à l'ouverture" : "Protège l'accès à l'appli avec un code à 4 chiffres"}</span></span>
          <button class="btn btn-sm" data-act="${st.pinHash ? "removePin" : "setPin"}">${st.pinHash ? "Retirer" : "Activer"}</button></div>
      </div>
    </section>

    <section>
      <h2>Données</h2>
      <div class="card" style="display:flex;flex-direction:column;gap:10px">
        <p class="small muted">${realTx} opération${realTx > 1 ? "s" : ""} sur ${months().length} mois, stockées uniquement sur ce téléphone.</p>
        <div id="wipeZone"><button class="btn btn-danger btn-block" data-act="wipe">Effacer toutes les données</button></div>
      </div>
      <p class="small muted" style="text-align:center">Carnet de budget ${VERSION} · <a href="https://github.com/djwizzer/carnet-budget" target="_blank" rel="noopener">code source</a></p>
    </section>`;
  }

  /* ---------- Feuilles, toasts ---------- */
  let sheetClose = null;
  function openSheet(title, body, foot, onMount, onClose) {
    const sh = $("#sheet");
    sh.innerHTML = `<div class="sheet-back" data-close></div><div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></div>
      <div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ""}</div>`;
    sh.hidden = false; document.body.classList.add("noscroll"); sheetClose = onClose || null;
    if (onMount) onMount(sh);
    const f = sh.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 50);
  }
  function closeSheet() { const sh = $("#sheet"); if (sh.hidden) return; sh.hidden = true; sh.innerHTML = ""; document.body.classList.remove("noscroll"); const c = sheetClose; sheetClose = null; if (c) c(); }
  let toastTimer = null;
  function toast(msg, action, fn, ms = 4500) {
    const t = $("#toast"); t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button id="toastAct">${esc(action)}</button>` : ""}`; t.hidden = false;
    if (action) $("#toastAct").onclick = () => { t.hidden = true; fn(); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  /* ---------- Opération : modifier / ajouter ---------- */
  function catOptions(sel, kinds) {
    return state.categories.filter(c => !kinds || kinds.includes(c.kind)).slice().sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map(c => `<option value="${esc(c.id)}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  }
  function editTx(id) {
    const isNew = !id; const t = isNew ? { id: uid(), date: month === todayISO().slice(0, 7) || !month ? todayISO() : month + "-01", label: "", amount: -0, manual: true } : state.tx.find(x => x.id === id);
    if (!t) return;
    const cur = isNew ? "autre" : catOf(t); const k = keyOf(t.label);
    let kind = t.amount > 0 ? "in" : "out";
    const same = k ? state.tx.filter(x => x.id !== t.id && keyOf(x.label) === k).length : 0;
    openSheet(isNew ? "Nouvelle opération" : "Opération", `
      <div class="seg" role="group" aria-label="Sens"><button data-k="out" aria-pressed="${kind === "out"}">Dépense</button><button data-k="in" aria-pressed="${kind === "in"}">Entrée d'argent</button></div>
      <label class="field"><span>Montant (€)</span><input class="input num" id="eAmt" type="text" inputmode="decimal" value="${t.amount ? esc(String(Math.abs(t.amount)).replace(".", ",")) : ""}" placeholder="0,00" ${isNew ? "autofocus" : ""}></label>
      <label class="field"><span>Libellé</span><input class="input" id="eLabel" value="${esc(t.label)}" placeholder="Ex. Boulangerie"></label>
      <div class="grid2">
        <label class="field"><span>Date</span><input class="input" id="eDate" type="date" value="${esc(t.date)}"></label>
        <label class="field"><span>Catégorie</span><select class="input" id="eCat">${catOptions(cur)}</select></label>
      </div>
      ${!isNew && same ? `<label class="row small" style="gap:10px;flex-wrap:nowrap"><span class="switch"><input type="checkbox" id="eAll" checked><i></i></span><span>Appliquer aussi aux ${same} autre${same > 1 ? "s" : ""} opération${same > 1 ? "s" : ""} « ${esc(titleCase(k))} » et aux prochaines</span></label>` : ""}
      <label class="field"><span>Note</span><input class="input" id="eNote" value="${esc(t.note || "")}" placeholder="Facultatif"></label>
      ${!isNew ? `<p class="small muted">${t.manual ? "Ajoutée à la main" : "Importée du relevé"} · ${esc(dateFR(t.date))} · ${t.amount > 0 ? "+" : ""}${esc(fmt(t.amount))}</p>` : ""}`,
      `${!isNew ? `<button class="btn btn-danger" data-act="delTx" data-id="${esc(t.id)}">Supprimer</button>` : ""}<button class="btn btn-primary" id="eSave">Enregistrer</button>`,
      sh => {
        $$(".seg button", sh).forEach(b => b.onclick = () => { kind = b.dataset.k; $$(".seg button", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); });
        $("#eSave", sh).onclick = () => {
          const v = Parser.parseAmount($("#eAmt", sh).value);
          const label = $("#eLabel", sh).value.trim(); const date = $("#eDate", sh).value;
          if (!v || isNaN(v)) { $("#eAmt", sh).focus(); toast("Indique un montant."); return; }
          if (!label) { $("#eLabel", sh).focus(); toast("Indique un libellé."); return; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast("Indique une date."); return; }
          t.amount = r2((kind === "in" ? 1 : -1) * Math.abs(v)); t.label = label; t.date = date;
          const note = $("#eNote", sh).value.trim(); if (note) t.note = note; else delete t.note;
          const cat = $("#eCat", sh).value; const all = $("#eAll", sh);
          const nk = keyOf(t.label);
          if (all && all.checked && nk) { state.learned[nk] = cat; state.tx.forEach(x => { if (keyOf(x.label) === nk) delete x.cat; }); }
          else if (cat !== cur || isNew) t.cat = cat;
          if (isNew) state.tx.push(t);
          month = date.slice(0, 7);
          save(); closeSheet(); render(); toast(isNew ? "Opération ajoutée" : "Opération enregistrée");
        };
      });
  }
  function delTx(id) {
    const i = state.tx.findIndex(t => t.id === id); if (i < 0) return;
    const [t] = state.tx.splice(i, 1); save(); closeSheet(); render();
    toast("Opération supprimée", "Annuler", () => { state.tx.push(t); save(); render(); });
  }

  /* ---------- Catégories ---------- */
  function catDetail(id) {
    const c = C(id), s = stats(month);
    const tx = s.tx.filter(t => catOf(t) === id).sort((a, b) => b.date.localeCompare(a.date));
    openSheet(c.name, `
      <div class="kpis"><div class="kpi"><span class="lbl">${esc(monthLabel(month))}</span><span class="v">${esc(fmt(s.byCat[id] || 0))}</span></div>
      <div class="kpi"><span class="lbl">Budget mensuel</span><input class="input num" id="bIn" type="text" inputmode="decimal" placeholder="Aucun" value="${c.budget ? esc(String(c.budget).replace(".", ",")) : ""}" aria-label="Budget mensuel en euros"></div></div>
      ${tx.length ? `<div class="list">${tx.slice(0, 30).map(txRow).join("")}</div>` : `<p class="small muted">Aucune opération ce mois-ci.</p>`}`,
      `<button class="btn" data-act="editCat" data-id="${esc(id)}">Modifier la catégorie</button><button class="btn btn-primary" id="bSave">Enregistrer le budget</button>`,
      sh => { $("#bSave", sh).onclick = () => { const v = Parser.parseAmount($("#bIn", sh).value); c.budget = v > 0 ? r2(v) : 0; save(); closeSheet(); render(); toast(c.budget ? `Budget ${c.name} : ${fmt0(c.budget)} / mois` : "Budget retiré"); }; });
  }
  function budgetsSheet() {
    const s = stats(month), exp = state.categories.filter(c => c.kind === "expense");
    const avg = id => { const ms = months().slice(-3); return ms.length ? ms.reduce((a, m) => a + (stats(m).byCat[id] || 0), 0) / ms.length : 0; };
    openSheet("Budgets mensuels", `<p class="small muted">Laisse vide pour ne pas fixer de budget. La moyenne des 3 derniers mois t'aide à choisir.</p>
      <div class="list">${exp.map(c => `<div class="set-row"><span class="dot" style="background:${c.color}"></span><span class="item-main"><span class="item-title">${esc(c.name)}</span><span class="item-sub">Ce mois ${esc(fmt0(s.byCat[c.id] || 0))} · moyenne ${esc(fmt0(avg(c.id)))}</span></span>
        <input class="input num" style="width:96px" data-b="${esc(c.id)}" type="text" inputmode="decimal" placeholder="—" value="${c.budget ? esc(String(c.budget).replace(".", ",")) : ""}" aria-label="Budget ${esc(c.name)}"></div>`).join("")}</div>`,
      `<button class="btn btn-primary" id="bAll">Enregistrer</button>`,
      sh => { $("#bAll", sh).onclick = () => { $$("[data-b]", sh).forEach(i => { const v = Parser.parseAmount(i.value); catMap[i.dataset.b].budget = v > 0 ? r2(v) : 0; }); save(); closeSheet(); render(); toast("Budgets enregistrés"); }; });
  }
  function editCat(id) {
    const isNew = !id; const c = isNew ? { id: "c" + uid(), name: "", color: PALETTE[state.categories.length % PALETTE.length], kind: "expense", budget: 0 } : { ...C(id) };
    const used = isNew ? 0 : state.tx.filter(t => catOf(t) === c.id).length;
    openSheet(isNew ? "Nouvelle catégorie" : "Catégorie", `
      <label class="field"><span>Nom</span><input class="input" id="cName" value="${esc(c.name)}" placeholder="Ex. Animaux" maxlength="30" ${isNew ? "autofocus" : ""}></label>
      <div class="field"><span>Couleur</span><div class="swatches">${PALETTE.map(p => `<button class="swatch" style="background:${p}" data-col="${p}" aria-pressed="${p === c.color}" aria-label="Couleur ${p}"></button>`).join("")}</div></div>
      <div class="field"><span>Type</span><div class="seg" role="group">${["expense", "income", "internal"].map(k => `<button data-kind="${k}" aria-pressed="${c.kind === k}" ${PROTECTED.includes(c.id) && k !== c.kind ? "disabled" : ""}>${KIND_LABEL[k]}</button>`).join("")}</div>
        <span class="small muted" id="kindHelp"></span></div>
      <label class="field" id="cBudgetF"><span>Budget mensuel (€)</span><input class="input num" id="cBudget" type="text" inputmode="decimal" placeholder="Aucun" value="${c.budget ? esc(String(c.budget).replace(".", ",")) : ""}"></label>
      ${!isNew && !PROTECTED.includes(c.id) ? `<div id="delZone"><button class="btn btn-danger btn-block" id="cDel">Supprimer la catégorie</button></div>` : ""}
      ${!isNew && PROTECTED.includes(c.id) ? `<p class="small muted">Cette catégorie est nécessaire à l'appli : tu peux la renommer et changer sa couleur, mais pas la supprimer.</p>` : ""}`,
      `<button class="btn btn-primary" id="cSave">Enregistrer</button>`,
      sh => {
        const help = { expense: "Compte dans les dépenses.", income: "Compte dans les revenus.", internal: "Épargne, virements entre tes comptes : non compté." };
        const upd = () => { $("#kindHelp", sh).textContent = help[c.kind]; $("#cBudgetF", sh).hidden = c.kind !== "expense"; };
        upd();
        $$("[data-col]", sh).forEach(b => b.onclick = () => { c.color = b.dataset.col; $$("[data-col]", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); });
        $$("[data-kind]", sh).forEach(b => b.onclick = () => { c.kind = b.dataset.kind; $$("[data-kind]", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); upd(); });
        $("#cSave", sh).onclick = () => {
          const name = $("#cName", sh).value.trim();
          if (!name) { $("#cName", sh).focus(); toast("Donne un nom à la catégorie."); return; }
          if (state.categories.some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) { toast("Une catégorie porte déjà ce nom."); return; }
          c.name = name; const b = Parser.parseAmount($("#cBudget", sh).value); c.budget = c.kind === "expense" && b > 0 ? r2(b) : 0;
          if (isNew) state.categories.push(c); else Object.assign(catMap[c.id], c);
          save(); closeSheet(); render(); toast(isNew ? "Catégorie créée" : "Catégorie enregistrée");
        };
        const del = $("#cDel", sh);
        if (del) del.onclick = () => {
          $("#delZone", sh).innerHTML = `<div class="confirm"><span>Supprimer « ${esc(c.name)} » ? ${used ? `Ses ${used} opération${used > 1 ? "s iront" : " ira"} dans « Autre ».` : ""}</span><div class="row"><button class="btn btn-danger" id="cDelYes">Supprimer</button><button class="btn" id="cDelNo">Annuler</button></div></div>`;
          $("#cDelNo", sh).onclick = () => { closeSheet(); editCat(c.id); };
          $("#cDelYes", sh).onclick = () => {
            state.categories = state.categories.filter(x => x.id !== c.id);
            state.tx.forEach(t => { if (t.cat === c.id) delete t.cat; });
            for (const k of Object.keys(state.learned)) if (state.learned[k] === c.id) delete state.learned[k];
            state.rules = state.rules.filter(r => r.cat !== c.id);
            save(); closeSheet(); render(); toast("Catégorie supprimée");
          };
        };
      });
  }
  function newRule() {
    openSheet("Nouvelle règle", `
      <label class="field"><span>Si le libellé contient</span><input class="input" id="rKw" placeholder="Ex. CAPORAL" autofocus></label>
      <label class="field"><span>Classer dans</span><select class="input" id="rCat">${catOptions("restaurants")}</select></label>
      <p class="small muted" id="rPreview">Tape un mot pour voir combien d'opérations sont concernées.</p>`,
      `<button class="btn btn-primary" id="rSave">Créer la règle</button>`,
      sh => {
        const kw = $("#rKw", sh);
        kw.oninput = () => { const v = kw.value.trim().toUpperCase(); const n = v ? state.tx.filter(t => t.label.toUpperCase().includes(v)).length : 0; $("#rPreview", sh).textContent = v ? `${n} opération${n > 1 ? "s" : ""} concernée${n > 1 ? "s" : ""}.` : "Tape un mot pour voir combien d'opérations sont concernées."; };
        $("#rSave", sh).onclick = () => {
          const v = kw.value.trim(); if (!v) { kw.focus(); return; }
          state.rules.unshift({ kw: v, cat: $("#rCat", sh).value });
          state.tx.forEach(t => { if (t.label.toUpperCase().includes(v.toUpperCase())) delete t.cat; });
          for (const k of Object.keys(state.learned)) if (k.includes(v.toUpperCase())) delete state.learned[k];
          save(); closeSheet(); render(); toast("Règle créée");
        };
      });
  }

  /* ---------- Import ---------- */
  const sig = t => t.date + "|" + t.amount.toFixed(2) + "|" + String(t.label).toUpperCase().replace(/\s+/g, "").slice(0, 16);
  async function handleImport(files) {
    if (!files.length) return;
    toast("Lecture en cours…", null, null, 60000);
    const results = [];
    for (const f of files) {
      try {
        const isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
        const r = isPdf ? await Parser.readPdf(f) : Parser.parseCSV(await f.text());
        results.push({ name: f.name, ...r });
      } catch (e) { results.push({ name: f.name, error: e.message || String(e), tx: [] }); }
    }
    $("#toast").hidden = true;
    const counts = {}; if (!state.sample) state.tx.forEach(t => { const k = sig(t); counts[k] = (counts[k] || 0) + 1; });
    const items = [];
    results.forEach((r, fi) => r.tx.forEach(t => { const k = sig(t); const dup = counts[k] > 0; if (dup) counts[k]--; items.push({ ...t, id: uid(), fi, dup }); }));
    const fresh = items.filter(i => !i.dup).length;
    const fileCards = results.map(r => r.error ? `<div class="alert"><span class="stripe" style="background:var(--neg)"></span><span><b>${esc(r.name)}</b><br><span class="small">${esc(r.error)}</span></span></div>` :
      `<div class="alert"><span class="stripe" style="background:${r.check ? (r.check.ok ? "var(--accent)" : "var(--warn)") : "var(--line)"}"></span><span style="flex:1;min-width:0"><b>${esc(r.bank || "Relevé")}</b>${r.from ? ` · ${esc(dateFR(r.from))} → ${esc(dateFR(r.to))}` : ""}<br>
       <span class="small">${r.tx.length} opérations${r.check ? (r.check.ok ? ` · <span class="pos">totaux vérifiés : ${esc(fmt(r.check.start))} → ${esc(fmt(r.check.end))}</span>` : ` · <span class="warn">écart de ${esc(fmt(r2(r.check.end - r.check.start - r.check.sum)))} avec les soldes du relevé : vérifie les opérations</span>`) : ""}</span></span></div>`).join("");
    if (!items.length) { openSheet("Import", fileCards + `<p class="small muted">Aucune opération trouvée. Si le relevé vient d'une autre banque, tu peux essayer l'export CSV de ta banque.</p>`, `<button class="btn" data-close>Fermer</button>`); return; }
    openSheet("Vérifier l'import", `${fileCards}
      <p class="small"><b>${fresh}</b> nouvelle${fresh > 1 ? "s" : ""} opération${fresh > 1 ? "s" : ""}${items.length - fresh ? `, ${items.length - fresh} déjà importée${items.length - fresh > 1 ? "s" : ""} (décochée${items.length - fresh > 1 ? "s" : ""})` : ""}. Décoche celles que tu ne veux pas ajouter.</p>
      <div>${items.map((t, i) => `<label class="check-row"><input type="checkbox" data-i="${i}" ${t.dup ? "" : "checked"}><span class="item-main"><span class="item-title">${esc(t.label)}</span><span class="item-sub">${esc(dateFR(t.date))} · ${esc(C(catOf(t)).name)}${t.dup ? " · déjà importée" : ""}</span></span><span class="item-end ${t.amount > 0 ? "pos" : ""}">${t.amount > 0 ? "+" : ""}${esc(fmt(t.amount))}</span></label>`).join("")}</div>`,
      `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="impGo">Ajouter</button>`,
      sh => {
        const upd = () => { const n = $$("[data-i]:checked", sh).length; $("#impGo", sh).textContent = `Ajouter ${n} opération${n > 1 ? "s" : ""}`; $("#impGo", sh).disabled = !n; };
        $$("[data-i]", sh).forEach(c => c.onchange = upd); upd();
        $("#impGo", sh).onclick = () => {
          const chosen = $$("[data-i]:checked", sh).map(c => items[+c.dataset.i]);
          if (state.sample) { state.tx = []; state.sample = false; state.categories.forEach(c => c.budget = 0); }
          chosen.forEach(t => { const { fi, dup, ...clean } = t; state.tx.push(clean); });
          results.forEach(r => { if (!r.error && r.end != null && r.to) state.balances[r.to] = r.end; if (!r.error) state.imports.push({ name: r.bank ? `${r.bank} ${r.from ? dateFR(r.from).slice(3) : ""}` : r.name, n: r.tx.length, at: Date.now(), ok: r.check ? r.check.ok : null }); });
          state.imports = state.imports.slice(-20);
          const ms = chosen.map(t => t.date.slice(0, 7)).sort(); if (ms.length) month = ms[ms.length - 1];
          save(); closeSheet(); location.hash = "#accueil"; render();
          toast(`${chosen.length} opération${chosen.length > 1 ? "s" : ""} ajoutée${chosen.length > 1 ? "s" : ""}`);
        };
      });
  }

  /* ---------- Sauvegarde ---------- */
  function backupJSON() {
    const data = JSON.parse(JSON.stringify(state));
    data.settings = { ...data.settings, pinHash: "", pinSalt: "" };
    return JSON.stringify({ app: "carnet-budget", format: 2, exportedAt: new Date().toISOString(), data });
  }
  function readBackup(text) {
    let o; try { o = JSON.parse(text); } catch (e) { throw new Error("Ce fichier n'est pas une sauvegarde valide."); }
    const d = o && o.app === "carnet-budget" ? o.data : (o && o.tx ? o : null);
    if (!d || !Array.isArray(d.tx)) throw new Error("Ce fichier n'est pas une sauvegarde de Carnet de budget.");
    return { data: d, at: o.exportedAt || null };
  }
  function confirmRestore(b, source) {
    const n = b.data.tx.length;
    openSheet("Restaurer", `<div class="confirm"><span>Remplacer tes données actuelles (${state.sample ? 0 : state.tx.length} opérations) par la sauvegarde ${source}${b.at ? ` du ${esc(new Date(b.at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }))}` : ""} (${n} opérations) ?</span></div>
      <p class="small muted">Ton code de verrouillage et ta connexion Google restent inchangés.</p>`,
      `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="rsGo">Restaurer</button>`,
      sh => { $("#rsGo", sh).onclick = () => {
        const keep = { pinHash: state.settings.pinHash, pinSalt: state.settings.pinSalt, driveClientId: state.settings.driveClientId || b.data.settings?.driveClientId || "" };
        state = normalize(b.data); state.version = 2; Object.assign(state.settings, keep); state.sample = false; state.backupPending = false;
        rebuildCats(); month = null; persist(); applyTheme(); closeSheet(); render(); toast("Données restaurées");
      }; });
  }
  async function fileBackup() {
    const name = `carnet-budget-${todayISO()}.json`;
    const blob = new Blob([backupJSON()], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    const done = () => { state.lastFileBackup = Date.now(); persist(); render(); };
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Sauvegarde Carnet de budget" }); done(); toast("Sauvegarde partagée"); return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); done(); toast("Sauvegarde téléchargée");
  }
  function exportCsv() {
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [["Date", "Libellé", "Montant", "Catégorie", "Type", "Note"].join(";")].concat(
      state.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => { const c = C(catOf(t)); return [dateFR(t.date), q(t.label), String(t.amount).replace(".", ","), q(c.name), KIND_LABEL[c.kind], q(t.note || "")].join(";"); }));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const name = `carnet-budget-operations-${todayISO()}.csv`; const file = new File([blob], name, { type: "text/csv" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  let backupTimer = null, backingUp = false;
  function scheduleBackup() {
    if (state.sample || !state.settings.driveClientId) return;
    state.backupPending = true; persist();
    if (!state.settings.autoBackup || !Drive.connected()) return;
    clearTimeout(backupTimer); backupTimer = setTimeout(() => driveBackup(false), 2500);
  }
  async function driveBackup(interactive) {
    if (backingUp) return;
    if (!state.settings.driveClientId) { driveSetup(); return; }
    backingUp = true;
    try {
      if (!Drive.connected()) { if (!interactive) return; await Drive.connect(state.settings.driveClientId); }
      if (interactive) toast("Sauvegarde dans Google Drive…", null, null, 20000);
      state.lastBackup = await Drive.backup(backupJSON()); state.backupPending = false; persist();
      if (interactive) toast("Sauvegardé dans Google Drive");
      renderBanners(); if (view === "reglages") render();
    } catch (e) {
      if (interactive) toast(e.message || "La sauvegarde Google Drive a échoué.");
      renderBanners();
    } finally { backingUp = false; }
  }
  async function driveRestore() {
    try {
      if (!Drive.connected()) await Drive.connect(state.settings.driveClientId);
      toast("Recherche des sauvegardes…", null, null, 20000);
      const files = await Drive.list(); $("#toast").hidden = true;
      if (!files.length) { toast("Aucune sauvegarde trouvée dans ton Google Drive."); return; }
      openSheet("Restaurer depuis Drive", `<p class="small muted">Choisis la sauvegarde à restaurer.</p><div class="list">${files.map(f => `<button class="item" data-fid="${esc(f.id)}"><span class="item-main"><span class="item-title">${/derniere/.test(f.name) ? "Dernière sauvegarde" : "Copie du " + esc(dateFR(f.name.match(/\d{4}-\d{2}-\d{2}/)[0]))}</span><span class="item-sub">Modifiée le ${esc(new Date(f.modifiedTime).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }))}</span></span><span class="muted">›</span></button>`).join("")}</div>`, "",
        sh => $$("[data-fid]", sh).forEach(b => b.onclick = async () => {
          try { const b2 = readBackup(await Drive.download(b.dataset.fid)); closeSheet(); confirmRestore(b2, "Google Drive"); } catch (e) { toast(e.message); }
        }));
    } catch (e) { toast(e.message || "Restauration impossible."); }
  }
  function driveSetup() {
    const origin = location.origin;
    openSheet("Configurer Google Drive", `
      <p class="small">Google demande que chaque appli ait son propre « ID client ». Tu le crées une seule fois, gratuitement, puis tu le colles ici.</p>
      <details class="guide" ${state.settings.driveClientId ? "" : "open"}><summary>Créer mon ID client (5 minutes)</summary>
        <ol>
          <li>Ouvre <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> avec ton compte Google et crée un projet nommé <code>Carnet de budget</code>.</li>
          <li>Active l'API Drive : <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a> → <b>Activer</b>.</li>
          <li>Va dans <a href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noopener">Écran de consentement OAuth</a> → <b>Commencer</b>. Nom : <code>Carnet de budget</code>, ton e-mail, audience <b>Externe</b>, puis <b>Créer</b>.</li>
          <li>Dans <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noopener">Audience</a> → <b>Utilisateurs test</b> → <b>Ajouter</b> ton adresse Gmail.</li>
          <li>Dans <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Clients</a> → <b>Créer un client</b> → type <b>Application Web</b>. Dans <b>Origines JavaScript autorisées</b>, ajoute <code>${esc(origin)}</code> puis <b>Créer</b>.</li>
          <li>Copie l'<b>ID client</b> (il finit par <code>.apps.googleusercontent.com</code>) et colle-le ci-dessous.</li>
        </ol>
      </details>
      <label class="field"><span>ID client Google</span><input class="input" id="gId" value="${esc(state.settings.driveClientId)}" placeholder="123456789-xxxx.apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
      <p class="small muted">L'appli ne peut voir que les fichiers qu'elle crée elle-même dans ton Drive, rien d'autre.</p>`,
      `${state.settings.driveClientId ? `<button class="btn" id="gRemove">Retirer</button>` : ""}<button class="btn btn-primary" id="gSave">Enregistrer et se connecter</button>`,
      sh => {
        const rm = $("#gRemove", sh); if (rm) rm.onclick = () => { Drive.disconnect(); state.settings.driveClientId = ""; state.backupPending = false; persist(); closeSheet(); render(); toast("Google Drive retiré"); };
        $("#gSave", sh).onclick = async () => {
          const v = $("#gId", sh).value.trim();
          if (!/\.apps\.googleusercontent\.com$/.test(v)) { toast("L'ID client doit finir par .apps.googleusercontent.com"); return; }
          if (v !== state.settings.driveClientId) Drive.disconnect();
          state.settings.driveClientId = v; persist(); closeSheet();
          try { await Drive.connect(v); render(); await driveBackup(true); } catch (e) { render(); toast(e.message); }
        };
      });
  }

  /* ---------- Code de verrouillage ---------- */
  async function hash(pin, salt) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  function pinPad(title, sub, onDone, extra) {
    const L = $("#lock"); let pin = "";
    L.innerHTML = `<h1 style="font-size:1.4rem">${esc(title)}</h1><p class="muted small" id="pinSub">${esc(sub)}</p>
      <div class="pin-dots" id="dots">${"<i></i>".repeat(4)}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join("")}<button class="ghost" data-n="x">${extra ? esc(extra.label) : ""}</button><button data-n="0">0</button><button class="ghost" data-n="del" aria-label="Effacer">⌫</button></div>
      <div id="lockExtra"></div>`;
    L.hidden = false; document.body.classList.add("noscroll");
    const dots = () => $$("#dots i", L).forEach((d, i) => d.classList.toggle("on", i < pin.length));
    const press = async n => {
      if (n === "del") { pin = pin.slice(0, -1); dots(); return; }
      if (n === "x") { if (extra) extra.fn(); return; }
      if (pin.length >= 4) return; pin += n; dots();
      if (pin.length === 4) { const p = pin; const ok = await onDone(p); if (!ok) { pin = ""; const d = $("#dots", L); d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake"); setTimeout(dots, 300); } }
    };
    $$("[data-n]", L).forEach(b => b.onclick = () => press(b.dataset.n));
    L.onkeydown = null;
    document.onkeydown = e => { if (L.hidden) return; if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("del"); };
  }
  function unlockScreen() {
    pinPad("Carnet de budget", "Entre ton code", async p => {
      if (await hash(p, state.settings.pinSalt) === state.settings.pinHash) { $("#lock").hidden = true; $("#lock").innerHTML = ""; document.body.classList.remove("noscroll"); return true; }
      return false;
    }, { label: "Oublié ?", fn: () => {
      $("#lockExtra").innerHTML = `<div class="confirm" style="max-width:320px"><span>Sans le code, la seule solution est d'effacer les données de l'appli. Tu pourras ensuite restaurer une sauvegarde (Google Drive ou fichier).</span><div class="row"><button class="btn btn-danger" id="forgotYes">Tout effacer</button><button class="btn" id="forgotNo">Annuler</button></div></div>`;
      $("#forgotNo").onclick = () => { $("#lockExtra").innerHTML = ""; };
      $("#forgotYes").onclick = () => { const id = state.settings.driveClientId; state = defaults(); state.settings.driveClientId = id; rebuildCats(); persist(); $("#lock").hidden = true; document.body.classList.remove("noscroll"); location.hash = "#reglages"; render(); };
    } });
  }
  function setPin() {
    let first = null;
    pinPad("Choisis un code", "4 chiffres", async p => {
      if (first == null) { first = p; $("#pinSub").textContent = "Confirme ton code"; $$("#dots i").forEach(d => d.classList.remove("on")); return true; }
      if (p !== first) { first = null; $("#pinSub").textContent = "Les codes ne correspondent pas. Recommence."; return false; }
      const salt = uid(); state.settings.pinSalt = salt; state.settings.pinHash = await hash(p, salt); persist();
      $("#lock").hidden = true; document.body.classList.remove("noscroll"); render(); toast("Code de verrouillage activé"); return true;
    }, { label: "Annuler", fn: () => { $("#lock").hidden = true; document.body.classList.remove("noscroll"); } });
  }

  /* ---------- Thème ---------- */
  function applyTheme() {
    const t = state.settings.theme;
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
    const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    $('meta[name="theme-color"]').setAttribute("content", dark ? "#0F1412" : "#F2F4F1");
  }

  /* ---------- Actions ---------- */
  const ACT = {
    import: () => $("#fileImport").click(),
    clearSample: () => { state.tx = []; state.sample = false; state.categories.forEach(c => c.budget = 0); month = null; save(); render(); },
    editTx: el => editTx(el.dataset.id),
    delTx: el => delTx(el.dataset.id),
    catDetail: el => catDetail(el.dataset.id),
    budgets: () => budgetsSheet(),
    editCat: el => { closeSheet(); editCat(el.dataset.id); },
    newCat: () => editCat(null),
    newRule: () => newRule(),
    delRule: el => { state.rules.splice(+el.dataset.id, 1); save(); render(); },
    delLearned: el => { delete state.learned[el.dataset.id]; save(); render(); },
    reclassify: () => { state.tx.forEach(t => delete t.cat); save(); render(); toast("Opérations reclassées selon les règles"); },
    opType: el => { ops.type = el.dataset.v; $$('[data-act="opType"]').forEach(b => b.setAttribute("aria-pressed", b === el)); renderOpsList(); },
    theme: el => { state.settings.theme = el.dataset.v; persist(); applyTheme(); render(); },
    setPin: () => setPin(),
    removePin: () => { state.settings.pinHash = ""; state.settings.pinSalt = ""; persist(); render(); toast("Code retiré"); },
    wipe: () => {
      $("#wipeZone").innerHTML = `<div class="confirm"><span>Effacer toutes les opérations, catégories, règles et budgets de ce téléphone ? Tes sauvegardes Google Drive ne sont pas touchées.</span><div class="row"><button class="btn btn-danger" data-act="wipeYes">Tout effacer</button><button class="btn" data-act="wipeNo">Annuler</button></div></div>`;
    },
    wipeNo: () => render(),
    wipeYes: () => { const keep = { driveClientId: state.settings.driveClientId, theme: state.settings.theme }; state = defaults(); Object.assign(state.settings, keep); rebuildCats(); month = null; persist(); render(); toast("Données effacées"); },
    fileBackup: () => fileBackup(),
    fileRestore: () => $("#fileRestore").click(),
    exportCsv: () => exportCsv(),
    driveSetup: () => driveSetup(),
    driveBackup: () => driveBackup(true),
    driveRestore: () => driveRestore(),
    driveDisconnect: () => { Drive.disconnect(); render(); toast("Déconnecté de Google Drive"); },
    goBackup: () => setTimeout(() => { const s = $("#sauvegarde"); if (s) s.scrollIntoView({ behavior: "smooth" }); }, 60)
  };

  document.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) { closeSheet(); return; }
    const el = e.target.closest("[data-act]"); if (!el) return;
    const fn = ACT[el.dataset.act]; if (fn) { if (el.tagName !== "A") e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
  document.addEventListener("input", e => {
    if (e.target.id === "opSearch") { ops.q = e.target.value; renderOpsList(); }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "opCat") { ops.cat = t.value; renderOpsList(); }
    else if (t.id === "opAll") { ops.allMonths = t.checked; renderOpsList(); }
    else if (t.id === "trendCat") { trendCat = t.value; render(); }
    else if (t.id === "autoBackup") { state.settings.autoBackup = t.checked; persist(); if (t.checked && state.backupPending) driveBackup(false); }
    else if (t.id === "fileImport") { const f = [...t.files]; t.value = ""; handleImport(f); }
    else if (t.id === "fileRestore") { const f = t.files[0]; t.value = ""; if (f) f.text().then(x => confirmRestore(readBackup(x), "du fichier")).catch(err => toast(err.message)); }
  });
  $("#fab").onclick = () => editTx(null);
  $("#prevM").onclick = () => { const ms = months(); const i = ms.indexOf(month); if (i > 0) { month = ms[i - 1]; render(); } };
  $("#nextM").onclick = () => { const ms = months(); const i = ms.indexOf(month); if (i >= 0 && i < ms.length - 1) { month = ms[i + 1]; render(); } };
  window.addEventListener("hashchange", () => { closeSheet(); render(); window.scrollTo(0, 0); });
  window.addEventListener("scroll", () => $("#topbar").classList.toggle("scrolled", window.scrollY > 4), { passive: true });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  window.addEventListener("storage", e => { if (e.key === KEY) { state = load(); rebuildCats(); render(); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.backupPending && state.settings.autoBackup && Drive.connected()) driveBackup(false); });

  /* ---------- Démarrage ---------- */
  applyTheme();
  render();
  if (state.settings.pinHash) unlockScreen();
  if (state.backupPending && state.settings.autoBackup && Drive.connected()) driveBackup(false);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__carnet = { get state() { return state; }, Parser, catOf, stats, recurring, handleImport };
})();
