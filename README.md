# App del Ranch

Sito statico (HTML + JavaScript) con Supabase come database, archivio foto e backend.
Nessun login: chiunque legge, i soci agiscono con il proprio link personale `?k=CODICE`.

Stato: sezione **Soci** completa. Le altre sezioni mostrano "in costruzione".

## Struttura

```
index.html                         pagina unica, navigazione con #/sezione
css/style.css                      stile (chiaro/scuro automatico)
js/config.js                       URL e chiave pubblica Supabase (vuoti = modalità demo)
js/api.js                          chiamate a Supabase + modalità demo con le stesse regole
js/demo-data.js                    dati di esempio
js/ui.js                           avatar, formati euro/date, messaggi
js/cropper.js                      ritaglio quadrato della foto profilo (256×256 JPEG)
js/soci.js                         sezione Soci: elenco, scheda, modifica profilo
js/app.js                          avvio, link personale, navigazione
supabase/migrations/*.sql          schema del database, in ordine di data
supabase/functions/carica-foto/    edge function per il caricamento della foto profilo
```

## Come è protetto

- Il browser usa solo la chiave pubblica di Supabase. Le tabelle sono chiuse: dal browser si possono
  solo chiamare le funzioni `get_soci`, `get_socio`, `whoami`, `aggiorna_profilo`.
- Il codice personale non esce mai dalle funzioni pubbliche.
- Il registro `movimenti` non accetta modifiche né cancellazioni: le correzioni sono nuovi movimenti.
- Il segno dell'importo è vincolato al tipo (accredito positivo, acquisto negativo, ecc.).
- Le foto stanno nel bucket pubblico `avatar`; si caricano solo tramite `carica-foto`, che verifica il codice.

## Provarla in demo

Con `SUPABASE_URL` vuoto l'app usa dati inventati: `python3 -m http.server` e apri
`http://localhost:8000/?k=demo-ermete`.

## Gestione soci (finché non c'è la pagina admin)

Dal Table Editor di Supabase, tabella `soci`: aggiungi una riga con `nome` e `data_ingresso`;
`id` e `codice` si generano da soli. Il link personale è `INDIRIZZO_SITO/?k=<codice>`.
Per invalidare un link: sostituisci il `codice` con un valore nuovo, o metti `attivo = false`.
