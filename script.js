(function () {
  const $ = id => document.getElementById(id);
  const v = id => { const el = $(id); if (!el) return 0; const x = parseFloat(String(el.value).replace(',', '.')); return isNaN(x) || x < 0 ? 0 : x; };
  const eur = n => Math.round(n).toLocaleString('fr-FR') + ' €';
  const pct = n => (n * 100).toFixed(1).replace('.', ',') + ' %';

  // Données issues du fichier Excel (à vérifier chaque année)
  // Paramètres fiscaux de départ (modifiables dans la section « Paramètres fiscaux »)
  const KM_DEF = { 3: [0.529, 0.316, 1065, 0.37], 4: [0.606, 0.34, 1330, 0.407], 5: [0.636, 0.357, 1395, 0.427], 6: [0.665, 0.374, 1457, 0.447], 7: [0.697, 0.394, 1515, 0.47] };
  const TR_DEF = [[0, 0], [11497, 0.11], [29315, 0.30], [83823, 0.41], [180294, 0.45]];
  const PARAM_DEF = { p_repas_foyer: 5.45, p_abat_taux: 0.10, p_abat_min: 504, p_abat_max: 14171, p_micro: 15000, p_col: 61, p_lyc: 153, p_plaf_garde: 3500, p_taux_garde: 0.5 };
  Object.keys(KM_DEF).forEach(cv => KM_DEF[cv].forEach((x, j) => { PARAM_DEF['p_km_' + cv + '_' + 'abcd'[j]] = x; }));
  TR_DEF.forEach((t, i) => { PARAM_DEF['p_seuil_' + i] = t[0]; PARAM_DEF['p_taux_' + i] = t[1]; });
  const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const MENS = {
    mut: [43.99, 43.99, 69.16, 43.99, 44.21, 43.99, 43.99, 43.53, 64.23, 44.6, 44.06, 44.06],
    tr:  [0, 110.86, 0, 120.5, 86.76, 67.48, 0, 125.32, 96.4, 0, 216.9, 0],
    syn: Array(12).fill(10.67),
    pen: [300, 300, 300, 300, 355.4, 355.4, 355.4, 355.4, 355.4, 0, 300, 300]
  };
  const LOYERS = [['Logement 1', 860, 12, 2462], ['Logement 2', 850, 12, 1231], ['Logement 3', 650, 11, 1161]];

  const DEF = {
    annee: 2026, situation: 'celibataire', parent_isole: false, nb_enfants: 0, nb_moins6: 0, frais_garde: 0, nb_college: 0, nb_lycee: 0,
    salaire: 0, pension_recue: 0, chomage: 0, autres_revenus: 0,
    jtl: 19, ca: 11, feries: 0,
    cv: '5', dist: 20, trajets: 2,
    mode_frais: 'auto', repas_prix: '', repas_emp: 0, tele_jours: 89, tele_taux: 2.7, autres_pro: 0,
    tr_decl: false, tr_part: 100, regime: 'reel', om_montant: 349500, om_quote: 10, om_taux: 18, jours_travailles: ''
  };
  MENS.mut.forEach((_, i) => { DEF['mut_' + i] = MENS.mut[i]; DEF['tr_' + i] = MENS.tr[i]; DEF['syn_' + i] = MENS.syn[i]; DEF['pen_' + i] = MENS.pen[i]; });
  Object.assign(DEF, PARAM_DEF);
  LOYERS.forEach((l, i) => { DEF['ln_' + i] = l[0]; DEF['ll_' + i] = l[1]; DEF['lm_' + i] = l[2]; DEF['lc_' + i] = l[3]; });

  function buildTables() {
    $('mois_body').innerHTML = MOIS.map((m, i) =>
      `<tr><th>${m}</th>` +
      ['mut', 'tr', 'syn', 'pen'].map(k => `<td><input type="number" step="0.01" min="0" id="${k}_${i}"></td>`).join('') +
      `</tr>`).join('');
    $('loyer_body').innerHTML = LOYERS.map((_, i) =>
      `<tr><td><input type="text" id="ln_${i}" style="text-align:left;min-width:120px"></td>` +
      `<td><input type="number" step="0.01" min="0" id="ll_${i}"></td>` +
      `<td><input type="number" min="0" max="12" id="lm_${i}"></td>` +
      `<td><input type="number" step="0.01" min="0" id="lc_${i}"></td></tr>`).join('');
  }

  function joursOuvres(y) {
    let n = 0; const d = new Date(y, 0, 1); const F = feriesMap(y);
    while (d.getFullYear() === y) { const w = d.getDay(); if (w !== 0 && w !== 6 && !F[iso(d)]) n++; d.setDate(d.getDate() + 1); }
    return n;
  }

  function fraisKm(cv, km) {
    const a = v('p_km_' + cv + '_a'), b = v('p_km_' + cv + '_b'), c = v('p_km_' + cv + '_c'), e = v('p_km_' + cv + '_d');
    if (km <= 5000) return km * a;
    if (km <= 20000) return km * b + c;
    return km * e;
  }

  function impotBrut(qf) {
    let impot = 0, marg = 0;
    const seuils = [0, 1, 2, 3, 4].map(i => [v('p_seuil_' + i), v('p_taux_' + i)]);
    seuils.forEach(([bas, taux], i) => {
      const haut = i + 1 < seuils.length ? seuils[i + 1][0] : Infinity;
      if (qf > bas) { impot += (Math.min(qf, haut) - bas) * taux; marg = taux; }
    });
    return { impot, marg };
  }

  // ===== Calendrier des jours travaillés =====
  let calM = new Date().getMonth();
  function paques(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addJours(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function feriesMap(y) {
    const F = {};
    [[1, 1, "Jour de l'An"], [1, 5, 'Fête du Travail'], [8, 5, 'Victoire 1945'], [14, 7, 'Fête nationale'], [15, 8, 'Assomption'], [1, 11, 'Toussaint'], [11, 11, 'Armistice 1918'], [20, 12, "Abolition de l'esclavage"], [25, 12, 'Noël']]
      .forEach(([j, m, n]) => { F[iso(new Date(y, m - 1, j))] = n; });
    const p = paques(y);
    F[iso(addJours(p, 1))] = 'Lundi de Pâques';
    F[iso(addJours(p, 39))] = 'Ascension';
    F[iso(addJours(p, 50))] = 'Lundi de Pentecôte';
    return F;
  }
  function workedSet() { return new Set(($('jours_travailles').value || '').split(',').filter(Boolean)); }
  function saveWorked(W) { $('jours_travailles').value = [...W].sort().join(','); }
  function workedCount(y) { return [...workedSet()].filter(k => k.startsWith(y + '-')).length; }
  function renderCal() {
    const y = v('annee') || 2026, F = feriesMap(y), W = workedSet();
    $('cal_title').textContent = MOIS[calM] + ' ' + y;
    const offset = (new Date(y, calM, 1).getDay() + 6) % 7;
    const last = new Date(y, calM + 1, 0).getDate();
    let html = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<div class="dow">${x}</div>`).join('');
    for (let i = 0; i < offset; i++) html += '<div></div>';
    for (let dd = 1; dd <= last; dd++) {
      const d = new Date(y, calM, dd), k = iso(d), w = d.getDay();
      if (F[k]) html += `<button class="hol" disabled title="${F[k]}">${dd}</button>`;
      else html += `<button class="${W.has(k) ? 'on' : ''}" data-iso="${k}">${dd}</button>`;
    }
    $('cal_grid').innerHTML = html;
    $('feries_body').innerHTML = Object.keys(F).sort().map(k => {
      const [yy, mm, dd] = k.split('-').map(Number);
      return `<tr><td>${F[k]}</td><td>${new Date(yy, mm - 1, dd).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</td></tr>`;
    }).join('');
  }
  $('cal_prev').addEventListener('click', () => { calM = Math.max(0, calM - 1); renderCal(); });
  $('cal_next').addEventListener('click', () => { calM = Math.min(11, calM + 1); renderCal(); });
  $('cal_grid').addEventListener('click', e => {
    const b = e.target.closest('button[data-iso]');
    if (!b) return;
    const W = workedSet();
    if (W.has(b.dataset.iso)) W.delete(b.dataset.iso); else W.add(b.dataset.iso);
    saveWorked(W); calcul(); sauve();
  });
  $('cal_all').addEventListener('click', () => {
    const y = v('annee') || 2026, F = feriesMap(y), W = workedSet();
    for (let d = new Date(y, 0, 1); d.getFullYear() === y; d = addJours(d, 1)) {
      const w = d.getDay(); if (w !== 0 && w !== 6 && !F[iso(d)]) W.add(iso(d));
    }
    saveWorked(W); calcul(); sauve();
  });
  $('cal_none').addEventListener('click', () => {
    const y = v('annee') || 2026, W = workedSet();
    [...W].forEach(k => { if (k.startsWith(y + '-')) W.delete(k); });
    saveWorked(W); calcul(); sauve();
  });

  function calcul() {
    const annee = v('annee') || 2026;
    const jours = joursOuvres(annee);
    const travail = workedCount(annee);
    renderCal();
    $('j_ouvres').textContent = jours;
    $('j_travail').textContent = travail;

    const km = v('dist') * v('trajets') * travail;
    const kmMt = fraisKm(parseInt($('cv').value, 10), km);
    $('km_an').textContent = Math.round(km).toLocaleString('fr-FR') + ' km';
    $('km_mt').textContent = eur(kmMt);

    const valeur = v('p_repas_foyer');
    const prix = v('repas_prix'), emp = v('repas_emp');
    const parRepas = prix > 0 ? Math.max(0, prix - valeur - emp) : Math.max(0, valeur - emp);
    const repas = travail * parRepas;
    const tele = v('tele_jours') * v('tele_taux');

    let mut = 0, tr = 0, syn = 0, pen = 0;
    for (let i = 0; i < 12; i++) { mut += v('mut_' + i); tr += v('tr_' + i); syn += v('syn_' + i); pen += v('pen_' + i); }
    $('t_mut').textContent = eur(mut); $('t_tr').textContent = eur(tr);
    $('t_syn').textContent = eur(syn); $('t_pen').textContent = eur(pen);

    const autres = v('autres_pro');
    const frais = kmMt + repas + tele + syn + autres;
    $('frais_detail').textContent = `Km ${eur(kmMt)} · Repas ${eur(repas)} · Télétravail ${eur(tele)} · Syndicat ${eur(syn)} · Autres ${eur(autres)}`;

    const abat = Math.min(Math.max(v('salaire') * v('p_abat_taux'), v('p_abat_min')), v('p_abat_max'));
    const mode = $('mode_frais').value;
    let ded, choix;
    if (mode === 'reels' || (mode === 'auto' && frais > abat)) { ded = frais; choix = 'Frais réels'; }
    else { ded = abat; choix = 'Abattement 10 %'; }
    ded = Math.min(ded, v('salaire'));

    let brutL = 0, chgL = 0;
    for (let i = 0; i < 3; i++) { brutL += v('ll_' + i) * v('lm_' + i); chgL += v('lc_' + i); }
    const microOk = brutL <= v('p_micro');
    const micro = $('regime').value === 'micro' && microOk;
    const foncier = micro ? brutL * 0.7 : brutL - chgL;
    $('loyer_res').textContent = `Loyers bruts ${eur(brutL)} · Charges ${eur(chgL)} · Revenu foncier net ${eur(foncier)}` + (micro ? ' (micro-foncier)' : '');
    $('loyer_alert').innerHTML = (!microOk && $('regime').value === 'micro') ? '<div class="alert">Micro-foncier impossible au-delà de 15 000 € : régime réel appliqué.</div>' : '';

    const trShare = tr * Math.min(v('tr_part'), 100) / 100;
    const decl = $('tr_decl').checked;
    const divers = pen + (decl ? trShare : 0);
    const brut = v('salaire') + v('pension_recue') + v('chomage') + v('autres_revenus') + foncier - ded;
    const net = Math.max(0, brut - divers);

    const n = Math.floor(v('nb_enfants'));
    let parts = (($('situation').value === 'marie') ? 2 : 1) + 0.5 * Math.min(n, 2) + Math.max(0, n - 2);
    if ($('parent_isole').checked && n >= 1) parts += 0.5;
    const qf = net / parts;
    const { impot, marg } = impotBrut(qf);
    const impotTotal = impot * parts;

    const nbM6 = Math.min(Math.floor(v('nb_moins6')), n);
    const garde = Math.min(v('frais_garde'), v('p_plaf_garde') * nbM6) * v('p_taux_garde');
    const scol = v('p_col') * v('nb_college') + v('p_lyc') * v('nb_lycee');
    const om = v('om_montant') * v('om_quote') / 100 * v('om_taux') / 100;
    $('om_res').textContent = `Base retenue : ${eur(v('om_montant') * v('om_quote') / 100)} · Réduction d'impôt : ${eur(om)}`;
    const final = Math.max(0, impotTotal - garde - scol - om);
    const altDiv = pen + (decl ? 0 : trShare), altNet = Math.max(0, brut - altDiv);
    const altImpot = Math.max(0, impotBrut(altNet / parts).impot * parts - garde - scol - om);
    const avecTR = decl ? final : altImpot, sansTR = decl ? altImpot : final;
    $('s_tr_avec').textContent = eur(avecTR);
    $('s_tr_sans').textContent = eur(sansTR);
    $('s_tr_best').textContent = avecTR < sansTR ? 'Déclarer (économie ' + eur(sansTR - avecTR) + ')' : (sansTR < avecTR ? 'Ne pas déclarer (économie ' + eur(avecTR - sansTR) + ')' : 'Indifférent');

    $('s_brut').textContent = eur(v('salaire') + v('pension_recue') + v('chomage') + v('autres_revenus'));
    $('s_ded').textContent = eur(ded);
    $('s_choix').textContent = choix;
    $('s_fon').textContent = eur(foncier);
    $('s_div').textContent = eur(divers);
    $('s_net').textContent = eur(net);
    $('s_parts').textContent = String(parts).replace('.', ',');
    $('s_qf').textContent = eur(qf);
    $('s_impot').textContent = eur(impotTotal);
    $('s_garde').textContent = eur(garde);
    $('s_scol').textContent = eur(scol);
    $('s_om').textContent = eur(om);
    $('s_final').textContent = eur(final);
    $('s_taux').textContent = pct(net > 0 ? final / net : 0);
    $('s_marg').textContent = pct(marg);

    const alerts = [];
    if (v('tele_jours') > travail) alerts.push('Les jours de télétravail dépassent les jours travaillés.');
    if (nbM6 < Math.floor(v('nb_moins6'))) alerts.push('Le nombre d\'enfants de moins de 6 ans dépasse le nombre d\'enfants à charge.');
    if (n === 0 && v('nb_college') + v('nb_lycee') > 0) alerts.push('Des scolarisés sont saisis sans enfant à charge.');
    if (mut > 0) alerts.push('La mutuelle n\'est pas déduite (cas habituel).');
    $('alerts').innerHTML = alerts.map(a => `<div class="alert">${a}</div>`).join('');
  }

  function collecte() {
    const data = {};
    document.querySelectorAll('input[id], select[id]').forEach(el => {
      data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return data;
  }

  function applique(data) {
    Object.keys(data).forEach(k => {
      const el = $(k);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!data[k];
      else el.value = data[k];
    });
  }

  const KEY = 'pre_declaration_v2';
  function sauve() {
    try {
      localStorage.setItem(KEY, JSON.stringify(collecte()));
      $('saved_msg').textContent = 'Sauvegardé à ' + new Date().toLocaleTimeString('fr-FR') + '.';
    } catch (e) { $('saved_msg').textContent = 'Stockage local indisponible : utilisez l\'export JSON.'; }
  }
  function exporte() {
    const blob = new Blob([JSON.stringify(collecte(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pre-declaration-' + (v('annee') || 2026) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function reinitialise() {
    if (!confirm('Revenir aux valeurs de départ ?')) return;
    applique(Object.fromEntries(Object.entries(DEF).filter(([k]) => !(k in PARAM_DEF))));
    try { localStorage.removeItem(KEY); } catch (e) {}
    $('saved_msg').textContent = 'Valeurs de départ rétablies.';
    calcul();
  }

  let current = 'foyer';
  function showTab(t) {
    current = t;
    document.querySelectorAll('[data-tab]').forEach(s => { s.hidden = s.dataset.tab !== t; });
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.target === t));
    document.querySelector('.layout').classList.toggle('solo', t === 'synthese');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.target)));
  document.addEventListener('input', () => { calcul(); sauve(); });
  document.addEventListener('change', () => { calcul(); sauve(); });
  $('btn_params').addEventListener('click', () => { applique(PARAM_DEF); $('saved_msg').textContent = 'Paramètres fiscaux rétablis.'; calcul(); sauve(); });
  $('btn_save').addEventListener('click', sauve);
  $('btn_export').addEventListener('click', exporte);
  $('btn_print').addEventListener('click', () => { document.querySelectorAll('[data-tab]').forEach(s => { s.hidden = false; }); window.print(); showTab(current); });
  $('btn_reset').addEventListener('click', reinitialise);

  buildTables();
  applique(DEF);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) applique(JSON.parse(raw));
  } catch (e) {}
  showTab('foyer');
  calcul();
})();
