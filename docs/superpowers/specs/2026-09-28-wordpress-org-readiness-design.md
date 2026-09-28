# Design: WordPress.org readiness per MG Warehouse Stock

Data: 2026-09-28
Repo: https://github.com/Vincenzoferrara/mg-warehouse-stock
Versione plugin: 2.3.0 · schema DB `10`

## 1. Obiettivo

Rendere il plugin `mg-warehouse-stock` un plugin WordPress pubblicabile sulla directory di
WordPress.org, mantenendo invariato il comportamento funzionale che oggi serve all'app Flutter
`gestione_negozio_app` attraverso il contratto `mgws/v1`.

Il perimetro comprende l'intero feature set attuale: magazzino multi-sede, stock e ledger
movimenti, riordini, fornitori, ordini di acquisto e ricezioni, conteggi inventario, POS/cassa
con turni, e punti fedeltà. L'interfaccia admin passa all'inglese e l'italiano resta come
traduzione.

## 2. Stato verificato (baseline misurata)

Tutte le affermazioni di questa sezione sono state verificate sul codice e non sono assunzioni.

| Controllo | Esito |
| --- | --- |
| `php -l` sui 4 file PHP | nessun errore di sintassi |
| `tests/mgws_contract_test.php` | `SUMMARY failures=0 pending=0`, 36 gruppi di test |
| `tests/assert_mgws_contract_matrix.php docs/mgws-v1-contract.md` | `50 required rows verified` |
| Route REST registrate / `permission_callback` | 39 / 48, **zero** aperti (`null`, `true`, `__return_true`) |
| Query `$wpdb` totali / con `prepare` | 181 / 49; i 74 rimanenti sono `START TRANSACTION`, `COMMIT`, `ROLLBACK` — nessuna stringa SQL interpolata |
| Handler `wp_ajax_` protetti | 16 / 16, per controllo diretto o tramite `require_ajax_nonce_any()`, `require_admin_nonce()`, `require_admin_delete_caps()`, `can_manage_master_data()` |
| `innerHTML` negli script admin | 0; i dati passano da jQuery `.text()`, le 12 chiamate `.html()` contengono solo markup statico |
| `eval`, `base64_decode`, `shell_exec`, `error_log`, `var_dump` | 0 |
| Tag `?>` di chiusura | 0 |

**Conclusione di sicurezza: il plugin è solido.** Non esiste il buco sugli handler AJAX che una
lettura superficiale lasciava supporre: gli handler delegano ai helper, e gli helper verificano
entrambi nonce e capability. Le fasi di hardening non hanno quindi lavoro di rimedio da fare.

## 3. Lacune che blockingano la directory di WordPress.org

| # | Lacuna | Gravità |
| --- | --- | --- |
| G1 | Nessuna licenza. La directory richiede una licenza GPL-compatible. | Bloccante |
| G2 | Nessun `readme.txt` nel formato ufficiale, nessun `Stable tag`, nessuno screenshot. | Bloccante |
| G3 | Nessun `uninstall.php`: disinstallando restano 18 tabelle, 3 option, 2 CPT, 7 capability, 1 user meta, 1 custom order status. | Bloccante |
| G4 | i18n assente: 1 solo `_n_noop()` su ~16.400 righe, nessun `load_plugin_textdomain()`, nessun `Domain Path`, nessuna cartella `languages/`, zero `wp.i18n` nei 4 script admin. | Bloccante |
| G5 | Header senza `Requires Plugins: woocommerce` (WP 6.5+), nessun avviso admin se WooCommerce manca. | Consigliato |
| G6 | Nessuna CI, nessuno script di build della zip distribuibile. | Funzionale |
| G7 | `docs/mgws-v1-contract.md` e `tests/` finirebbero dentro la zip se non esclusi. | Funzionale |
| G8 | Nessuna dichiarazione di compatibilità HPOS. Il codice usa `wc_get_orders`, che è HPOS-safe, ma senza `FeaturesUtil::declare_compatibility('custom_order_tables', ...)` WooCommerce mostra un avviso di incompatibilità e può bloccare il flusso di aggiornamento del plugin. | Bloccante |
| G9 | `add_filter('woocommerce_can_reduce_order_stock', '__return_false')` a `class-mgws-plugin.php:43` disattiva la riduzione di stock di WooCommerce **per tutto il sito e per tutti i plugin**, non solo per i prodotti gestiti da MGWS. Su un'installazione singola e proprietaria è la scelta giusta. Su uno store pubblico è una trappola: chi installa MGWS insieme a un altro plugin di inventario si ritrova la gestione stock silenziosamente rotta. | Bloccante, richiede decisione |

## 4. Vincoli

- **V1** Il contratto `mgws/v1` non può cambiare. L'app Flutter lo consuma e i 50 test di matrice lo verificano. Nessun percorso, nome di campo, codice errore o forma di risposta può essere alterato.
- **V2** PHP 8.0+ e WordPress 6.0+ restano i minimi dichiarati, anche se lo sviluppo e la CI girano su 8.3.
- **V3** Non esiste un PHP locale. L'unico banco di prova è `docker exec wordpress_app php`, con PHP 8.3.27, WordPress 7.1 e WooCommerce 11.1.0. Ogni fase deve essere validata lì.
- **V4** `zip` e `unzip` sono disponibili localmente; `composer` no.
- **V5** I messaggi di errore delle 39 route REST restano **in inglese e non tradotti**: sono un'API, non UI, e l'app Flutter li usa come identificatori stabili. Vanno solo esclusi dal perimetro i18n, non riscritti.
- **V6** La decisione sul feature set è presa: tutto il feature set va nello store, in inglese.

## 5. Decisioni già prese

| Decisione | Scelta |
| --- | --- |
| Cos'è il repo | La cartella esistente del plugin, versionata così com'è: nessuna migrazione di codice |
| Remote | GitHub pubblico `Vincenzoferrara/mg-warehouse-stock` |
| Nome | `mg-warehouse-stock`, allineato allo slug e al Text Domain |
| Tipo di repo | Il repo **è** la cartella del plugin, montabile in `wp-content/plugins/mg-warehouse-stock`, più scaffold da store |
| Scope del codice | Anche compliance del codice, non solo scaffold |
| Feature set store | Completo, in inglese, `it_IT` come traduzione |
| Processo | Una spec unica, poi piano di esecuzione |

## 6. Architettura della soluzione

Quattro fasi, ognuna con un commit e una validazione indipendente. L'ordine è vincolato dalla
dipendenza: F2 crea l'infrastruttura che F3 usa, F4 non può chiudersi prima che F3 abbia toccato i
renderer, F5 dipende da tutto.

```
F2 scaffolding  ──►  F3 i18n  ──►  F4 verifica  ──►  F5 submission
   GPL, readme      gettext su        escaping nei     branding,
   uninstall.php    PHP + JS          renderer JS      short desc,
   CI, build zip    en_US + it_IT     capability        tag, screenshot
                                    cleanup
```

### Fase F2 — Scaffolding da directory di WordPress.org

**Obiettivo:** colmare G1, G2, G3, G5, G6, G7, G8.

**File nuovi**

- `LICENSE` — GPL-2.0-or-later, testo completo.
- `readme.txt` — formato ufficiale: `Plugin Name`, `Contributors`, `Tags`, `Requires at least`, `Tested up to`, `Requires PHP`, `Stable tag`, `License`, `License URI`, short description, `Installation`, `Frequently Asked Questions`, `Screenshots`, `Changelog`. Lo `Stable tag` deve essere `2.3.0` e coincidere con la versione nell'header principale.
- `uninstall.php` — rimuove, in quest'ordine: le 18 tabelle, i 3 option (`mgws_caps_version`, `mgws_db_schema_version`, `mgws_pos_turno_obbligatorio`), le 7 capability da tutti i ruoli, le 2 CPT `mg_site` e `mg_warehouse` con i loro post, il user meta `mg_default_site_id`. L'uninstall deve onorare `WP_UNINSTALL_PLUGIN` e i dati devono restare intatti se la costante non è definita, come impone la directory.
- `languages/mg-warehouse-stock.pot` — generato in F3, qui si crea la cartella con `.gitkeep`.
- `bin/build-release.sh` — produce `dist/mg-warehouse-stock-2.3.0.zip` con la cartella radice `mg-warehouse-stock/`, escludendo `.git`, `bin`, `docs`, `tests`, `dist`, `.github`, `OPENCODE.md`, `.gitignore`.
- `.github/workflows/ci.yml` — tre job: `lint` (`php -l` su tutti i PHP), `test` (i due test esistenti), `build` (genera la zip e la carica come artefatto).

**File modificati**

- `mg-warehouse-stock.php` — aggiungo `Requires Plugins: woocommerce` e `Domain Path: /languages`, e `load_plugin_textdomain()` su `init`.
- `includes/class-mgws-plugin.php` — avviso admin se `WooCommerce` non è attivo, con `admin_notices`, invece di fallire in silenzio. Aggiungo inoltre la dichiarazione HPOS su `before_woocommerce_init` con `FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true)`: senza, WooCommerce 8.2+ segnala il plugin come incompatibile con High-Performance Order Storage, e l'ambiente locale gira WooCommerce 11.1.0 dove l'avviso è certo.

**Criteri di accettazione**

1. La zip si genera e contiene solo i file runtime.
2. `docker exec wordpress_app php -l` passa su tutti i file PHP, incluso `uninstall.php`.
3. `tests/mgws_contract_test.php` resta a `failures=0 pending=0`.
4. `assert_mgws_contract_matrix.php` verifica ancora 50 righe.
5. Disinstallando il plugin in un ambiente di prova, tabelle, option, CPT, capability e user meta sono tutti assenti.
6. Con WooCommerce disattivato, l'avviso admin compare e nessuna route REST è raggiungibile.

### Fase F3 — Internazionalizzazione

**Obiettivo:** colmare G4.

**Volume misurato:** ~260 righe PHP con stringhe italiane hardcoded nei contesti UI, ~480 stringhe con spazi nei 4 script admin (`admin-masterdata.js` 296, `admin-product.js` 127, `admin-order.js` 55, `admin-inventory.js` 2). L'unica chiamata i18n esistente è `_n_noop()` a `class-mgws-plugin.php:355`.

**Approccio**

1. Il **sorgente è l'inglese**. Ogni stringa UI hardcoded viene riscritta in inglese e wrappata in `__()`, `esc_html__()`, `esc_attr__()` o `_n_noop()` con il text domain `mg-warehouse-stock`. Non si estrae gettext su testo italiano: si sostituisce.
2. Negli script admin, le stringhe passano da jQuery `.text('...')` a `wp.i18n.__('...', 'mg-warehouse-stock')`. Gli script admin prendono `wp-i18n` come dipendenza in `wp_enqueue_script`, accanto a `jquery`.
3. I messaggi di errore REST restano in inglese e non vengono toccati (V5).
4. Le stringhe passate da PHP a JS passano da `wp_localize_script` a `wp_set_script_translations()`, che è il meccanismo supportato.
5. `bin/make-pot.sh` genera `languages/mg-warehouse-stock.pot`; `languages/mg-warehouse-stock-it_IT.po` + `.mo` contengono le traduzioni italiane, che sono le stringhe attuali.
6. `textdomain` viene dichiarato in `uninstall.php` solo per i plugin che lo richiedono; non è il caso, quindi resta assente.

**Criteri di accettazione**

1. Un check in `tests/` elenca le stringhe UI non wrappate in gettext e deve restituire zero. Il pattern grezza `"[a-z] [a-z]"` non basta, perché produce troppi falsi positivi: il controllo deve distinguere le stringhe già wrappate in `__()`/`esc_html__()`/`esc_attr__()` da quelle passate a jQuery `.text()` e `.html()`.
2. Il pot contiene ogni stringa, con riferimenti a file e riga.
3. L'`it_IT` installato rende l'interfaccia identica a quella di oggi.
4. `lint`, `test` e i 50 controlli di matrice restano verdi.
5. Nessun percorso REST, nome di campo o codice errore è cambiato: i 36 gruppi di test lo garantiscono.

### Fase F4 — Verifica di sicurezza e cleanup

**Obiettivo:** confermare in modo ripetibile quanto emerso dall'audit, e completare il cleanup delle capability che oggi avviene solo in installazione.

**Lavoro**

1. Il check di copertura dei 16 handler AJAX entra in `tests/` come script eseguibile, così la CI fallisce se un handler nuovo perde la protezione. È questo il deliverable vero: il codice è già corretto, ma la verifica era manuale e non ripetibile.
2. Verifica escaping sui renderer JS, con particolare attenzione alle 12 chiamate `.html()`, per confermare che restino statiche.
3. `uninstall.php` rimuove anche le 7 capability: oggi `ensure_role_capabilities()` le aggiunge in attivazione e in upgrade, ma non esiste alcun percorso che le rimuova.
4. Aggiornamento di `docs/mgws-v1-contract.md` solo se F3 ha toccato una stringa visibile nel documento.

**Criteri di accettazione**

1. Lo script di copertura AJAX riporta 16/16 e la CI lo esegue.
2. Lo script di copertura escaping riporta zero interpolazioni pericolose.
3. Il cleanup delle capability è coperto da un test.

### Fase F5 — Preparazione alla submission

**Obiettivo:** rendere il pacchetto presentabile alla directory.

**Lavoro**

1. Decisione di branding sul **nome visualizzato**. `MG Warehouse Stock` è enigmatico per chi non conosce l'azienda, e la scheda della directory si legge sul nome mostrato, non sullo slug. Lo slug `mg-warehouse-stock` **resta invariato in ogni caso**: è già cablato nel mount Docker, nel Text Domain, nel nome del Text Domain del `.pot` e nelle assunzioni dell'app Flutter. Cambiare slug significa un progetto separato, non una riga di F5. Da decidere con l'utente: nome visualizzato in inglese e descrittivo della funzione, oppure invariato.
2. Short description e tag della directory, coerenti con le linee guida: i tag sono un elenco limitato e controllato dalla directory, non arbitrario.
3. Screenshot in `.trac`/assets, da catturare dall'ambiente Docker a 1280px.
4. `Tested up to` allineato a una versione reale di WordPress verificata, non dichiarata alla cieca.
5. **Decisione su G9, il filtro globale sullo stock di WooCommerce.** È l'unica voce di questa spec che cambia comportamento a runtime, quindi non la decido io. Le opzioni sono: (a) mantenere `__return_false` globale e dichiararlo apertamente in `readme.txt` come "MGWS è l'unica fonte autorevole dello stock", coerente con l'architettura del progetto e corretto per l'uso singolo-tenant; (b) restringere il filtro ai soli prodotti che MGWS gestisce davvero, più gentile con altri plugin ma impossibile oggi perché non esiste un flag "prodotto gestito da MGWS"; (c) renderlo un'impostazione attivabile, disattivata per le nuove installazioni e attiva per quelle esistenti. Raccomando (c): preserva il comportamento dell'app Flutter, non tocca il contratto e non rompe le installazioni esistenti. Resta comunque una scelta di prodotto e va confermata.
6. Chiusura dei punti che il reviewer potrebbe segnalare: stabilità dichiarata, `WP_DEBUG` che produce output nonostante le regole del repository, e chiamate a funzioni deprecate su PHP 8.3.

**Criteri di accettazione**

1. `readme.txt` supera il validator della directory.
2. La zip installa e attiva su un ambiente pulito con WooCommerce.
3. WooCommerce non mostra l'avviso di incompatibilità HPOS.
4. Nessun warning nel debug log durante l'attivazione e l'uso.

## 7. Strategia di validazione

Non essendoci PHP locale, ogni fase si valida così:

```sh
P=/var/www/html/wp-content/plugins/mg-warehouse-stock
# lint
docker exec wordpress_app php -l $P/includes/class-mgws-plugin.php
# test del contratto
docker exec -w $P wordpress_app php tests/mgws_contract_test.php
# matrice del contratto
docker exec -w $P wordpress_app php tests/assert_mgws_contract_matrix.php docs/mgws-v1-contract.md
```

La stessa terna gira in CI su `shivammathur/setup-php` con PHP 8.0, 8.1, 8.2 e 8.3, in
matrice, più l'ambiente WordPress con WooCommerce per lo smoke test. La matrice di versioni PHP
copre il vincolo V2.

## 8. Fuori perimetro

- Il contratto `mgws/v1` e il suo documentato. Nessun endpoint, campo, codice errore o semantica
  cambia in nessuna fase.
- Il ruolo di gateway verso `ATUM` e `myCred`, che restano gestione interna di MGWS e non
  appaiono nell'interfaccia di questo plugin.
- Il refactor dei tre file grandi da 2.100, 6.162 e 3.067 righe. Sono grandi e scomodi, ma
  dividerli durante un lavoro di compliance aumenterebbe il rischio senza servire l'obiettivo.
- La monetizzazione, i messaggi di aggiornamento, le traduzioni in lingue diverse dall'italiano e
  l'anteprima dei dati.
- Il fatto che `mg-warehouse-stock` resti privato o diventi pubblico su GitHub. È già pubblico.

## 9. Rischi aperti

| Rischio | Impatto | Mitigazione |
| --- | --- | --- |
| F3 è meccanico ma tocca ~740 stringhe su 16.400 righe | Alto se fatto di getto, basso se validato in continuazione | Un commit per file, lint e test verdi dopo ognuno, mai uno squashed alla fine |
| Lo slug `mg-warehouse-stock` è libero | **Risolto il 2026-09-28**: `api.wordpress.org/plugins/info/1.0/mg-warehouse-stock.json` risponde HTTP 404 `{"error":"Plugin not found."}`, mentre uno slug occupato come `woocommerce` risponde 200. Il rischio residuo è che qualcun altro lo occupi prima della submission, quindi va riverificato al momento del push | Nessuno per F2-F4; riverifica prima della submission |
| Il filtro globale sullo stock rompe altri plugin di inventario su installazioni con più plugin | Alto per gli utenti dello store, nullo per l'uso attuale | Opzione (c) in F5: comportamento attivabile, default conservato per le installazioni esistenti. Va deciso prima della submission |
| Le capability personalizzate sopravvivono a uninstall e inquinano i ruoli | Basso, ma FastCFS li chiama a ogni richiesta e il rumore è fastidioso | `uninstall.php` le rimuove in F2 |
| La decisione di branding in F5 cambia lo slug | Sfasa Docker, Text Domain, mount e app Flutter | Lo slug è dichiarato invariato in F5; un cambio di slug è un progetto separato |
| La revisione della directory può chiedere modifiche | Normale | Ciclo di review previsto, non è un fallimento |
| WordPress 7.1 in sviluppo locale contro `Requires at least: 6.0` | Test su versione non rappresentativa | La CI copre più versioni; `Tested up to` dichiara solo ciò che è stato provato |
