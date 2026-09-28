# Ledger di esecuzione — WordPress.org readiness

Piano: `docs/superpowers/plans/2026-09-28-wordpress-org-readiness.md`
Branch: `feat/wordpress-org-readiness`
Avvio: 2026-09-28

## Ruling presi durante l'esecuzione

**R1 — Branch dedicata in place, non worktree.** La skill `using-git-worktrees` chiede
un worktree, ma `docker-compose.yml` monta il plugin in un path assoluto e il container
è l'unico posto dove gira PHP. Un worktree avrebbe un path diverso e il banco di prova
avrebbe smesso di vedere il codice. *Costo se sbagliato:* nessuno, l'isolamento reale
è garantito dal branch e `main` resta intatta fino al merge.

**R2 — Il filtro globale sullo stock WooCommerce diventa un'impostazione, disattivata
di default.** L'utente ha dichiarato zero installazioni in produzione, quindi non esiste
backward compatibility da preservare. `woocommerce_can_reduce_order_stock` è un filtro a
livello **ordine**: ritornare `false` fa saltare la riduzione per tutti gli articoli
dell'ordine, non per uno. Non esiste un flag "prodotto gestito da MGWS", quindi l'opzione
(b) della spec è impraticabile senza inventare quel concetto. Un utente che installa
dallo store non deve ritrovarsi con lo stock di Woo disabilitato silenziosamente.
*Costo se sbagliato:* chi si aspetta MGWS come fonte autorevole deve accendere
l'impostazione; il default è documentato in `readme.txt`.

**R3 — Il test di disinstallazione usa processi separati.** `uninstall.php` deve
terminare con `exit` quando `WP_UNINSTALL_PLUGIN` non è definita, e un `exit` in
processo ucciderebbe il runner. Ogni caso gira in un processo PHP figlio che registra
gli effetti collaterali e li scrive da uno shutdown handler, che sopravvive all'`exit`.
*Alternativa scartata:* rendere la guardia `return` invece di `exit`, che è più comodo
ma meno difeso davanti agli scanner della directory.

**R4 — I valori attesi del test sono scritti a mano, non derivati da `MGWS_DB`.** Derivarli
renderebbe il test d'accordo con qualsiasi lista di tabelle `uninstall.php` costruisca,
inclusa una lista che ha dimenticato `mg_pos_shifts`. Il test deve poter dire "manca una
tabella", e solo un elenco indipendente può farlo.

## Correzioni al piano (il piano conteneva fatti errati)

- **`tests/stub/` → `tests/wp-stub/`.** La directory degli stub esistente è
  `tests/wp-stub/`, non `tests/stub/` come scriveva il piano. Il piano indicava anche
  `wp-includes/plugin.php` e simili: unnecessary, gli stub sono funzioni libere in
  un unico file.
- **`admin-inventory.js` non viene mai caricato.** Nessun `wp_enqueue_script` lo
  referenzia. Il piano lo contava fra i file da tradurre; è codice morto e resta intatto.
- **3 `wp_enqueue_script`, non 4** (righe 703, 725, 753), e quindi 3 handle JS.
- **I 18 nomi di tabella** sono `mg_stock_levels`, `mg_stock_moves`, `mg_stock_movements`,
  `mg_pos_idempotency`, `mg_pos_shifts`, `mg_loyalty_cards`, `mg_loyalty_movements`,
  `mg_fornitori`, `mg_employees`, `mg_reorder_rules`, `mg_purchase_orders`,
  `mg_purchase_order_lines`, `mg_receipts`, `mg_receipt_lines`, `mg_backorders`,
  `mg_inventory_count_sessions`, `mg_inventory_count_lines`, `mg_stock_reason_codes`,
  `mg_employees`. Verificati uno per uno sul sorgente.
- **Nessun job cron e nessun transient** del plugin: l'inventario di `uninstall.php` è
  completo con 18 tabelle, 3 option, 2 CPT, 7 capability, 1 user meta.

## Ruling del Task 2

**R5 — La dichiarazione HPOS sta a scope di file, non nel costruttore.** Il piano la
metteva in `MGWS_Plugin::__construct()`. Con `Requires Plugins: woocommerce` WordPress
carica WooCommerce **prima** di questo plugin, quindi `before_woocommerce_init` scatta
mentre Woo gestisce `plugins_loaded`, prima che il singleton venga costruito: la
dichiarazione sarebbe arrivata in ritardo e senza effetto. *Costo se sbagliato:* WooCommerce
segnala il plugin incompatibile con HPOS.

**R6 — `Tested up to: 7.1`.** Il piano affermava che 7.1 non fosse una versione
rilasciata stabilmente e prescriveva di non dichiararla. Era sbagliato:
`api.wordpress.org/core/version-check` riporta 7.1.2 come corrente e il container gira
7.1. Dichiararla è vero. La voce di `todo.md` che chiedeva la verifica su una versione
rilasciata si chiude.

**R7 — `readme.txt` non ha ancora la sezione `== Screenshots ==`.** Il piano la chiedeva
già in F2, ma elencare screenshot che non esistono fa comparire immagini mancanti nella
scheda. La sezione arriva nel Task 7, con le immagini vere.

**R8 — Le route sono 34 sotto `mgws/v1` e 5 sotto `mgws`, non 39 sotto `mgws/v1`.**
Verificato con `grep` su `register_rest_route`. Le 5 sotto il namespace breve sono
`/health`, `/stock/levels`, `/stock/move`, `/orders/{id}/accept` e
`/resolve/barcode/{code}`. La readme riporta la ripartizione reale.

**R9 — L'opzione `mgws_woocommerce_stock_authority` non ha una casella nella pagina
impostazioni.** Il plugin non ha un'infrastruttura di impostazioni: ha una sola
sotto-pagina di WooCommerce. Costruirne una è scope da decidere a parte, non una riga
aggiuntiva. L'opzione si imposta con `update_option()` ed è documentata in
`readme.txt`; il comportamento invasivo, che era il problema, è risolto dal default
off. *Costo se sbagliato:* un gestionale non tecnico non trova il toggle da solo, e la
funzionalità resta scoperta finché non si aggiunge la UI.

**R10 — Il filtro non ha un `apply_filters` di escape hatch.** Solo `get_option`. Una
decisione in più da mantenere non serve a nessuno dei due lettori previsti, e nessun
test la coprirebbe.

## Ruling del Task 3

**R11 — `build-release.sh` copia un elenco esplicito e poi verifica, non "esclude
qualcosa".** Escludere è fragile: basta aggiungere una directory nuova e il pattern di
esclusione la lascia passare. Lo script copia `includes/`, `assets/`, `languages/`,
`LICENSE`, `readme.txt` e `uninstall.php`, poi controlla che nessuno dei percorsi vietati
sia arrivato nella staging **e** nella zip finita. La stessa lista serve per le due fasi.

**R12 — Lo `Stable tag` di `readme.txt` viene confrontato con la versione del plugin.**
Sono la stessa promessa detta due volte, in due file che nessun test mette in relazione.
Il build fallisce se divergono. Verificato: alterare lo `Stable tag` a 2.2.9 fa uscire
con codice 1.

**R13 — La CI linta la produzione, non i test, sulla matrice 8.0-8.3.** I test usano
sintassi che il minimo dichiarato non garantisce, e la matrice serve a presidiare il
contronto con `Requires PHP: 8.0`, che è rivolto agli utenti. I test girano una volta sola
su 8.3. Verificato che in produzione non c'è sintassi 8.1+ (`readonly`, `enum`, `never`,
first-class callable): l'unico match di `\.\.\.)` è `stanza...)` dentro una stringa.

**R14 — Lo step di lint usa `lint_status`, non `status`.** `status` è una variabile
read-only in zsh: chi copia lo step in una shell zsh ottiene un errore invece di un
risultato. Il nome è una difesa, non una preferenza di stile.

## Bug trovati nei miei stessi test (corretti prima di dichiarare verde)

1. La probe non chiamava mai `mgws_uninstall_all()`. In WordPress è `uninstall_plugin()`
   a invocare il callback, non il file. Tutti i casi con la costante definita passavano
   senza fare nulla.
2. L'asserzione sul `require_once` guardava `mg-warehouse-stock.php`, che richiama
   `class-mgws-plugin.php`, non `mgws-db.php`. Ora guarda `uninstall.php`, che è il
   file che deve essere autosufficiente.
3. Il regex di parsing delle query DROP non tollerava i backtick sugli identificatori.
   Corretto a livello di parsing, non di asserzione: l'asserzione resta "quali 18
   tabelle", non "come sono quotate".

## Stato dei task

| Task | Stato | Commit |
| --- | --- | --- |
| 1 — `uninstall.php` con test | fatto | `6c6062e` |
| 2 — header, GPL, `readme.txt`, Woo | fatto | vedi sotto |
| 3 — build zip e CI | fatto | vedi sotto |
| 4 — i18n PHP | da fare | |
| 5 — i18n script admin | da fare | |
| 6 — copertura sicurezza in CI | da fare | |
| 7 — verifica di submission | da fare | |

## Baseline (da ristabilire dopo ogni task)

```
php -l                                                  nessun errore
tests/mgws_contract_test.php                            SUMMARY failures=0 pending=0   (36 gruppi)
tests/assert_mgws_contract_matrix.php                   50 required rows verified
tests/uninstall_test.php                                SUMMARY failures=0             (6 casi)
```
