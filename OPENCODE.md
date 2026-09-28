# OPENCODE Local Routing

Questo progetto usa LLM Wiki con root fissa:

- `/home/vincenzo/Desktop/obsidian/llm-wiki/`

Vault di progetto associato:

- `/home/vincenzo/Desktop/obsidian/llm-wiki/vault-gestione-negozio-abbigliamento/`

Regole locali:

1. Per knowledge di progetto, salvare nel vault progetto associato.
2. Per knowledge riusabile cross-progetto, promuovere nel `general vault` con bridge.
3. In assenza di altre istruzioni utente, non chiedere nuovamente la root wiki per questo progetto.
4. Questo plugin WordPress e parte dello stesso sistema della app Flutter `gestione_negozio_app` in:
   - `/mnt/home/Scrivania/nas/programma/softwere/gestione_negozio_abbigliamento/gestione_negozio_app`
5. `MGWS` e il plugin principale del progetto e deve esporre verso l'app un contratto stabile per stock, inventario, movimenti, clienti, ordini, punti fedelta, report, fornitori e riordini.
6. L'app Flutter deve parlare direttamente solo con `MGWS` o con `WooCommerce`.
7. `ATUM`, `myCred` e altri plugin WordPress terzi non devono essere chiamati direttamente dall'app; se usati, devono stare dietro `MGWS` come provider interni opzionali.
8. Il default architetturale del progetto e `MGWS` come provider principale. `WooCommerce` resta un provider alternativo diretto solo per funzioni Woo native quando esplicitamente scelto.
