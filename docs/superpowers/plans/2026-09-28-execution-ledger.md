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

## Ruling del Task 5 (i18n degli script di amministrazione)

**R26 — `wp-i18n` è dichiarato esplicitamente, anche se il core lo aggiunge da sé.**
`wp_set_script_translations()` registra le traduzioni e core inserisce `wp-i18n` tra le
dipendenze in modo idempotente: dichiararlo a mano sembra ridondante. Resta dichiarato nelle
3 chiamate `wp_enqueue_script`, insieme a `jquery` e agli altri, per due motivi: la
dipendenza sta dove stanno le altre, e `bin/make-pot.php` deve poter contare le chiamate
gettext del file senza dover conoscere le regole interne del core. *Alternativa scartata:*
lasciare che se ne occupi il core, che funziona ma rende la dipendenza invisibile a chi
legge.

**R27 — `wp_set_script_translations()` per ciascuno dei 3 handle, non una volta sola.**
`admin-masterdata`, `admin-order` e `admin-product` hanno handle distinti e il dominio
`mg-warehouse-stock`. Senza la chiamata per handle, le stringhe di quei file resterebbero
inglesi per sempre anche con un `.mo` installato: il `.pot` le contiene, ma nessuno le cerca.

**R28 — In JavaScript `\xNN` è un code point, in PHP è un byte: i due decodificatori
divergono di proposito.** `\xE8` dentro una stringa PHP è il singolo byte `0xE8`;
`"\xE8"` in JS è il code point U+00E8 e va memorizzato come i suoi due byte UTF-8. Il
decodificatore JS usava `chr()`, che produceva un `0xE8` isolato: **UTF-8 non valido**, che
`msgfmt` compila senza complaint e che ogni strumento di lettura trasforma in `�`. Il
risultato era `msgid "Caf\ufffd"` invece di `Cafè`. Corretto con `mb_chr()` nel ramo JS
**solo**; `literal_value()` PHP continua a usare `chr()` e il commento dice perché, perché
è il punto in cui un "allineamento"fra i due romperebbe la codifica.
*Verificato:* 11 casi di decodifica, accento letterale, `\uXXXX`, `\u{...}`, `\xNN` minuscolo
e maiuscolo, escape ignoto, apostrofo scappato, doppi apici, `\n`, plurale accentato,
`_x()` con contesto.

**R29 — I riferimenti nel `.pot` erano percorsi assoluti della macchina di build.** Difetto
presente dal Task 4, non introdotto qui: le References erano
`/var/www/html/wp-content/plugins/mg-warehouse-stock/includes/class-mgws-plugin.php`. Difetti
su tre piani: rivela il filesystem di chi ha compilato, non è riproducibile, e **il
`--check` di CI fallirebbe**, perché la CI gira in `/home/runner/work/...` e produrrebbe
un file diverso da quello committato. Corretto facendo girare l'estrattore su un percorso
**relativo al plugin** e passando un `$label` separato a chi legge il file. *Verificato:*
`--check` esce 0 sia dal path di sviluppo sia da `/tmp/potmut`, un path completamente
diverso, che con i percorsi assoluti sarebbe fallito.

**R30 — Tre `msgfmt` "duplicate message definition" non erano un difetto del tooling.**
`__('room')` e il `msgid "room"` di `_n('room','rooms',…)` sono la stessa chiave
`(msgctxt, msgid)`. La correzione non è un trucco sul generatore: è che
`Delete %s "%s"?` con uno slot per l'etichetta **non è traducibile**, perché impedisce al
traduttore di riordinare e di accordare la frase. Sostituito con tre messaggi completi
(`Delete the room "%s"?`, `...rack "%s"?`, `...shelf "%s"?`). *Perché conta:* la duplicazione
che `msgfmt` segnalava era il sintomo di un testo scritto male.

**R31 — Il prefisso di `JS_GETTEXT_FUNCTIONS` consumava il nome della funzione.**
`substr($code, $i, 10)` per `wp.i18n.` consuma esattamente i primi 10 caratteri del nome
stesso, quindi la tabella cercava `__('Save',` dentro `wp.i18n.__(` e non trovava nulla:
**0 stringhe JS estratte**, con il totale fermo a 117 mentre il sorgente ne aveva 155.
Corretto con `strlen('wp.i18n.')`. *Perché è una sentenza e non una nota:* l'unico sintomo
osservabile era "il totale non cambia", che è indistinguibile da "non ho toccato niente".

**R32 — Le due verifiche sul testo italiano erano insufficienti, e una delle due lo era due
volte.** La lista di parole ha mancato 8 stringhe (`Salvato`, `Collegato`, `Rimosso`,
`Rimozione…`, `Eliminazione…`×3, `Eliminato`): sei perché il filtro che scarta gli
identificatori accettava anche le maiuscole, e due perché le parole mancavano proprio
dall'elenco. Le prime 7 sono state trovate dalla lista **solo dopo** aver corretto il filtro;
`Eliminato` è stata trovata **solo** dall'inventario manuale. La prova che chiude il cerchio
non è la lista: è l'asserzione che **ogni letterale leggibile del JS è un `msgid` del
catalogo** — 146/146, con esclusione esplicita e motivata dei contratti macchina
(`data-*-id=`, `Escape`, `change keyup`, selettori CSS, chiavi di `localStorage`).
*La lista resta, ma come controllo secondario che ordina l'output, non come verdetto.*

**R33 — `admin-order.js` leggeva un numero dal proprio output tradotto.** La riga 217
estraeva `/Mancano:\s*(\d+)/` dal testo che la pagina si era appena disegnata. Con la
traduzione, la regex non trova più niente: la funzione di "tempo rimanente" semplicemente
smetterebbe di calcolare, in silenzio. Sostituita con la lettura dell'attributo
`data-mgws-remaining`, che è un contratto macchina. *L'attributo non esisteva:* è la
modifica deliberata. *Costo dell'errore se non trovato:* silenzioso, e nessuna verifica
basata su testo lo avrebbe visto.

**R34 — Idem per le due `indexOf('Impossibile eliminare')` in `admin-masterdata.js`.**
Entrambi i lati erano italiani a `6c6062e`. La traduzione del Task 4 li ha resi **permanentemente
falsi**: `window.alert` era già spento da allora, prima che la riga venisse toccata. Sostituite
con un confronto sul codice di errore `resp.data.code === 'mgws_not_deletable'`, che è il
contratto reale. *Nota:* le due regressioni R33 e R34 sono state introdotte da me e sono
state scoperte solo perché la verifica confrontava i valori letterali prima e dopo, non perché
fosse rotta qualcosa.

**R35 — Un template literal con `${}` viene rifiutato, non ignorato.**
`wp.i18n.__(\`Caffè ${x}\`, …)` contiene un msgid che dipende da una variabile: non è
estratibile, quindi resterebbe inglese senza che nessuno lo noti. Stessa politica di R22 sul
lato PHP. *Verificato* fra i casi di rifiuto.

**R36 — Lo scheletro `' (%s: %s)'` non poteva restare fuori da `__()`.** Due chiamate
costruivano la stringa finale con `sprintf` **fuori** dalla funzione gettext, estraendo solo
`(%s: %s)`: il traduttore riceveva uno scheletro e non poteva riordinare né inflettere. Le
frasi intere sono state spostate dentro `wp.i18n.__()`. *Stesso principio di R30:* uno slot
`%s` che contiene un nome di sostantivo non è un punto di innesto, è una trappola.

**R37 — Il sottosistema di modale morto in `admin-product.js` è stato tradotto, non
cancellato.** È irraggiungibile, ma è codice del plugin: eliminarlo è una decisione di
manutenzione separata, e un `.pot` che contiene stringhe di codice morto è innocuo, mentre
una cancellazione fatta durante un task di traduzione è una modifica non richiesta. Nota in
`readme.txt` aperta, non risolta qui.

**R38 — `'OK'` in un pulsante diventa `__('Done')`.** `'OK'` è l'etichetta grezza di un
`alert()` di conferma: in inglese non dice nulla e in italiano era comunque invariato. Il
contratto (`mgws_*` codici, chiavi di `localStorage`, valori di `KeyboardEvent.key`) è
rimasto intatto: sono nomi, non testo.

### Cosa è stato verificato sul Task 5

```
wp.i18n. in admin-masterdata.js                       120 chiamate (108 traducibili, 6 _n, 12 sprintf)
wp.i18n. in admin-order.js                            23 chiamate traducibili
wp.i18n. in admin-product.js                          24 chiamate traducibili
parità estrazione → .pot                              108/108   23/23   24/24
letterali leggibili presenti come msgid               146/146
mutation test (rifiuto / ignore / decodifica)          8 / 6 / 11, tutti verdi
node --check                                           4 file, nessun errore
invarianti strutturali (tag, data-*, class, id, action, role, scope)  invariati
bin/make-pot.php --check                              is up to date (210 strings, 9 files)
msgfmt -o /dev/null                                   compila
```

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
7. La prima serie di mutation test eseguiva `php` **sull'host**, dove non esiste
   (`rc=127`). I 6 casi del gruppo A riportavano "corretto" perché il criterio era
   `rc != 0`, e un `rc=127` significa esattamente la stessa cosa di un rifiuto. **Un test che
   non distingue "ha fallito perché è giusto" da "non è partito" è un test che passa
   sempre.**
8. La copia di `make-pot.php` con la correzione di `\uXXXX` finiva nel `/tmp` **dell'host**
   (`/tmp/opencode/potmut/`), mentre i test girano nel `/tmp` **del container**
   (`/tmp/potmut/`). Due `/tmp` distinti, nessun errore, e il file sotto test era sempre
   quello vecchio. Ho perso tempo a cercare un bug in una correzione che era corretta: il
   sintomo (`Cafè8`) era reale, la causa no. Il banco di prova ora sincronizza lo scratch da
   un unico path, dichiarato in una variabile con il commento che spiega perché è l'host e
   non il container.
9. Nello stesso banco, `tar -C "$PLUGIN"` con `$PLUGIN` un path **del container**: sull'host
   non esiste, la copia non produceva nulla, `rc=2`, e `php bin/make-pot.php` rispondeva
   `Could not open input file`. Lo scratch era vuoto e i test non potevano girare.
   Oggi il driver controlla esplicitamente l'output dello script (`strings,` presente,
   zero riferimenti al file di mutazione) invece di dedurre la riuscita dal codice di uscita.

## Stato dei task

| Task | Stato | Commit |
| --- | --- | --- |
| 1 — `uninstall.php` con test | fatto | `6c6062e` |
| 2 — header, GPL, `readme.txt`, Woo | fatto | `9e9a304` |
| 3 — build zip e CI | fatto | `4cd5c58` |
| 4 — i18n PHP e `.pot` | fatto | `936a4a9` |
| 5 — i18n script admin | fatto | vedi sotto |
| 6 — copertura sicurezza in CI | da fare | |
| 7 — verifica di submission | da fare | |

## Baseline (da ristabilire dopo ogni task)

```
php -l                                                  nessun errore
node --check                                            4 file, nessun errore
tests/mgws_contract_test.php                            SUMMARY failures=0 pending=0   (37 gruppi)
tests/assert_mgws_contract_matrix.php                   50 required rows verified
tests/uninstall_test.php                                SUMMARY failures=0             (6 casi)
bin/make-pot.php --check                                is up to date (210 strings, 9 files)
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

## Questioni aperte (decidere prima del Task 7)

- **Lingua dei messaggi di commit.** I commit sono in italiano; il plugin e la UI sono
  ora in inglese. Non c'è regola, quindi è una scelta dell'utente. Cambiare retroattivamente
  richiede `git filter-branch`/`rebase` e riscritta delle chiavi di merge.
- **Display name.** `MG Warehouse Stock` non dice niente a chi non conosce l'app: la
  directory mostra il nome accanto al nome dell'autore. Serve un nome inglese descrittivo,
  cambiato **insieme** in header e `readme.txt`, perché i due sono la stessa promessa.
- **`it_IT` .po.** ~480 stringhe. Lo store non lo richiede e un `.po` invecchiato è peggio
  di nessun `.po`: i msgid non più presenti nel `.pot` non vengono più cercati e chi
  traduce li corregge, ma l'inverso no. Il template è a posto; la traduzione è una scelta.
- **Sottosistema di modale morto in `admin-product.js`** (R37): tradotto e conservato.
  cancellarlo è manutenzione, non i18n.
- **R2 ricontrollato alla luce di R33**: l'opzione `mgws_woocommerce_stock_authority` non ha
  UI (R9). Chi installa dallo store e vuole MGWS autorevole sullo stock deve sapere che
  l'opzione esiste; `readme.txt` lo dice, ma è testo che nessuno legge. Da valutare nel
  Task 7 se il nome dell'opzione e la sua posizione nella pagina WooCommerce sono chiari.
