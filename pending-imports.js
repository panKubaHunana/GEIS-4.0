/**
 * GEIS SVOZY - panel "Nove objednavky z e-mailu" (Faze 2)
 * ---------------------------------------------------------------------------
 * Tento soubor se NAPOJUJE na existujici index.html appky - vyuziva uz
 * inicializovanou globalni promennou `db` (Firestore) a `activeDate`,
 * `localDailyTargets`, `localStorage` seznamy zakazniku atd.
 *
 * JAK NASADIT:
 * 1) Ulož tento soubor jako "pending-imports.js" do stejne slozky jako index.html
 *    (vedle style.css a sw.js).
 * 2) V index.html pridej TENTO JEDEN RADEK uplne na konec, tesne pred </body>
 *    (tedy AZ PO tom velkem <script>...</script> bloku, co uz v souboru mas):
 *
 *      <script src="pending-imports.js"></script>
 *
 * 3) Pokud appku hostujes na GitHub Pages/jinde, nahraj tento soubor tam
 *    stejnym zpusobem jako ostatni (index.html, style.css, sw.js).
 * 4) V sw.js (Service Worker) je seznam souboru pro offline cache "urlsToCache" -
 *    pokud chces, aby panel fungoval i offline, priday tam radek
 *    'pending-imports.js', a zvys cislo verze CACHE_NAME (napr. 'sw-v45'),
 *    aby si telefon stahl novou verzi. Neni to nutne pro funkcnost online.
 *
 * CO TO DELA:
 * - Poslouchá kolekci Firestore "pendingImports" (tam zapisuje Apps Script
 *   pri kazde rozpoznane objednavce z e-mailu).
 * - Na zalozce "Mrizka" nahore zobrazi panel se seznamem navrhu - zakaznik
 *   (predvyplneny nejlepsim odhadem), FP/KH/PK (predvyplnene, editovatelne).
 * - Tlacitko "Potvrdit" vytvori/aktualizuje bezny dailyTarget (presne to,
 *   co jinak delas rucne formularem "Aktivovat zakaznika") a navrh smaze.
 * - Tlacitko "Zamitnout" navrh jen smaze bez zapisu.
 */
(function () {
    'use strict';

    // Appka resi tmavy rezim vlastnimi CSS pravidly navazanymi na "body.dark" (viz index.html).
    // Nove amber barvy panelu v nich nejsou, tak je sem doplnime, aby v tmavem rezimu
    // nesvitily svetle jako chyba.
    function injectDarkModeStyles() {
        if (document.getElementById('pendingImportsDarkStyles')) return;
        var style = document.createElement('style');
        style.id = 'pendingImportsDarkStyles';
        style.textContent = '' +
            'body.dark #pendingImportsPanel .bg-amber-50 { background-color: #3a2f10; }' +
            'body.dark #pendingImportsPanel .border-amber-400 { border-color: #b8860b; }' +
            'body.dark #pendingImportsPanel .border-amber-200 { border-color: #5c4a1a; }' +
            'body.dark #pendingImportsPanel .text-amber-700 { color: #fbbf24; }' +
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
            .replace(new RegExp('[̀-ͯ]', 'g'), '')
            .trim();
    }

    // Presna tabulka: e-mailova adresa odesilatele -> presny nazev zakaznika v aplikaci.
    // Klice jsou vzdy malymi pismeny (porovnani je case-insensitive). Tuto tabulku muzes
    // kdykoli doplnit o dalsi radky ve tvaru 'adresa@firma.cz': 'NAZEV ZAKAZNIKA'.
    var EMAIL_CUSTOMER_MAP = {
        'paletovyprodej@hradeckapekarna.cz': 'HRADECKÁ PEKÁRNA',
        'expedice@krpa.cz': 'KRPA',
        'winter@wiba.cz': 'ČEMAT',
        'jaroslav.prat@hptronic.cz': 'HP TRONIC',
        'volhejn@detecha.cz': 'DETECHA',
        'objednavky@drana.cz': 'DRANA',
        'expedice@fomei.com': 'FOMEI',
        'k.kalenska@itadeco.cz': 'ITADECO',
        'info@strixhorice.cz': 'STRIX',
        'obchod@fanton.cz': 'FANTON',
        'leos.kucera@cyklomax.cz': 'CYKLOMAX',
        'h.kralova@gekkon.org': 'GEKKON',
        'baliky@vorcz.cz': 'VOR',
        'logistika@shipmall.cz': 'SHIPMALL',
        'malkova@pentaservis.cz': 'PENTA',
        'sklad@li-ca.cz': 'LI-CA',
        'vankova@abicor.cz': 'ABICOR BINZEL'
    };

    // Zkusi najit zakaznika. NEJDRIV podle presne tabulky EMAIL_CUSTOMER_MAP (nejspolehlivejsi),
    // az potom podle jmena odesilatele NEBO domeny emailu (napr. "k.kalenska@itadeco.cz" -> "ITADECO").
    // Neni-li jiste, vraci null a dispecer si zakaznika jednoduse vybere sam z rozbalovaci nabidky.
    function fuzzyMatchCustomer(name, email, list) {
        // 1) Presna shoda podle e-mailove adresy
        var mapped = EMAIL_CUSTOMER_MAP[(email || '').toLowerCase().trim()];
        if (mapped) {
            for (var m = 0; m < list.length; m++) {
                if (normalize(list[m]) === normalize(mapped)) return list[m];
            }
            // I kdyby zakaznik jeste nemel kartu, vratime aspon presny nazev.
            return mapped;
        }

        var n = normalize(name);
        var domain = ((email || '').split('@')[1] || '').split('.')[0];
        var d = normalize(domain);

        for (var i = 0; i < list.length; i++) {
            var c = normalize(list[i]);
            if (!c) continue;
            if (n && (n.indexOf(c) !== -1 || c.indexOf(n) !== -1)) return list[i];
        }
        for (var j = 0; j < list.length; j++) {
            var c2 = normalize(list[j]);
            if (!c2) continue;
            if (d && (d.indexOf(c2) !== -1 || c2.indexOf(d) !== -1)) return list[j];
        }
        return null;
    }

    function sortAlpha(arr) {
        return arr.slice().sort(function (a, b) { return a.localeCompare(b, 'cs'); });
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function renderPendingImports() {
        var el = ensurePanelContainer();

        if (!localPendingImports.length) {
            el.innerHTML = '';
            return;
        }

        // Zákazníci teď vychází z Karet zákazníka (sjednocený seznam), ne ze starého 'customersPickup'.
        var custPickup = sortAlpha(
            JSON.parse(localStorage.getItem('customerCards') || '[]')
                .map(function (c) { return c && c.name ? String(c.name).toUpperCase() : ''; })
                .filter(function (n) { return !!n; })
        );
        var targets = (typeof localDailyTargets !== 'undefined') ? localDailyTargets : [];
        var today = (typeof activeDate !== 'undefined') ? activeDate : '';

        // Apps Script posila do appky jen objednavky na dnesek (e-maily s jinym datem jsou
        // jen avizo a ignoruji se uz na strane scriptu), takze tady ukazujeme vsechny navrhy.
        var sorted = localPendingImports.slice().sort(function (a, b) {
            return (a.createdAt || '').localeCompare(b.createdAt || '');
        });

        var html = '' +
            '<div class="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-5 shadow-sm">' +
            '  <h3 class="font-black text-amber-700 text-xs uppercase tracking-wider mb-3">📬 Nové objednávky z e-mailu (' + sorted.length + ') čekají na potvrzení</h3>' +
            '  <div class="space-y-3">';

        sorted.forEach(function (p) {
            var guess = fuzzyMatchCustomer(p.customer, p.sourceEmail, custPickup);
            var rowDate = p.date || today;
            var existing = guess ? targets.find(function (t) {
                return t.date === rowDate && t.customer === guess.toUpperCase();
            }) : null;

            var options = '<option value="" disabled ' + (guess ? '' : 'selected') + '>Vyberte zákazníka...</option>' +
                custPickup.map(function (c) {
                    return '<option value="' + esc(c) + '" ' + (c === guess ? 'selected' : '') + '>' + esc(c) + '</option>';
                }).join('');

            html += '' +
                '<div id="pi-row-' + esc(p.docId) + '" data-date="' + esc(rowDate) + '" class="bg-white rounded-lg border border-amber-200 p-3 space-y-2 shadow-sm">' +
                '  <div class="text-[10px] text-gray-500">Od: <b>' + esc(p.customer || '-') + '</b> (' + esc(p.sourceEmail || '-') + ') &middot; ' + esc(rowDate) + '</div>' +
                ((p.needsReview || (!p.fp && !p.kh && !p.pk)) ? '  <div class="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1">⚠️ Množství se nepodařilo rozpoznat – doplňte FP/KH/PK ručně (nebo objednávku zamítněte). Nápověda: otevřete tělo e-mailu níže.</div>' : '') +
                (p.sourceSnippet ? '  <div class="text-[10px] text-gray-400 italic truncate" title="' + esc(p.sourceSnippet) + '">' + esc(p.sourceSnippet) + '</div>' : '') +
                (p.sourceBody ?
                    '  <button type="button" onclick="pendingImportsToggleBody(\'' + esc(p.docId) + '\')" class="text-[10px] font-bold text-[#003366] underline">🔍 Zobrazit / skrýt e-mail</button>' +
                    '  <div id="pi-body-' + esc(p.docId) + '" class="hidden mt-1 text-[10px] text-gray-600 dark:text-gray-300 bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">' + esc(p.sourceBody) + '</div>'
                    : '') +
                '  <div class="grid grid-cols-2 gap-2">' +
                '    <select class="pi-customer col-span-2 w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#003366] text-slate-800">' + options + '</select>' +
                '    <div><label class="text-[9px] font-bold text-gray-400 uppercase">FP</label>' +
                '      <input type="number" class="pi-fp w-full border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-center" value="' + (p.fp || 0) + '" min="0"></div>' +
                '    <div><label class="text-[9px] font-bold text-gray-400 uppercase">KH</label>' +
                '      <input type="number" class="pi-kh w-full border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-center" value="' + (p.kh || 0) + '" min="0"></div>' +
                '    <div class="col-span-2"><label class="text-[9px] font-bold text-gray-400 uppercase">PK</label>' +
                '      <input type="number" class="pi-pk w-full border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-center" value="' + (p.pk || 0) + '" min="0"></div>' +
                '  </div>' +
                (existing ? '  <div class="text-[10px] text-blue-600 font-semibold">Zákazník už dnes má cíl (FP:' + (existing.targetFP || 0) + ' KH:' + (existing.targetKH || 0) + ' PK:' + (existing.targetPK || 0) + ') – potvrzením se množství PŘIČTE.</div>' : '') +
                '  <div class="flex gap-2 pt-1">' +
                '    <button onclick="pendingImportsConfirm(\'' + esc(p.docId) + '\')" class="flex-1 bg-[#003366] hover:bg-black text-white text-[11px] font-bold py-2 rounded-lg uppercase transition-colors">✓ Potvrdit</button>' +
                '    <button onclick="pendingImportsReject(\'' + esc(p.docId) + '\')" class="bg-gray-200 hover:bg-gray-300 text-slate-700 text-[11px] font-bold py-2 px-3 rounded-lg uppercase transition-colors">✕ Zamítnout</button>' +
                '  </div>' +
                '</div>';
        });

        html += '  </div></div>';
        el.innerHTML = html;
    }

    window.pendingImportsConfirm = function (docId) {
        var row = document.getElementById('pi-row-' + docId);
        if (!row) return;
        var customer = row.querySelector('.pi-customer').value;
        var fp = Math.max(0, parseInt(row.querySelector('.pi-fp').value) || 0);
        var kh = Math.max(0, parseInt(row.querySelector('.pi-kh').value) || 0);
        var pk = Math.max(0, parseInt(row.querySelector('.pi-pk').value) || 0);
        var dateStr = row.dataset.date;

        if (!customer) { alert('Vyberte prosím zákazníka ze seznamu.'); return; }
        if (fp === 0 && kh === 0 && pk === 0) { alert('Zadejte alespoň jedno množství (FP/KH/PK).'); return; }

        var custUpper = customer.toUpperCase();
        var targets = (typeof localDailyTargets !== 'undefined') ? localDailyTargets : [];
        var existing = targets.find(function (t) { return t.date === dateStr && t.customer === custUpper; });

        var finish = function () { db.collection('pendingImports').doc(docId).delete(); };

        if (existing) {
            db.collection('dailyTargets').doc(existing.id).update({
                targetFP: (existing.targetFP || 0) + fp,
                targetKH: (existing.targetKH || 0) + kh,
                targetPK: (existing.targetPK || 0) + pk
            }).then(finish).catch(function (e) { alert('Chyba při ukládání: ' + e.message); });
        } else {
            var id = Date.now().toString();
            db.collection('dailyTargets').doc(id).set({
                id: id,
                date: dateStr,
                customer: custUpper,
                targetFP: fp,
                targetKH: kh,
                targetPK: pk
            }).then(finish).catch(function (e) { alert('Chyba při ukládání: ' + e.message); });
        }
    };

    window.pendingImportsToggleBody = function (docId) {
        var el = document.getElementById('pi-body-' + docId);
        if (el) el.classList.toggle('hidden');
    };

    // Umožní index.html překreslit panel (např. při změně data).
    window.pendingImportsRefresh = function () { renderPendingImports(); };

    window.pendingImportsReject = function (docId) {
        if (confirm('Opravdu zamítnout tento návrh objednávky? Nebude se dát vrátit zpět (Apps Script ho znovu nepošle, protože e-mail už je označen jako zpracovaný).')) {
            db.collection('pendingImports').doc(docId).delete();
        }
    };

    function init() {
        if (typeof db === 'undefined') {
            // index.html jeste nestihl inicializovat Firebase - zkusit znovu za chvili.
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
        // Znovu prekreslit i pri zmene dailyTargets (kvuli hlasce "uz ma dnes cil...").
        db.collection('dailyTargets').onSnapshot(function () { renderPendingImports(); });
    }

    init();
})();
