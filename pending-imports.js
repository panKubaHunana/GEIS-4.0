/**
 * GEIS SVOZY - panel "Nove objednavky z e-mailu" (Faze 2)
 * verze 4.3 (28.10.2026) – tlačítko „Potvrdit vše“ (hromadné potvrzení),
 *                          datum objednávky i z createdAt, když chybí p.date
 * verze 4.2 (5.10.2026) – větší písmo, SVG ikony místo emoji
 * verze 4.1 (22.7.2026)
 * ---------------------------------------------------------------------------
 * Tento soubor se NAPOJUJE na existujici index.html appky - vyuziva uz
 * inicializovanou globalni promennou `db` (Firestore), `activeDate`,
 * `localDailyTargets` a Karty zakazniku v localStorage.
 *
 * ZMENY 4.1:
 *  - EMAIL_CUSTOMER_MAP doplnena o VSECH 20 pravidelnych zakazniku
 *    (presna shoda e-mail -> nazev zakaznika, nejspolehlivejsi rozpoznani).
 *  - Fuzzy shoda podle jmena uz vyzaduje shodu na hranici slova - drive se
 *    kratke nazvy (napr. "VOR") trefovaly doprostred jineho jmena.
 *  - Pri potvrzeni se mnozstvi PRICITA k existujicimu cili; nove je u toho
 *    kontrola, ze se stejny navrh nepotvrdi dvakrat (tlacitko se zablokuje).
 */
(function () {
    'use strict';

    // Appka resi tmavy rezim vlastnimi CSS pravidly navazanymi na "body.dark".
    function injectDarkModeStyles() {
        if (document.getElementById('pendingImportsDarkStyles')) return;
        var style = document.createElement('style');
        style.id = 'pendingImportsDarkStyles';
        style.textContent = '' +
            'body.dark #pendingImportsPanel .bg-amber-50 { background-color: #3a2f10; }' +
            'body.dark #pendingImportsPanel .bg-white { background-color: #0f172a; }' +
            'body.dark #pendingImportsPanel .border-amber-400 { border-color: #b8860b; }' +
            'body.dark #pendingImportsPanel .border-amber-200 { border-color: #5c4a1a; }' +
            'body.dark #pendingImportsPanel .text-amber-700 { color: #fbbf24; }' +
            'body.dark #pendingImportsPanel .text-slate-800 { color: #f1f5f9; }' +
            'body.dark #pendingImportsPanel select,' +
            'body.dark #pendingImportsPanel input { background-color: #1e293b; color: #f1f5f9; border-color: #475569; }';
        document.head.appendChild(style);
    }

    var localPendingImports = [];

    function ensurePanelContainer() {
        var el = document.getElementById('pendingImportsPanel');
        if (!el) {
            el = document.createElement('div');
            el.id = 'pendingImportsPanel';
            var tabCounter = document.getElementById('tab-counter');
            if (tabCounter) {
                tabCounter.insertBefore(el, tabCounter.firstChild);
            } else {
                document.body.appendChild(el);
            }
        }
        return el;
    }

    function normalize(s) {
        return (s || '')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim();
    }

    // ======================================================================
    //  PRESNA TABULKA:  e-mail odesilatele  ->  nazev zakaznika v aplikaci
    //  Klice pis vzdy malymi pismeny. Doplnovani = jeden novy radek.
    // ======================================================================
    var EMAIL_CUSTOMER_MAP = {
        'leos.kucera@cyklomax.cz': 'CYKLOMAX',
        'kunart.katarzyna@hobra.cz': 'HOBRA ŠKOLNÍK',
        'paletovyprodej@hradeckapekarna.cz': 'HRADECKÁ PEKÁRNA',
        'zasilky@albi.cz': 'ALBI',
        'jaroslav.prat@hptronic.cz': 'HP TRONIC',
        'marketa.nutricius@email.cz': 'NUTRICIUS',
        'sklad@lpw.cz': 'LPW PRODEJNÍ',
        'expedice@krpa.cz': 'KRPA',
        'h.kralova@gekkon.org': 'GEKKON',
        'volhejn@detecha.cz': 'DETECHA',
        'info@strixhorice.cz': 'STRIX',
        'k.kalenska@itadeco.cz': 'ITADECO',
        'sklad@li-ca.cz': 'LI-CA',
        'malkova@pentaservis.cz': 'PENTA',
        'logistika@shipmall.cz': 'SHIPMALL',
        'lenka.vonkova@lalinea.cz': 'LA LINEA',
        'obchod@fanton.cz': 'FANTON',
        'vankova@abicor.cz': 'ABICOR BINZEL',
        'winter@wiba.cz': 'ČEMAT',
        'baliky@vorcz.cz': 'VOR',
        // starsi/dalsi adresy
        'objednavky@drana.cz': 'DRANA',
        'expedice@fomei.com': 'FOMEI'
    };

    // Zkusi najit zakaznika:
    //  1) presna shoda podle e-mailove adresy (EMAIL_CUSTOMER_MAP)
    //  2) shoda podle jmena odesilatele (na hranici slova)
    //  3) shoda podle domeny e-mailu ("k.kalenska@itadeco.cz" -> ITADECO)
    function fuzzyMatchCustomer(name, email, list) {
        var mail = (email || '').toLowerCase().trim();
        var mapped = EMAIL_CUSTOMER_MAP[mail];
        if (mapped) {
            for (var m = 0; m < list.length; m++) {
                if (normalize(list[m]) === normalize(mapped)) return list[m];
            }
            return mapped; // karta jeste neexistuje - vratime aspon spravny nazev
        }

        var n = normalize(name);
        var domain = ((mail.split('@')[1] || '').split('.')[0]);
        var d = normalize(domain);

        // 2) jmeno odesilatele - musi sedet cele slovo, ne kus uprostred
        for (var i = 0; i < list.length; i++) {
            var c = normalize(list[i]);
            if (!c || !n) continue;
            if (n === c) return list[i];
            if (new RegExp('(^|[^A-Z0-9])' + escapeRe(c) + '([^A-Z0-9]|$)').test(n)) return list[i];
        }
        // 3) domena
        for (var j = 0; j < list.length; j++) {
            var c2 = normalize(list[j]).replace(/[^A-Z0-9]/g, '');
            if (!c2 || !d) continue;
            if (d === c2 || d.indexOf(c2) !== -1 || c2.indexOf(d) !== -1) return list[j];
        }
        return null;
    }

    // v4.3: Na jaký den objednávka patří.
    //  1) p.date (YYYY-MM-DD nebo D.M.YYYY)
    //  2) datum vytvoření návrhu (createdAt – ISO text nebo Firestore Timestamp)
    //  3) teprve nakonec aktuálně zobrazený den v appce
    function pad2(n) { return String(n).padStart(2, '0'); }
    function toLocalYmd(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function resolveOrderDate(p, fallback) {
        var raw = p && p.date;
        if (typeof raw === 'string') {
            var t = raw.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
            var m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
            if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
        }
        var c = p && p.createdAt;
        if (c) {
            var d = null;
            if (typeof c.toDate === 'function') d = c.toDate();
            else if (typeof c === 'string' || typeof c === 'number') d = new Date(c);
            if (d && !isNaN(d.getTime())) return toLocalYmd(d);
        }
        return fallback || '';
    }
    function fmtCz(ymd) {
        var a = String(ymd || '').split('-');
        return a.length === 3 ? (parseInt(a[2], 10) + '. ' + parseInt(a[1], 10) + '. ' + a[0]) : ymd;
    }

    var bulkBusy = false;

    function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function sortAlpha(arr) {
        return arr.slice().sort(function (a, b) { return a.localeCompare(b, 'cs'); });
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // v4.2: jednotné SVG ikony z index.html (window.ic); bez něj prázdný řetězec
    function icon(name, cls) { return (typeof window.ic === 'function') ? window.ic(name, cls) : ''; }

    function renderPendingImports() {
        var el = ensurePanelContainer();

        if (!localPendingImports.length) {
            el.innerHTML = '';
            return;
        }

        // Zakaznici vychazi z Karet zakaznika (sjednoceny seznam).
        var custPickup = sortAlpha(
            JSON.parse(localStorage.getItem('customerCards') || '[]')
                .map(function (c) { return c && c.name ? String(c.name).toUpperCase() : ''; })
                .filter(function (n) { return !!n; })
        );
        var targets = (typeof localDailyTargets !== 'undefined') ? localDailyTargets : [];
        var today = (typeof activeDate !== 'undefined') ? activeDate : '';

        var sorted = localPendingImports.slice().sort(function (a, b) {
            return (a.createdAt || '').localeCompare(b.createdAt || '');
        });

        var html = '' +
            '<div class="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-5 shadow-sm">' +
            '  <h3 class="font-bold text-amber-700 text-sm mb-3 flex items-center gap-1.5">' + icon('inbox', 'w-5 h-5') + ' Nové objednávky z e-mailu (' + sorted.length + ') čekají na potvrzení</h3>' +
            (sorted.length > 1 ?
            '  <button id="pi-confirm-all" type="button" onclick="pendingImportsConfirmAll()" ' + (bulkBusy ? 'disabled ' : '') + 'class="w-full mb-3 bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white text-sm font-bold py-2.5 rounded-lg transition-colors shadow-sm">' +
            (bulkBusy ? 'Ukládám…' : '✓✓ Potvrdit vše (' + sorted.length + ')') + '</button>' : '') +
            '  <div class="space-y-3">';

        sorted.forEach(function (p) {
            var guess = fuzzyMatchCustomer(p.customer, p.sourceEmail, custPickup);
            var rowDate = resolveOrderDate(p, today);
            var existing = guess ? targets.find(function (t) {
                return t.date === rowDate && t.customer === guess.toUpperCase();
            }) : null;

            var options = '<option value="" disabled ' + (guess ? '' : 'selected') + '>Vyberte zákazníka...</option>' +
                custPickup.map(function (c) {
                    return '<option value="' + esc(c) + '" ' + (c === guess ? 'selected' : '') + '>' + esc(c) + '</option>';
                }).join('');

            html += '' +
                '<div id="pi-row-' + esc(p.docId) + '" data-docid="' + esc(p.docId) + '" data-date="' + esc(rowDate) + '" data-review="' + ((p.needsReview || (!p.fp && !p.kh && !p.pk)) ? '1' : '0') + '" class="bg-white rounded-lg border border-amber-200 p-3 space-y-2 shadow-sm">' +
                '  <div class="text-xs text-gray-500">Od: <b>' + esc(p.customer || '-') + '</b> (' + esc(p.sourceEmail || '-') + ') &middot; <b class="text-amber-700">' + esc(fmtCz(rowDate)) + '</b></div>' +
                ((p.needsReview || (!p.fp && !p.kh && !p.pk)) ? '  <div class="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1">' + icon('warning') + ' Množství zkontrolujte ručně – v e-mailu se nepodařilo spolehlivě určit počty (rozpis nesedí se souhrnem nebo chybí číslo). Otevřete tělo e-mailu níže.</div>' : '') +
                (p.sourceSnippet ? '  <div class="text-xs text-gray-400 italic truncate" title="' + esc(p.sourceSnippet) + '">' + esc(p.sourceSnippet) + '</div>' : '') +
                (p.sourceBody ?
                    '  <button type="button" onclick="pendingImportsToggleBody(\'' + esc(p.docId) + '\')" class="text-xs font-bold text-[#003366] underline">' + icon('search') + ' Zobrazit / skrýt e-mail</button>' +
                    '  <div id="pi-body-' + esc(p.docId) + '" class="hidden mt-1 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">' + esc(p.sourceBody) + '</div>'
                    : '') +
                '  <div class="grid grid-cols-2 gap-2">' +
                '    <select class="pi-customer col-span-2 w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#003366] text-slate-800">' + options + '</select>' +
                '    <div><label class="text-xs font-bold text-gray-400 uppercase">FP</label>' +
                '      <input type="number" class="pi-fp w-full border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-center" value="' + (p.fp || 0) + '" min="0"></div>' +
                '    <div><label class="text-xs font-bold text-gray-400 uppercase">KH</label>' +
                '      <input type="number" class="pi-kh w-full border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-center" value="' + (p.kh || 0) + '" min="0"></div>' +
                '    <div class="col-span-2"><label class="text-xs font-bold text-gray-400 uppercase">PK</label>' +
                '      <input type="number" class="pi-pk w-full border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-center" value="' + (p.pk || 0) + '" min="0"></div>' +
                '  </div>' +
                (existing ? '  <div class="text-xs text-blue-600 font-semibold">Zákazník už dnes má cíl (FP:' + (existing.targetFP || 0) + ' KH:' + (existing.targetKH || 0) + ' PK:' + (existing.targetPK || 0) + ') – potvrzením se množství PŘIČTE.</div>' : '') +
                '  <div class="flex gap-2 pt-1">' +
                '    <button onclick="pendingImportsConfirm(\'' + esc(p.docId) + '\')" class="pi-confirm flex-1 bg-[#003366] hover:bg-black text-white text-xs font-bold py-2 rounded-lg transition-colors">✓ Potvrdit</button>' +
                '    <button onclick="pendingImportsReject(\'' + esc(p.docId) + '\')" class="bg-gray-200 hover:bg-gray-300 text-slate-700 text-xs font-bold py-2 px-3 rounded-lg transition-colors">✕ Zamítnout</button>' +
                '  </div>' +
                '</div>';
        });

        html += '  </div></div>';
        el.innerHTML = html;
    }

    window.pendingImportsConfirm = function (docId) {
        var row = document.getElementById('pi-row-' + docId);
        if (!row) return;

        // Pojistka proti dvojimu kliknuti (jinak by se mnozstvi pricetlo dvakrat).
        var btn = row.querySelector('.pi-confirm');
        if (btn) {
            if (btn.disabled) return;
            btn.disabled = true;
            btn.textContent = 'Ukládám...';
        }
        var unlock = function () {
            if (btn) { btn.disabled = false; btn.textContent = '✓ Potvrdit'; }
        };

        var customer = row.querySelector('.pi-customer').value;
        var fp = Math.max(0, parseInt(row.querySelector('.pi-fp').value) || 0);
        var kh = Math.max(0, parseInt(row.querySelector('.pi-kh').value) || 0);
        var pk = Math.max(0, parseInt(row.querySelector('.pi-pk').value) || 0);
        var dateStr = row.dataset.date;

        if (!customer) { alert('Vyberte prosím zákazníka ze seznamu.'); unlock(); return; }
        if (fp === 0 && kh === 0 && pk === 0) { alert('Zadejte alespoň jedno množství (FP/KH/PK).'); unlock(); return; }

        var custUpper = customer.toUpperCase();
        var targets = (typeof localDailyTargets !== 'undefined') ? localDailyTargets : [];
        var existing = targets.find(function (t) { return t.date === dateStr && t.customer === custUpper; });

        var finish = function () { db.collection('pendingImports').doc(docId).delete(); };
        var fail = function (e) { alert('Chyba při ukládání: ' + e.message); unlock(); };

        if (existing) {
            db.collection('dailyTargets').doc(existing.id || existing.docId).update({
                targetFP: (existing.targetFP || 0) + fp,
                targetKH: (existing.targetKH || 0) + kh,
                targetPK: (existing.targetPK || 0) + pk
            }).then(finish).catch(fail);
        } else {
            var id = Date.now().toString();
            db.collection('dailyTargets').doc(id).set({
                id: id,
                date: dateStr,
                customer: custUpper,
                targetFP: fp,
                targetKH: kh,
                targetPK: pk
            }).then(finish).catch(fail);
        }
    };

    // ======================================================================
    //  v4.3: HROMADNÉ POTVRZENÍ
    //  - bere hodnoty přímo z formulářů (respektuje ruční opravy zákazníka/počtů)
    //  - každou objednávku uloží na SVŮJ den (data-date řádku)
    //  - přeskočí řádky bez zákazníka, s nulovým množstvím a ty „ke kontrole“
    //  - více objednávek stejného zákazníka na stejný den sečte do jednoho cíle
    //  - k existujícímu cíli PŘIČÍTÁ atomicky (FieldValue.increment)
    //  - zápis cíle + smazání jeho návrhů jdou v jedné dávce (batch) → když
    //    se něco nepovede, nic se nepřičte napůl a návrhy zůstanou v panelu
    // ======================================================================
    window.pendingImportsConfirmAll = function () {
        if (bulkBusy) return;
        var rows = document.querySelectorAll('#pendingImportsPanel [data-docid]');
        var ready = [], skipped = { customer: 0, qty: 0, review: 0 };

        Array.prototype.forEach.call(rows, function (row) {
            var customer = (row.querySelector('.pi-customer') || {}).value || '';
            var fp = Math.max(0, parseInt(row.querySelector('.pi-fp').value) || 0);
            var kh = Math.max(0, parseInt(row.querySelector('.pi-kh').value) || 0);
            var pk = Math.max(0, parseInt(row.querySelector('.pi-pk').value) || 0);
            if (row.dataset.review === '1') { skipped.review++; return; }
            if (!customer) { skipped.customer++; return; }
            if (!fp && !kh && !pk) { skipped.qty++; return; }
            ready.push({ docId: row.dataset.docid, date: row.dataset.date, customer: customer.toUpperCase(), fp: fp, kh: kh, pk: pk });
        });

        var skippedTotal = skipped.customer + skipped.qty + skipped.review;
        var skippedTxt = skippedTotal ? ('\n\nPřeskočím ' + skippedTotal + ' (zůstanou v panelu k ručnímu potvrzení):' +
            (skipped.review ? '\n • ke kontrole množství: ' + skipped.review : '') +
            (skipped.customer ? '\n • bez vybraného zákazníka: ' + skipped.customer : '') +
            (skipped.qty ? '\n • s nulovým množstvím: ' + skipped.qty : '')) : '';

        if (!ready.length) { alert('Žádnou objednávku nejde potvrdit automaticky.' + skippedTxt); return; }

        // Sečtení podle den + zákazník
        var groups = {}, order = [];
        ready.forEach(function (r) {
            var key = r.date + '|' + r.customer;
            if (!groups[key]) { groups[key] = { date: r.date, customer: r.customer, fp: 0, kh: 0, pk: 0, docIds: [] }; order.push(key); }
            var g = groups[key];
            g.fp += r.fp; g.kh += r.kh; g.pk += r.pk; g.docIds.push(r.docId);
        });

        // Přehled podle dní do potvrzovacího okna
        var perDay = {};
        ready.forEach(function (r) { perDay[r.date] = (perDay[r.date] || 0) + 1; });
        var dayLines = Object.keys(perDay).sort().map(function (d) { return ' • ' + fmtCz(d) + ': ' + perDay[d] + ' obj.'; }).join('\n');

        if (!confirm('Potvrdit ' + ready.length + ' objednávek?\n\nUloží se na tyto dny:\n' + dayLines + skippedTxt)) return;

        bulkBusy = true;
        renderPendingImports();

        var targets = (typeof localDailyTargets !== 'undefined') ? localDailyTargets : [];
        var inc = firebase.firestore.FieldValue.increment;
        var MAX_OPS = 450; // Firestore limit je 500 operací na dávku
        var batches = [], cur = db.batch(), curOps = 0, idSeed = Date.now();

        order.forEach(function (key, i) {
            var g = groups[key];
            var need = 1 + g.docIds.length;
            if (curOps && curOps + need > MAX_OPS) { batches.push(cur); cur = db.batch(); curOps = 0; }
            var existing = targets.find(function (t) { return t.date === g.date && t.customer === g.customer; });
            if (existing) {
                cur.update(db.collection('dailyTargets').doc(existing.id || existing.docId), {
                    targetFP: inc(g.fp), targetKH: inc(g.kh), targetPK: inc(g.pk)
                });
            } else {
                var id = String(idSeed + i);
                cur.set(db.collection('dailyTargets').doc(id), {
                    id: id, date: g.date, customer: g.customer, targetFP: g.fp, targetKH: g.kh, targetPK: g.pk
                });
            }
            g.docIds.forEach(function (d) { cur.delete(db.collection('pendingImports').doc(d)); });
            curOps += need;
        });
        if (curOps) batches.push(cur);

        var done = 0;
        batches.reduce(function (p, b) {
            return p.then(function () { return b.commit(); }).then(function () { done++; });
        }, Promise.resolve()).then(function () {
            bulkBusy = false;
            renderPendingImports();
            alert('Hotovo – potvrzeno ' + ready.length + ' objednávek (' + order.length + ' denních cílů).' +
                (skippedTotal ? '\nV panelu zůstalo ' + skippedTotal + ' k ruční kontrole.' : ''));
        }).catch(function (e) {
            bulkBusy = false;
            renderPendingImports();
            alert('Chyba při ukládání: ' + e.message + '\n\nUloženo bylo ' + done + ' z ' + batches.length + ' dávek. Co se neuložilo, zůstalo v panelu – stačí kliknout znovu.');
        });
    };

    window.pendingImportsToggleBody = function (docId) {
        var el = document.getElementById('pi-body-' + docId);
        if (el) el.classList.toggle('hidden');
    };

    window.pendingImportsReject = function (docId) {
        if (confirm('Opravdu zamítnout tento návrh objednávky? Nebude se dát vrátit zpět (Apps Script ho znovu nepošle, protože e-mail už je označen jako zpracovaný).')) {
            db.collection('pendingImports').doc(docId).delete();
        }
    };

    function init() {
        if (typeof db === 'undefined') {
            setTimeout(init, 300);
            return;
        }
        injectDarkModeStyles();
        db.collection('pendingImports').onSnapshot(function (snapshot) {
            localPendingImports = [];
            snapshot.forEach(function (doc) {
                localPendingImports.push(Object.assign({ docId: doc.id }, doc.data()));
            });
            renderPendingImports();
        });
        db.collection('dailyTargets').onSnapshot(function () { renderPendingImports(); });
        db.collection('customerCards').onSnapshot(function () { renderPendingImports(); });
    }

    init();
})();
