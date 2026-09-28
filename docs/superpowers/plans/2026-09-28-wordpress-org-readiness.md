# MG Warehouse Stock — WordPress.org Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il plugin `mg-warehouse-stock` pubblicabile nella directory di WordPress.org, senza alterare il contratto `mgws/v1` consumato dall'app Flutter.

**Architecture:** Quattro fasi sequenziali (scaffolding, i18n, verifica, submission). Ogni fase produce un commit e una validazione indipendente. Il repo resta la cartella del plugin montabile in `wp-content/plugins/mg-warehouse-stock`, senza build step.

**Tech Stack:** PHP 8.0+ (sviluppo e test su 8.3.27 via container), WordPress 6.0+, WooCommerce, gettext (`wp.i18n`), GitHub Actions, bash + `zip`.

**Spec:** `docs/superpowers/specs/2026-09-28-wordpress-org-readiness-design.md`

## Global Constraints

- **Il contratto `mgws/v1` non cambia.** Nessun percorso, nome di campo, codice errore, forma di risposta o semantica si modifica in nessuna fase. I 36 gruppi di test in `tests/mgws_contract_test.php` e le 50 righe di `tests/assert_mgws_contract_matrix.php` lo garantiscono e devono restare verdi dopo ogni task.
- **I messaggi di errore delle 39 route REST restano in inglese e non tradotti.** Sono un'API, non UI: l'app Flutter li usa come identificatori stabili. Non sono nel perimetro i18n e non vanno wrappati in gettext.
- **Minimi dichiarati:** `Requires at least: 6.0`, `Requires PHP: 8.0`. Non alzarli oltre a quello che è stato provato.
- **Il path del plugin non cambia** e il mount di `docker-compose.yml` continua a funzionare invariato.
- **Lo slug `mg-warehouse-stock` non cambia** in nessun task. È cablato nel mount Docker, nel Text Domain, nel nome del `.pot` e nelle assunzioni dell'app Flutter.
- **Text Domain:** `mg-warehouse-stock` ovunque, senza eccezioni.
- **Sorgente i18n in inglese.** Ogni stringa UI hardcoded viene riscritta in inglese e wrappata; le stringhe italiane attuali diventano la traduzione `it_IT`. Non si estrae gettext su testo italiano.
- **Nessun PHP locale né composer.** L'unico banco di prova è il container.
- **Non creare test nuovi** oltre a quelli esplicitamente richiesti in questo piano (regola 16 di `OPENCODE.md`); i check di copertura in F4 sono richiesti dalla spec.

## Environment: il banco di prova

Non essendoci PHP sulla macchina, ogni verifica passa dal container, dove il plugin è montato:

```sh
P=/var/www/html/wp-content/plugins/mg-warehouse-stock

# lint
docker exec wordpress_app php -l $P/includes/class-mgws-plugin.php

# test del contratto
docker exec -w $P wordpress_app php tests/mgws_contract_test.php

# matrice del contratto
docker exec -w $P wordpress_app php tests/assert_mgws_contract_matrix.php docs/mgws-v1-contract.md
```

Ambienti: PHP 8.3.27, WordPress 7.1, WooCommerce 11.1.0. `zip` e `unzip` sono disponibili localmente.

**Baseline da non perdere** (verificata il 2026-09-28, da ristabilire dopo ogni task):

```
php -l           → nessun errore di sintassi sui 4 file
mgws_contract_test.php    → SUMMARY failures=0 pending=0   (36 gruppi)
assert_mgws_contract_matrix.php → 50 required rows verified
```

Il runner dei test accetta anche `--list`, `--filter <name>`, `--self-check-failure` e `--fail-on-pending`. I test si dichiarano in `mgws_contract_tests()` come array con chiavi `name`, `description`, `run` (closure `static function (): void`), e opzionale `pending` per i test non ancora implementabili.

## Review Focus

Cinque classi di input o condizioni che la spec implica ma che nessun test esistente esercita, ordinate per probabilità di mordere. Ogni riga ha il test che la blocca assegnato al task che possiede il codice.

1. **Utente senza `WP_UNINSTALL_PLUGIN` definito.** La directory di WordPress.org richiede che `uninstall.php` non distrugga nulla in quel caso, perché il file può essere incluso da strumenti di scansione. Comportamento atteso: ritorno immediato, nessuna tabella caduta. → Task 1, test `uninstall_guards_without_constant`
2. **Disinstalla con WooCommerce disattivato.** `uninstall.php` non deve dipendere da WooCommerce per fare pulizia: se chiama funzioni Woo, la pulizia fallisce e il plugin resta abbandonato nel database. Comportamento atteso: tabelle, option, CPT e capability rimossi lo stesso. → Task 1, test `uninstall_works_without_woocommerce`
3. **Riordini, acquisti, ricezioni, conteggi e dipendenti.** L'inventario completo di 18 tabelle include `table_pos_shifts`, `table_employees`, `table_inventory_count_sessions` e `table_reorder_rules`, che nessun altro task tocca. Se `uninstall.php` dimentica una tabella, il residuo è invisibile nei test esistenti. Comportamento atteso: tutte e 18 assenti dopo la disinstallazione. → Task 1, test `uninstall_drops_all_18_tables`
4. **Intestazione della traduzione con l'utente non en_US.** Un POT senza `Language` o senza `Plural-Forms` fa fallire il caricamento in `it_IT`. Comportamento atteso: l'interfaccia in italiano, identica a quella di oggi. → Task 5, verifica manuale dello step 6
5. **Messaggio di errore REST che diventa traduzione.** Il piano i18n tocca 260 righe in un file da 6.162 che contiene anche i 39 endpoint. Tradurre per sbaglio un codice errore o un messaggio di risposta rompe l'app Flutter, che li tratta come identificatori stabili. Comportamento atteso: il `git diff` di `class-mgws-rest-api.php` limitato a stringhe che non arrivano a schermo, verificato nel Task 4 step 4.

## File Structure

**Creati in F2:**

| File | Responsabilità |
| --- | --- |
| `LICENSE` | Testo GPL-2.0-or-later completo. Nessun codice. |
| `readme.txt` | Scheda della directory: metadati, descrizione, installazione, FAQ, changelog. Coppia con l'header di `mg-warehouse-stock.php` per nome, versione e `Stable tag`. |
| `uninstall.php` | Rimozione completa di tabelle, option, CPT, capability, user meta e order status. È l'unico file PHP eseguito da WordPress fuori dal contesto del plugin. |
| `bin/build-release.sh` | Produce `dist/mg-warehouse-stock-<versione>.zip` con cartella radice `mg-warehouse-stock/`, escludendo ciò che non va nel runtime. |
| `tests/uninstall_test.php` | Bank del test di disinstallazione, con lo stub minimo di WordPress necessario. |
| `tests/stub/wp-includes/*.php` | Stub per le funzioni che `uninstall.php` usa e che il bank esistente non definisce. |
| `languages/mg-warehouse-stock.pot` | Template generato in F4. |
| `languages/mg-warehouse-stock-it_IT.po` / `.mo` | Traduzione italiana in F4. |
| `.github/workflows/ci.yml` | Tre job: lint, test, build. |

**Modificati in F2:** `mg-warehouse-stock.php` (header, `load_plugin_textdomain`, `Requires Plugins`), `includes/class-mgws-plugin.php` (dichiarazione HPOS, avviso WooCommerce mancante, rimozione del filtro stock globale se si applica la decisione G9).

**Modificati in F3/F4:** i 3 script `assets/*.js` effettivamente caricati (`admin-masterdata.js`, `admin-product.js`, `admin-order.js`), più `includes/class-mgws-plugin.php` e `includes/class-mgws-rest-api.php` per le stringhe UI. `assets/admin-inventory.js` **non è mai caricato** da nessun `wp_enqueue_script` e contiene 2 stringhe: è codice morto e si lascia intatto.

**Non toccati:** `includes/mgws-db.php` (nessuna stringa UI; i suoi `table_*()` sono consumati da `uninstall.php` ma non modificati), `docs/mgws-v1-contract.md` (il contratto non cambia), `tests/mgws_contract_test.php` e `tests/assert_mgws_contract_matrix.php` (sono la garanzia del vincolo globale, non si indeboliscono per far passare altro).

---

### Task 1: `uninstall.php` con copertura di test

Il primo deliverable è la rimozione completa. `uninstall.php` è anche il file più delicato del plugin: se sbaglia, distrugge dati di qualcuno. Va costruito con test prima che con codice.

**Files:**
- Create: `uninstall.php`
- Create: `tests/uninstall_test.php`
- Create: `tests/stub/wp-includes/plugin.php`, `tests/stub/wp-includes/option.php`, `tests/stub/wp-includes/capabilities.php`, `tests/stub/wp-includes/post.php`

**Interfaces:**
- Consumes: `MGWS_DB::table_levels()`, `table_moves()`, `table_movements()`, `table_pos_shifts()`, `table_pos_idempotency()`, `table_loyalty_cards()`, `table_loyalty_movements()`, `table_fornitori()`, `table_reorder_rules()`, `table_purchase_orders()`, `table_purchase_order_lines()`, `table_receipts()`, `table_receipt_lines()`, `table_backorders()`, `table_inventory_count_sessions()`, `table_inventory_count_lines()`, `table_stock_reason_codes()`, `table_employees()` — tutti `public static function (): string` in `includes/mgws-db.php`, restituiscono il nome già prefissato con `$wpdb->prefix`.
- Produces: nessuna interfaccia per task futuri. `uninstall.php` non viene incluso da nessun altro file.

- [ ] **Step 1: scrivi il test che fallisce**

Crea `tests/uninstall_test.php` con lo stesso pattern di `tests/mgws_contract_test.php`: `define('ABSPATH', __DIR__ . '/stub/')`, un doppio di `$wpdb` che registra le query in un array invece di eseguirle, un array `$GLOBALS['test_options']`, `$GLOBALS['test_roles']`, `$GLOBALS['test_deleted_posts']`, `$GLOBALS['test_deleted_meta']`.

I test, tutti come funzioni con prefisso `mgws_uninstall_`:

- `mgws_uninstall_guards_without_constant()`: senza `WP_UNINSTALL_PLUGIN` definita, `include 'uninstall.php'` non esegue nessuna query. Asserisce che l'array delle query registrate è vuoto e che le option non sono state toccate.
- `mgws_uninstall_drops_all_18_tables()`: con la costante definita, asserisce che le query registrate contengono `DROP TABLE IF EXISTS` per ognuno dei 18 nomi prodotti dai metodi `MGWS_DB::table_*()`, in ordine qualsiasi.
- `mgws_uninstall_works_without_woocommerce()`: con la costante definita e senza che alcuna funzione Woo sia definita, il file non produce errori fatale e le 18 tabelle vengono comunque cadute. Copre la riga 4 di Review Focus.
- `mgws_uninstall_removes_options_and_capabilities()`: asserisce `delete_option` chiamato per `mgws_caps_version`, `mgws_db_schema_version`, `mgws_pos_turno_obbligatorio`, e che le 7 capability (`mgws_stock_read`, `mgws_stock_move`, `mgws_purchase_approve`, `mgws_supplier_manage`, `mgws_order_accept`, `mgws_manage_credentials`, `mgws_manage_user_permissions`) sono rimosse da tutti i ruoli registrati nel doppio.
- `mgws_uninstall_removes_cpts_and_order_status()`: asserisce che i post di tipo `mg_site` e `mg_warehouse` sono cancellati forzando il post, che il meta `mg_default_site_id` è rimosso dagli utenti, e che l'ordine di rimozione rispetta le dipendenze: prima i post di tipo `mg_warehouse`, poi `mg_site`.
- `mgws_uninstall_hook_is_registered()`: asserisce che `mg-warehouse-stock.php` contiene `register_uninstall_hook(MGWS_PLUGIN_FILE, 'mgws_uninstall_all')`.

Il file esce con `SUMMARY failures=0` e `exit(1)` se ci sono fallimenti, sullo stesso formato del runner esistente.

- [ ] **Step 2: esegui il test per verificare che fallisce**

Run:
```sh
docker exec -w $P wordpress_app php tests/uninstall_test.php
```
Expected: FAIL — `include 'uninstall.php'` non trova il file, oppure fatal `Uncaught Error: Failed opening required 'uninstall.php'`. Conferma che il test fallisce per la ragione giusta e non per un typo.

- [ ] **Step 3: implementa `uninstall.php`**

Intestazione con `if (!defined('WP_UNINSTALL_PLUGIN')) { exit; }` come prima istruzione eseguibile. Poi `require_once __DIR__ . '/includes/mgws-db.php';` e una singola funzione `mgws_uninstall_all()` che, in quest'ordine:

1. Cita i 18 nomi tabella dai metodi `MGWS_DB::table_*()` in un array e li passa a un `DROP TABLE IF EXISTS` ciascuno, con `$wpdb->query()`.
2. `delete_option()` per le 3 option.
3. Per ogni ruolo in `wp_roles()->roles`, rimuove ognuna delle 7 capability.
4. Cancella i post di `mg_warehouse` e poi di `mg_site` con `wp_delete_post($id, true)`, dopo averli raccolti con `get_posts`.
5. Rimuove il meta utente `mg_default_site_id`.
6. `flush_rewrite_rules()`.

Il file non chiama funzioni di WooCommerce: deve funzionare anche con Woo disattivato, altrimenti la pulizia fallisce proprio nell'installazione da cui l'utente sta rimuovendo il plugin. Copre la riga 2 di Review Focus.

- [ ] **Step 4: registra l'uninstall hook**

In `mg-warehouse-stock.php`, accanto a `register_activation_hook`:

```php
register_uninstall_hook(MGWS_PLUGIN_FILE, 'mgws_uninstall_all');
```

`mgws_uninstall_all()` è definita in `uninstall.php`, che WordPress include prima di chiamarla. La funzione va quindi verificata con `function_exists` o definita in un file sempre caricato; il pattern più semplice e robusto è che `uninstall.php` la definisca e `mg-warehouse-stock.php` non la richiami mai direttamente.

- [ ] **Step 5: esegui il test per verificare che passa**

Run:
```sh
docker exec -w $P wordpress_app php tests/uninstall_test.php
docker exec -w $P wordpress_app php -l $P/uninstall.php
```
Expected: `SUMMARY failures=0` e nessun errore di sintassi.

- [ ] **Step 6: verifica che la baseline sia intatta**

Run:
```sh
docker exec -w $P wordpress_app php tests/mgws_contract_test.php
docker exec -w $P wordpress_app php tests/assert_mgws_contract_matrix.php docs/mgws-v1-contract.md
```
Expected: `SUMMARY failures=0 pending=0` e `50 required rows verified`.

- [ ] **Step 7: committa**

```bash
git add uninstall.php mg-warehouse-stock.php tests/uninstall_test.php tests/stub/
git commit -m "aggiunto uninstall.php con rimozione di tabelle, option, CPT, capability e user meta"
```

---

### Task 2: header del plugin, GPL, `readme.txt` e dipendenza WooCommerce

**Files:**
- Create: `LICENSE`, `readme.txt`
- Modify: `mg-warehouse-stock.php`, `includes/class-mgws-plugin.php`

**Interfaces:**
- Consumes: nessuno.
- Produces: `readme.txt` come fonte di verità per i metadati; `MGWS_Plugin::woocommerce_missing_notice()` come metodo privato, non chiamato da altri file.

- [ ] **Step 1: aggiungi `Domain Path`, `Requires Plugins` e il caricamento del text domain**

In `mg-warehouse-stock.php`, aggiungi nell'header:

```
 * Domain Path: /languages
 * Requires Plugins: woocommerce
```

e dopo `require_once`, un `add_action('init', ...)` che invochi `load_plugin_textdomain('mg-warehouse-stock', false, dirname(plugin_basename(MGWS_PLUGIN_FILE)) . '/languages')`.

- [ ] **Step 2: aggiungi la dichiarazione di compatibilità HPOS**

In `includes/class-mgws-plugin.php`, all'inizio del costruttore, prima di qualunque `add_filter`:

```php
add_action('before_woocommerce_init', array($this, 'declare_hpos_compatibility'));

public function declare_hpos_compatibility(): void {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', MGWS_PLUGIN_FILE, true);
    }
}
```

Il `class_exists` evita un fatal quando WooCommerce è disattivato. Senza questa dichiarazione WooCommerce 8.2+ segnala il plugin incompatibile con HPOS, e l'ambiente locale gira 11.1.0.

- [ ] **Step 3: aggiungi l'avviso per WooCommerce mancante**

Metodo privato `woocommerce_missing_notice()` agganciato a `admin_notices`, che stampa un `admin_notice error` dicendo che MGWS richiede WooCommerce e che le funzioni di magazzino non sono disponibili. Non deve fare `wp_die`.

- [ ] **Step 4: rimuovi il filtro globale sullo stock di WooCommerce**

`includes/class-mgws-plugin.php:43` ha `add_filter('woocommerce_can_reduce_order_stock', '__return_false', 10, 2)`, che disattiva la riduzione di stock di WooCommerce per tutto il sito e per tutti i plugin. Sull'installazione singola è corretto; su uno store pubblico rompe silenziosamente altri plugin di inventario.

**Questo step richiede una decisione dell'utente prima di procedere.** La spec raccomanda l'opzione (c): renderlo un'impostazione. Implementazione: nuova option `mgws_wc_stock_reduction_disabled`, default `1` (disabilitato, cioè comportamento di oggi) per le installazioni esistenti e default `1` anche per le nuove, con chiave di opt-in esplicita. Il filtro viene registrato solo se l'opzione è attiva. Se l'utente sceglie (a), il filtro resta invariato e si documenta in `readme.txt`; se sceglie (b), servirebbe un flag "prodotto gestito da MGWS" che oggi non esiste e il task cresce.

Non procedere oltre questo step senza la conferma. Tutti i task successivi sono indipendenti dalla scelta.

- [ ] **Step 5: scrivi `LICENSE`**

Testo integrale di GNU GPL v2 con la clausola "or later". Copialo dalla fonte autorevole, non dai miei riassunti: una licenza abbreviata o alterata è un problema legale, non una formalità.

- [ ] **Step 6: scrivi `readme.txt`**

Formato obbligatorio della directory, in quest'ordine di sezioni:

```
=== MG Warehouse Stock ===
Contributors: vincenzoferrara
Tags: inventory, stock, warehouse, woocommerce, pos
Requires at least: 6.0
Tested up to: <versione realmente verificata>
Requires PHP: 8.0
Stable tag: 2.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
```

`Stable tag` deve essere `2.3.0`, uguale a `MGWS_PLUGIN_VERSION` in `mg-warehouse-stock.php`. Poi short description, `== Description ==`, `== Installation ==`, `== Frequently Asked Questions ==`, `== Screenshots ==`, `== Changelog ==`. Gli `Tags` devono venire dall'elenco controllato dalla directory.

`Tested up to` si scrive solo per la versione effettivamente provata. L'ambiente locale gira WordPress 7.1, che non è una versione rilasciata stabilmente: dichiarare `7.1` sarebbe falso. Dichiarare la massima versione stabile verificata, e registrare in `todo.md` la verifica su una versione rilasciata.

- [ ] **Step 7: verifica**

```sh
docker exec -w $P wordpress_app php -l $P/mg-warehouse-stock.php
docker exec -w $P wordpress_app php -l $P/includes/class-mgws-plugin.php
docker exec -w $P wordpress_app php tests/mgws_contract_test.php
docker exec -w $P wordpress_app php tests/assert_mgws_contract_matrix.php docs/mgws-v1-contract.md
```

Expected: nessun errore di sintassi, `failures=0 pending=0`, `50 required rows verified`. Poi controlla coerenza: `grep Stable tag readme.txt` e `grep MGWS_PLUGIN_VERSION mg-warehouse-stock.php` devono dare la stessa versione.

- [ ] **Step 8: committa**

```bash
git add LICENSE readme.txt mg-warehouse-stock.php includes/class-mgws-plugin.php
git commit -m "aggiunti licenza GPL, readme.txt, header Requires Plugins, dichiarazione HPOS e avviso WooCommerce mancante"
```

---

### Task 3: script di build della zip e CI

**Files:**
- Create: `bin/build-release.sh`, `.github/workflows/ci.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `mg-warehouse-stock.php` per la versione, che lo script estrae con `grep`.
- Produce: `dist/mg-warehouse-stock-<versione>.zip`, la cui cartella radice è `mg-warehouse-stock/`.

- [ ] **Step 1: scrivi `bin/build-release.sh`**

Estrae la versione con `grep -oP '(?<=define\(.MGWS_PLUGIN_VERSION., .)[0-9.]+(?=.))' mg-warehouse-stock.php`. Poi crea `dist/` e una directory di staging `mg-warehouse-stock/`, vi copia solo ciò che serve a runtime con `rsync` o `cp` espliciti: `mg-warehouse-stock.php`, `includes/`, `assets/`, `languages/`, `LICENSE`, `readme.txt`, `uninstall.php`. Esclude esplicitamente `.git`, `bin`, `docs`, `tests`, `dist`, `.github`, `OPENCODE.md`, `.gitignore`, `.write_test`, `tests/_tmp*`. Infine `zip -r` dalla cartella di staging, così la radice è `mg-warehouse-stock/`.

Lo script deve fallire con codice diverso da zero se la versione non è estratta o se la zip non contiene `mg-warehouse-stock/mg-warehouse-stock.php`.

- [ ] **Step 2: verifica la zip**

```sh
bash bin/build-release.sh
unzip -l dist/mg-warehouse-stock-2.3.0.zip
```

Expected: la lista contiene `mg-warehouse-stock/mg-warehouse-stock.php` e nessun percorso con `.git`, `tests`, `docs` o `bin`.

- [ ] **Step 3: aggiungi `dist/` al `.gitignore`**

Il file c'è già da F1; verifica solo che `dist/` sia presente e non venga committato.

- [ ] **Step 4: scrivi `.github/workflows/ci.yml`**

Tre job su `push` e `pull_request` verso `main`:

- `lint`: usa `shivammathur/setup-php` con PHP 8.0, 8.1, 8.2, 8.3 in matrice; gira `php -l` su ogni file PHP tracciato, escluso `tests/`.
- `test`: PHP 8.3; gira `tests/mgws_contract_test.php`, `tests/assert_mgws_contract_matrix.php` e `tests/uninstall_test.php`, ognuno in un step separato, e fallisce se l'exit code non è zero.
- `build`: PHP 8.3; esegue `bash bin/build-release.sh` e carica `dist/*.zip` con `actions/upload-artifact`.

I test non dipendono da WordPress né da database: sono self-contained con stub, quindi non serve alcun service container.

- [ ] **Step 5: verifica e committa**

```sh
bash bin/build-release.sh
git status --short
```

Expected: `dist/` non compare fra i file non tracciati da committare.

```bash
git add bin/build-release.sh .github/workflows/ci.yml .gitignore
git commit -m "aggiunti script di build della zip e CI con lint su matrice PHP 8.0-8.3"
```

---

### Task 4: internazionalizzazione del PHP

**Files:**
- Modify: `includes/class-mgws-plugin.php` (circa 260 righe con stringhe UI), `includes/class-mgws-rest-api.php` (solo stringhe di UI, mai i messaggi di errore REST)
- Create: `languages/mg-warehouse-stock.pot`, `languages/mg-warehouse-stock-it_IT.po`, `languages/mg-warehouse-stock-it_IT.mo`

**Interfaces:**
- Consumes: `__()`, `_e()`, `esc_html__()`, `esc_attr__()`, `_n_noop()` di WordPress, con text domain `mg-warehouse-stock`.
- Produces: `languages/mg-warehouse-stock.pot` consumato da `bin/make-pot.sh` in Task 5.

- [ ] **Step 1: individua le stringhe UI da tradurre**

```sh
grep -nE "'[A-Z][a-z]+ [^']{3,}'" includes/class-mgws-plugin.php
```

Non tradurre: stringhe di `WP_Error` dentro le route REST, chiavi di array, valori confrontati con `===`, nomi di hook, SQL, chiavi di meta e di option. La regola è: se la stringa può finire a schermo, si traduce; se è un identificatore, no.

- [ ] **Step 2: sostituisci le stringhe hardcoded nelle pagine admin**

`render_masterdata_page()` e le altre pagine admin hanno testo italiano in `echo` diretti: `Magazzino`, `Ricarica`, `+ Sede`, `Cerca (sede, magazzino, stanza...)`, `Espandi`, `Comprimi`, `Permessi insufficienti`, e i `wp_die('...')`.

Ogni stringa diventa la funzione di escaping appropriata: `esc_html__( 'Magazzino', 'mg-warehouse-stock' )` per testo in output, `esc_attr__( 'Cerca (sede, magazzino, stanza...)', 'mg-warehouse-stock' )` per attributi, `esc_html_e()` per output diretto.

- [ ] **Step 3: traduci l'etichetta dell'ordine con gettext**

`register_order_status()` usa `_n_noop()` con testo italiano hardcoded. Sostituisci con la forma inglese `_n_noop('Accepted <span class="count">(%s)</span>', 'Accepted <span class="count">(%s)</span>', 'mg-warehouse-stock')`, coerente con gli altri testi che diventano sorgente inglese.

- [ ] **Step 4: non toccare i messaggi di errore REST**

Verifica esplicita, non per fiducia:

```sh
git diff --stat includes/class-mgws-rest-api.php
```

Le route REST restano invariate. Se il diff è vuoto o contiene solo stringhe che non arrivano a schermo, va bene; se contiene un codice errore o un campo, va annullato. Copre la riga 3 di Review Focus.

- [ ] **Step 5: verifica che la baseline sia intatta**

```sh
docker exec -w $P wordpress_app php -l $P/includes/class-mgws-plugin.php
docker exec -w $P wordpress_app php tests/mgws_contract_test.php
docker exec -w $P wordpress_app php tests/assert_mgws_contract_matrix.php docs/mgws-v1-contract.md
```

Expected: `failures=0 pending=0` e `50 required rows verified`. Se i test falliscono, una stringa di errore REST è stata tradotta per errore: ripristinala.

- [ ] **Step 6: committa**

```bash
git add includes/class-mgws-plugin.php includes/class-mgws-rest-api.php languages/
git commit -m "tradotte in inglese le stringhe UI del plugin e wrappate in gettext"
```

---

### Task 5: internazionalizzazione degli script admin

**Files:**
- Modify: `assets/admin-masterdata.js` (296 stringhe), `assets/admin-product.js` (127), `assets/admin-order.js` (55)
- Modify: `includes/class-mgws-plugin.php` (dipendenza `wp-i18n` in `wp_enqueue_script`)
- Create: `bin/make-pot.sh`

**Interfaces:**
- Consumes: `wp.i18n.__( string, 'mg-warehouse-stock' )` e `wp.i18n._n( single, plural, number, 'mg-warehouse-stock' )`, esposti come globali dal gestore `wp-i18n`.
- Produce: `languages/mg-warehouse-stock.pot` con riferimenti `file:linea`.

- [ ] **Step 1: aggiungi `wp-i18n` come dipendenza degli script**

I tre `wp_enqueue_script` in `enqueue_admin_assets()` hanno `array('jquery')` come dipendenze: righe 703, 725 e 753. Cambiali in `array('jquery', 'wp-i18n')`. Senza questo, `wp.i18n` è undefined e il primo `__()` a runtime lancia `TypeError`, rompendo ogni pagina admin.

Verifica dopo il cambio:

```sh
grep -c "wp-i18n" includes/class-mgws-plugin.php
```
Expected: `3`, una per script.

- [ ] **Step 2: sostituisci le stringhe negli script**

I 3 handle sono `mgws-admin-master`, `mgws-admin-product` e `mgws-admin-order`. Ogni stringa passata a `.text('...')` diventa `.text(wp.i18n.__('...', 'mg-warehouse-stock'))`. Le stringhe usate come placeholder diventano `.attr('placeholder', wp.i18n.__('...', 'mg-warehouse-stock'))`.

**Non tradurre le chiavi di traduzione stesse nei nomi di evento CSS**: `#mgws-master-reload`, `#mgws-master-tree` e simili restano invariati, perché il selettore e l'ID devono corrispondere al PHP.

**Non toccare `esc()`** in `admin-masterdata.js:5`, `admin-order.js` e `admin-product.js`. Sono 65 usi di escaping manuale già corretti; si riusano, non si sostituiscono con `wp.i18n`.

- [ ] **Step 3: aggiungi `bin/make-pot.sh`**

Genera il POT chiamando WP-CLI se disponibile (`wp i18n make-pot . languages/mg-warehouse-stock.pot --domain=mg-warehouse-stock --exclude=tests,bin,docs,dist,.github`) e, in assenza di WP-CLI, con un parser PHP che scansione `__()`, `_e()`, `esc_html__()`, `esc_attr__()` in `includes/` e `wp.i18n.__()`, `wp.i18n._n()` in `assets/`.

L'intestazione del POT deve contenere `Project-Id-Version: MG Warehouse Stock 2.3.0`, `MIME-Version`, `Content-Type: text/plain; charset=UTF-8`, `Language-Team`, `X-Domain: mg-warehouse-stock`. Copre la riga 5 di Review Focus.

- [ ] **Step 4: genera il POT e la traduzione italiana**

```sh
bash bin/make-pot.sh
```

Poi crea `mg-warehouse-stock-it_IT.po` a partire dal POT, riempiendo `msgstr` con le stringhe italiane che il plugin mostra oggi: `Magazzino`, `Ricarica`, `Espandi`, `Comprimi`, `Cerca (sede, magazzino, stanza...)`, `Permessi insufficienti`, e così via. L'intestazione `it_IT` deve avere `Language: it_IT` e `Plural-Forms: nplurals=2; plural=(n != 1);`.

Compila il `.mo` con `msgfmt` se disponibile; altrimenti tramite `wp i18n make-po`, che è già nel banco di prova del container WordPress.

- [ ] **Step 5: verifica che la baseline sia intatta**

```sh
docker exec -w $P wordpress_app php tests/mgws_contract_test.php
docker exec -w $P wordpress_app php tests/assert_mgws_contract_matrix.php docs/mgws-v1-contract.md
```

Expected: invariati. Il JavaScript non è copero dai test PHP, quindi questa verifica non basta: serve il test manuale del Task 6.

- [ ] **Step 6: verifica manuale dell'interfaccia in italiano**

Nel browser, dentro Docker, apri una pagina admin del plugin con la lingua del sito impostata su italiano e controlla che Magazzino, il pulsante Ricarica e i messaggi del pannello siano in italiano e che la pagina non lanci errori in console. Con la lingua su inglese le stesse etichette devono comparire in inglese. Copre la riga 5 di Review Focus.

- [ ] **Step 7: committa**

```bash
git add assets/ includes/class-mgws-plugin.php bin/make-pot.sh languages/
git commit -m "aggiunta traduzione agli script admin con wp-i18n, generazione POT e traduzione it_IT"
```

---

### Task 6: check di copertura di sicurezza in CI

Il codice è già corretto: 16 handler AJAX protetti, zero `innerHTML`, 12 `.html()` statiche. Il deliverable di questo task non è una correzione, è rendere quella verifica **ripetibile**, così un handler nuovo senza protezione fa fallire la CI invece di passare inosservato.

**Files:**
- Create: `tests/security_coverage_test.php`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nessuno. Lo script analizza il sorgente come testo.
- Produce: exit code 0 se la copertura è completa, 1 altrimenti.

- [ ] **Step 1: scrivi il test che fallisce**

Crea `tests/security_coverage_test.php` che legge `includes/class-mgws-plugin.php` come testo e, per ciascuno dei 16 `add_action('wp_ajax_...', ...)`:

1. Estrae il nome del metodo handler dalla registration.
2. Estrae il corpo del metodo con un parser di graffi che bilancia `{` e `}`.
3. Determina se il corpo ha protezione diretta (`wp_verify_nonce` o `check_ajax_referer` **e** `current_user_can`), altrimenti segue una delegazione a metodi privati del tipo `require_ajax_nonce_any`, `require_admin_nonce`, `require_admin_delete_caps`, `can_manage_master_data`, fino a due livelli di profondità, con lo stesso criterio.
4. Fallisce se nessuno dei due percorsi soddisfa il criterio.

Aggiungi anche due asserzioni sulla parte JavaScript:

- zero occorrenze di `innerHTML` in `assets/*.js`.
- ogni chiamata `.html(` il cui primo argomento è una stringa letterale non contiene `${`.

Elenca i 16 nomi attesi in una costante e fallisci anche se un handler atteso non è più registrato, così una rimozione non passa inosservata.

- [ ] **Step 2: esegui il test per verificare che passa**

```sh
docker exec -w $P wordpress_app php tests/security_coverage_test.php
```

Expected: PASS con `16/16 handler protetti` e exit 0. Se fallisce, il codice ha un buco reale: NON aggiustare il test per farlo passare, indaga e correggi il codice.

- [ ] **Step 3: verifica che il test fallisca davvero quando deve**

Copia temporaneamente il file, rimuovi la riga `require_admin_delete_caps();` da `ajax_delete_site`, rilancia il test, e ripristina. Expected: FAIL su `mgws_delete_site`. Questo passaggio conferma che il test ha denti e non è un no-op verde.

- [ ] **Step 4: aggiungi il test alla CI**

```yaml
- name: Security coverage
  run: php tests/security_coverage_test.php
```

- [ ] **Step 5: verifica e committa**

```sh
docker exec -w $P wordpress_app php tests/security_coverage_test.php
git status --short
```

Expected: PASS, e il file di `includes/` non deve risultare modificato dopo il ripristino del passo 3.

```bash
git add tests/security_coverage_test.php .github/workflows/ci.yml
git commit -m "aggiunto check di copertura degli handler AJAX e dei renderer JS in CI"
```

---

### Task 7: verifica di submission

Task finale. Produce i materiali per la directory, non la pubblicazione.

**Files:**
- Modify: `readme.txt` (short description, tag, `Tested up to`, screenshot)
- Create: `languages/screenshot-1.png` e successive

**Interfaces:**
- Consumes: `bin/build-release.sh` dal Task 3.
- Produce: la zip finale e una checklist di invio.

- [ ] **Step 1: riverifica che lo slug sia libero**

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://api.wordpress.org/plugins/info/1.0/mg-warehouse-stock.json
```
Expected: `404`, che con `{"error":"Plugin not found."}` significa libero. Uno slug occupato risponde `200`. Se risponde `200`, lo slug è preso: fermati e apri una voce in `todo.md`, non rimenare il nome.

- [ ] **Step 2: verifica l'installazione pulita**

```sh
bash bin/build-release.sh
```

Poi, in un WordPress pulito con WooCommerce, installa la zip, attiva il plugin e controlla che le tabelle si creino e che l'avviso HPOS non compaia. Verifica assente: qualunque errore PHP nel log di debug.

- [ ] **Step 3: cattura gli screenshot**

Almeno 4, a 1280px, in inglese: la pagina Magazzino con l'albero sedi/magazzini/stanza/scaffale/mensola, la scheda prodotto con lo stock MGWS, la pagina ordine con lo stato Accepted, e il pannello di riordino o acquisti. Salvali come `screenshot-1.png` in `screenshot-2.png` dentro `assets/screenshots/`, e referenziali in `readme.txt` nella sezione `== Screenshots ==` nell'ordine in cui appaiono.

- [ ] **Step 4: finalizza `readme.txt`**

Allinea short description e `Tags` all'elenco reale della directory. `Stable tag` resta `2.3.0`. Compila `== Changelog ==` con una sola voce per `2.3.0`. Rimuovi il riferimento al filtro sullo stock di WooCommerce se la decisione del Task 2 step 4 lo ha reso opzionale; se resta invariato, dichiaralo apertamente in `== Description ==`.

- [ ] **Step 5: verifica finale e committa**

```sh
bash bin/build-release.sh
unzip -l dist/mg-warehouse-stock-2.3.0.zip
docker exec -w $P wordpress_app php tests/mgws_contract_test.php
docker exec -w $P wordpress_app php tests/assert_mgws_contract_matrix.php docs/mgws-v1-contract.md
docker exec -w $P wordpress_app php tests/uninstall_test.php
docker exec -w $P wordpress_app php tests/security_coverage_test.php
```

Expected: 5 righe di output, tutte verdi, con `failures=0 pending=0` e `50 required rows verified`.

```bash
git add readme.txt assets/screenshots/
git commit -m "completata la scheda della directory con screenshot e descrizione finale"
```

- [ ] **Step 6: aggiorna la wiki**

Aggiorna `log.md` con cosa è stato fatto e i file toccati, e `todo.md` rimuovendo le voci `Plugin:` chiuse. Registra in `todo.md` la verifica su una versione WordPress rilasciata, che resta aperta perché l'ambiente locale gira 7.1.

---

## Self-Review

**Copertura della spec:** G1 → Task 2 step 5. G2 → Task 2 step 6. G3 → Task 1. G4 → Task 4 e Task 5. G5 → Task 2 step 1 e 3. G6 → Task 3. G7 → Task 3 step 1. G8 → Task 2 step 2. G9 → Task 2 step 4, con decisione richiesta. Sette criteri di accettazione F2: cinque in Task 1-3, i due su disinstallazione e avviso Woo in Task 1 e 2. F3: cinque criteri in Task 4-5. F4: tre criteri in Task 6. F5: tre criteri in Task 7. Le 9 lacune e tutti i criteri di accettazione hanno un task.

**Type consistency:** `MGWS_DB::table_*()` sono tutti `public static function (): string` in `includes/mgws-db.php`, verificati uno per uno, e il piano li cita con lo stesso nome del sorgente. `mgws_uninstall_all()` è il nome del callback in `register_uninstall_hook` e quello definito in `uninstall.php`. I 3 handle JS sono gli stessi fra `wp_enqueue_script` e Task 5; `mgws-admin-inventory` non viene citato come handle perché non è caricato. `WP_UNINSTALL_PLUGIN` è la costante reale di WordPress. L'helper JS si chiama `esc()` in `admin-masterdata.js:5`, `admin-order.js` e `admin-product.js`, mai `escapeHtml`.

**Correzioni applicate durante il self-review:** il piano nella prima stesura affermava 4 `wp_enqueue_script` e 4 handle JS, e contava `admin-inventory.js` fra i file da tradurre. La verifica sul sorgente dà 3 `wp_enqueue_script` (righe 703, 725, 753) e nessun riferimento a `admin-inventory` in `includes/`: quel file è codice morto. Il piano ora riflette la realtà e lascia quel file intatto.

**Proporzione:** 7 task, ~40 step. La parte più corposa è Task 5, che è dove il volume è reale: 480 stringhe non si possono elencare in un piano senza diventare una trascrizione.

**Un punto che il piano non scioglie e non può:** il Task 2 step 4 dipende da una decisione di prodotto dell'utente. È segnalato come bloccante in-place, non nascosto in una nota.
