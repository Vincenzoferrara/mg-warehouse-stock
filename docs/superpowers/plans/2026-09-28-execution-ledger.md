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
  `mg_inventory_count_sessions`, `mg_inventory_count_lines`, `mg_stock_reason_codes`.
  Verificati uno per uno sul sorgente.
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

## Ruling del Task 4 (i18n PHP e template di traduzione)

**R15 — La premessa della specifica sui messaggi REST era sbagliata.** La spec diceva che
`class-mgws-rest-api.php` era già in inglese. Non lo era: **10 stringhe rivolte a chi
chiama l'API erano in italiano**, più un'undicesima nota d'ordine. Sono state tradotte.
*Perché non è una scelta di gusto:* un plugin con sorgente inglese che risponde in
italiano a un client API è un difetto, non una localizzazione. Il caller non ha modo di
sapere che il messaggio è in una lingua che non ha chiesto. *Cosa non è stato toccato:* i
**codici** di errore. Il contratto è sui codici — è quelli che il test asserisce e quelli
che un client deve poter confrontare. Il testo è asserito solo per assenza, quindi la
formulazione è libera. *Costo se sbagliato:* nessuno per i client che leggono il codice;
per chi legge il testo, il comportamento migliora.

**R16 — I commenti italiani nel REST restano.** Sono 8 passaggi, tutti commenti di
spiegazione del design. Tradurli non dà nulla a un utente finale e toccare ~2000 righe di
commenti a mano introduce rischio di corruzione senza guadagno. Il confine applicato è:
**solo ciò che un utente o un client può leggere viene tradotto.**

**R17 — "turno" resta nei nomi di campo, diventa "shift" in prosa.** `turno` è il termine
del dominio dell'app e compare in identificatori (`turno_obbligatorio`, `_turno_id`) e nel
contratto. Rinominarli romperebbe l'app companion. Nelle frasi inglesi però "open a new
turno" non si legge: lì è "shift". *Costo se sbagliato:* nessuno; il dominio resta
riconoscibile.

**R18 — Il banco di prova aveva bisogno degli stub gettext.** Aggiungere `__()` al REST ha
fatto fallire 2 gruppi del contract test con `Call to undefined function __()`. È un buco
del banco di prova, non del codice, come lo stub `register_uninstall_hook` del Task 1.
Gli stub `__`, `esc_html__`, `esc_attr__`, `_x`, `_n_noop` **restituiscono la stringa
sorgente invariata**, che è ciò che WordPress fa senza catalogo caricato. Un test che
caricasse un `.mo` vero starebbe testando una traduzione, non il codice.
*Gruppi contract: 36 → 37, più 35 stub.*

**R19 — Il `.pot` lo genera `bin/make-pot.php`, non `xgettext`.** Il `xgettext` di questo
ambiente **scarta silenziosamente ogni carattere multibyte** dalle stringhe PHP, accenti
compresi: `Caffè` diventava `Caff`, `Site → Warehouse` diventava `Site  Warehouse`, e le
frecce sparivano lasciando spazi doppi. Il risultato sembrava un `.pot` valido e `msgfmt`
lo compilava senza complaint. Un traduttore avrebbe ricevuto stringhe sbagliate senza
poterlo notare. La sostituzione è un estrattore basato su `token_get_all()`, che non può
sbagliare in quel modo. Non è una preferenza: è l'unica delle due opzioni corretta.
*Verificato:* il `.pot` generato conserva tutte e 10 le frecce; `msgfmt` lo compila; le
117 chiavi `(msgctxt, msgid)` sono tutte univoche.

**R20 — `xgettext` non è nel container e `git` non è nel container.** Lo scandisce l'albero
invece di chiedere `git ls-files`, così lo script gira in CI, nel container e su una zip
scompattata. `xgettext` non è installato nel container `wordpress_app`: confermato prima
di scegliere l'estrattore, non dopo.

**R21 — Rigenerare il `.pot` non produce mai un diff.** `POT-Creation-Date` viene ripreso
dal file esistente a meno che la tabella delle stringhe sia cambiata. Un timestamp che
cambia a ogni run trasforma ogni rigenerazione in una revisione su una data che a nessuno
interessa. Verificato: due run consecutivi producono file byte-identici.

**R22 — L'estrattore fallisce rumorosamente su una stringa dinamica.** Se trova
`__('...' . $var)` o un msgid interpolato, esce con codice 1 e il nome del file e della
riga. Una stringa non estraibile non è traducibile e resterebbe inglese **in silenzio**:
è il fallimento che costa di più e che nessuno vedrebbe. *Mutation test:* aggiungere una
chiamata `__()` dinamica fa fallire il comando; ripristinando, torna verde.

**R23 — Esiste `--check`, ed è in CI.** Un `.pot` invecchiato dopo una nuova `__()` spedisce
una stringa che nessun traduttore vedrà mai, e l'omissione è invisibile. `php bin/make-pot.php
--check` confronta solo la tabella delle stringhe, ignorando il timestamp, ed è agganciato
al job `test`, da cui dipende il `build`: una release non può uscire con il catalogo
vecchio. *Mutation test verificato.*

**R24 — `Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;` resta il placeholder.** Un
template non può dichiarare una regola plurale: quella giusta cambia per lingua
(arabo, giapponese). Per questo `msgfmt --check` lo segnala come errore, ed è il risultato
atteso per **qualsiasi** `.pot`, non un difetto: tolta quella riga, `--check` esce 0 con le
sole avvertenze sui placeholder d'intestazione che ha ogni template. `msgfmt -o /dev/null`
compila il file. Il valore è commentato nello script.

**R25 — La verifica dell'i18n non può essere una lista di parole.** La prima passata ha
cercato un elenco scritto a mano di parole italiane e ha riportato "zero residui" mentre 14
stringhe vere erano ancora in italiano. Il metodo che regge è **estrarre il testo visibile e
i valori degli attributi** (`placeholder`, `title`, `alt`, `aria-label`, `value`), scartando
i letterali già passati in gettext, e poi rivedere l'elenco a mano. *Costo dell'errore:* una
verifica che dà falso verde è peggio di nessuna verifica.

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
4. Il censimento iniziale dei messaggi REST usava `new WP_Error\('[a-z_]+', *'[^']*'` e
   quindi **non vedeva** le chiamate con un cast o un fallback `??`. Le quattro stringhe più
   importanti erano proprio in quella forma: il censimento riportava "tutto in inglese".
   Le ho trovate solo perché un'altra ricerca, più larga, le ha fatte uscire. Un pattern
   che risponde "zero" va sempre verificato con un secondo metodo, non con la conferma
   che non ha trovato niente.
5. La verifica dei text domain con regex segnalava 7 sedi "sbagliate" in
   `class-mgws-plugin.php`: erano le chiamate `_x()`, dove il dominio è il **terzo**
   argomento e non il secondo. Il codice era corretto, il controllo era sbagliato.
   Stessa lezione del punto 4, da un'altra parte.
6. Il primo `read_arguments()` restituiva l'indice 1 come fosse il contesto o il plurale,
   mentre per `__()` è il text domain, e ignorava gli argomenti concatenati. Riscritto: la
   funzione restituisce un valore per argomento, `null` quando l'argomento non è un
   letterale.

## Stato dei task

| Task | Stato | Commit |
| --- | --- | --- |
| 1 — `uninstall.php` con test | fatto | `6c6062e` |
| 2 — header, GPL, `readme.txt`, Woo | fatto | `9e9a304` |
| 3 — build zip e CI | fatto | `4cd5c58` |
| 4 — i18n PHP e `.pot` | fatto | vedi sotto |
| 5 — i18n script admin | da fare | |
| 6 — copertura sicurezza in CI | da fare | |
| 7 — verifica di submission | da fare | |

## Baseline (da ristabilire dopo ogni task)

```
php -l                                                  nessun errore
tests/mgws_contract_test.php                            SUMMARY failures=0 pending=0   (37 gruppi)
tests/assert_mgws_contract_matrix.php                   50 required rows verified
tests/uninstall_test.php                                SUMMARY failures=0             (6 casi)
bin/make-pot.php --check                                is up to date (117 strings)
bin/build-release.sh                                    20 files, 2.3.0
```

## Cosa non è stato verificato

- **Il lookup gettext a runtime.** `bindtextdomain()` non esiste nel PHP del container
  (`Call to undefined function`), quindi non ho potuto provare che `__()` restituisce una
  traduzione compilata. È verificato che il `.pot` **compila** (`msgfmt -o`), che le
  stringhe multibyte sopravvivono e che un `.po` derivato torna indietro intatto
  (`msgcat`). Il passaggio runtime resta non provato qui.
- **`msgunfmt` su un `.mo` vuoto** restituisce 0 msgid: non è un difetto, è che un `.mo`
  senza traduzioni non contiene stringhe. Serve il test di cui sopra per chiuderlo.
