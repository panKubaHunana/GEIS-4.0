# GEIS SVOZY – dispečink svozů palet (verze 4.1)

Webová aplikace (PWA) pro dispečink svozů + automatické načítání objednávek
z e-mailu přes Google Apps Script.

---

## Co je v balíčku

| Soubor | Kam patří |
|---|---|
| `index.html` | GitHub (kořen repozitáře) |
| `pending-imports.js` | GitHub |
| `style.css` | GitHub |
| `manifest.json` | GitHub |
| `sw.js` | GitHub |
| `icon-192.png`, `icon-512.png`, `geis-logo.png` | GitHub |
| `apps-script/Code.gs` | Google Apps Script (u tabulky GEIS SVOZY) |
| `apps-script/appsscript.json` | Google Apps Script (jen pokud používáš clasp) |

---

## 1) Nasazení na GitHub (Pages)

1. Otevři svůj repozitář s aplikací.
2. Nahraj (přetáhni) **všechny soubory z kořene tohoto balíčku** – tedy
   `index.html`, `pending-imports.js`, `style.css`, `manifest.json`, `sw.js`
   a ikony. Složku `apps-script/` na GitHub nahrávat nemusíš (ale nevadí to).
3. Potvrď „Commit changes“.
4. GitHub Pages se aktualizují do cca 1 minuty. V telefonu pak appku
   **zavři a znovu otevři** (u PWA případně stáhni dolů pro obnovení).

> Pozor na velikost písmen v názvech: GitHub je case-sensitive. Ikona se teď
> jmenuje `icon-512.png` (malými písmeny) – dřív byla `icon-512.PNG` a
> `manifest.json` ji proto nenacházel.

---

## 2) Nasazení Apps Scriptu

1. Otevři tabulku **GEIS SVOZY – evidence objednávek** → *Rozšíření → Apps Script*.
2. Smaž obsah `Code.gs` a vlož celý soubor `apps-script/Code.gs` z balíčku.
3. Ulož (Ctrl+S).
4. Nahoře vyber funkci **`runParserTests`** a klikni *Spustit*.
   V *Protokolu spuštění* musí být poslední řádek **`VSE OK (55 testu)`**.
   (Testy nic nezapisují, jen kontrolují počítání kusů.)
5. Časovač už máš z minula – pokud ne, spusť jednou **`createTimeTrigger`**.

Nic dalšího se nemění: štítky Gmailu, Power Automate flow ani ID tabulky
zůstávají stejné.

---

## 3) Co se opravilo (proč vycházely špatné počty palet)

Parser e-mailů měl osm chyb; každá sama o sobě dokázala změnit počet palet:

1. **`5 ks palet` se nepočítalo vůbec** (vyšlo 0) – mezi číslem a slovem
   „palet“ bylo „ks“, které starý vzorec neznal. Nově se přeskakuje `ks`,
   `kusů`, `x` i běžná přídavná jména (`2 celé palety`, `3 standardní palety`).
2. **`Zdravím,` na začátku e-mailu useklo celé tělo zprávy** – pozdrav se bral
   jako začátek podpisu, takže se nenašlo nic (0 palet). Navíc platí pojistka:
   když by ořez odstranil všechny zmínky o paletách, ořez se zruší.
3. **E-mail jen se souhrnem** (`Celkem 12 palet`, `Zítra prosím svoz 8 palet:`)
   vycházel jako 0 – souhrnné řádky se zahazovaly bez náhrady. Nově: počítá se
   rozpis, a když rozpis nic nenajde, použije se souhrn. Když existuje obojí a
   **čísla si neodpovídají**, návrh se do appky pošle s upozorněním
   „zkontrolujte ručně“.
4. **Zkratky se chytaly uprostřed slov** – `2 spojky` → FP 2 (kvůli „SP“),
   `hpl` → KH. Za zkratkou (FP, SP, KH, HP, PK, PKS, PCS, EUR) už nesmí být
   písmeno.
5. **`paletka` a `malé palety` se počítaly jako celá paleta** – pořadí variant
   bylo špatně. Nyní je pořadí KH → PK → FP a `paletka` / `malá paleta` = KH.
6. **Rozměry, hmotnosti a ceny braly čísla** – `paleta 120x80` mohla přidat
   80 kusů, `cena 150 EUR` 150 palet. Nově se ignorují rozměry (`120x80`),
   desetinná čísla, ceny a nesmyslně velká čísla (nad 500 → označí se ke kontrole).
7. **Citovaná historie e-mailu se počítala znovu** – v odpovědi („Dne … napsal:“,
   řádky s `>`, „From:/Od:“) byla objednávka podruhé, takže vyšla dvojnásobně.
   Citovaná část se teď odřízne.
8. **Řádky vkládané Power Automatem se mazaly jen jednou** (chyběl příznak `g`),
   takže se číslo z předmětu mohlo přičíst navíc.

V appce navíc tlačítko **Potvrdit** už nejde omylem zmáčknout dvakrát
(dřív se množství přičetlo dvakrát).

---

## 4) Rozpoznávané varianty jednotek

| Kategorie | Co e-mail může obsahovat |
|---|---|
| **FP** (celá paleta) | paleta, palety, palet, paletové místo, paletových míst, celá paleta, standardní paleta, EUR, EURO, europaleta, EPAL, FP, SP |
| **KH** (půlpaleta) | KH, HP, půlpaleta, půl palety, polopaleta, 1/2 palety, ½ palety, malá paletka, paletka, malá paleta |
| **PK** (balíky) | balík, balíky, big box, bigbox, box, karton, krabice, vozík, PK, PKS, PCS |

Počet lze zapsat číslicí (`5`, `25FP`, `4x paleta`, `Palety: 14`, `HP - 2 ks`)
i slovem (`jednu`, `dvě`, `tři`, … `patnáct`, `dvacet`, `třicet`, `padesát`).

**Chceš přidat další formulaci?** V `Code.gs` uprav `FP_WORDS` / `KH_WORDS` /
`PK_WORDS`, přidej řádek do `TESTS` ve funkci `runParserTests()` a testy spusť.

---

## 5) Výchozí seznamy (zákazníci a řidiči)

Jsou v `index.html` v konstantách `DEFAULT_PICKUP_CUSTOMERS` a `defaultDrivers`.

Po prvním otevření nové verze proběhne **jednorázové nasazení** (funkce
`trySeedDefaultsV2`):

* **Řidiči** – seznam se nahradí výchozím (43 jmen).
* **Zákazníci** – chybějící Karty zákazníka se doplní, u existujících se
  doplní jen prázdný e-mail. **Nic se nemaže**, takže si zachováš adresy a
  kontakty, které už máš vyplněné.

Proběhne jen jednou pro celou databázi (příznak `defaultsV2Done` v dokumentu
`settings/_meta` ve Firestore). Kdybys to potřeboval spustit znovu, smaž
v databázi toto jedno pole.

E-maily zákazníků slouží k automatickému rozpoznání odesílatele – stejná
tabulka je i v `pending-imports.js` (`EMAIL_CUSTOMER_MAP`). Při přidání nového
pravidelného zákazníka doplň řádek na obou místech.

---

## 6) Service worker (offline režim)

`sw.js` je nově **network-first** (dřív cache-first, kvůli tomu telefony
zůstávaly viset na staré verzi). `index.html` ho **záměrně neregistruje** –
appka funguje online. Pokud offline režim chceš, přidej do `index.html` před
`</body>`:

```html
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js');}</script>
```
