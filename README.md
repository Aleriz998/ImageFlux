# ImageFlux

Una lavagna web per organizzare immagini, GIF e video e collegarli in flussi a nodi. Interfaccia in italiano, senza account e senza backend per i contenuti.

## Uso senza Node.js

Il sito è predisposto per GitHub Pages all’indirizzo `https://aleriz998.github.io/ImageFlux/`.
Per attivarlo, in GitHub apri **Settings → Pages → Build and deployment**, scegli **Deploy from a branch**, poi **gh-pages** e **/ (root)** e salva. Il branch `gh-pages` contiene i file statici di distribuzione; l’attivazione nelle impostazioni del repository è necessaria se Pages non è già abilitato.

In alternativa scarica `ImageFlux.html` dal branch `gh-pages` (pulsante **Download raw file** nella pagina del file), poi aprilo con un doppio clic in un browser moderno. Questa versione contiene già codice e stile e non richiede server o installazioni. Esporta regolarmente i progetti: per i file HTML locali, la disponibilità e la persistenza di IndexedDB dipendono dal browser.

Per generare i file di distribuzione durante lo sviluppo:

```sh
npm run build
```

`dist/` contiene il sito statico e la versione autonoma `ImageFlux.html`. I percorsi relativi permettono di ospitare il sito anche in una sottocartella. Dopo modifiche al codice, rigenera i file e aggiorna il branch di distribuzione per pubblicarle.

## Avvio

Richiede Node.js 20 o successivo. Non ci sono dipendenze da installare.

```sh
cd /workspace/ImageFlux
npm start
```

Apri `http://localhost:3000` nel tuo browser. Per cambiare porta: `PORT=3001 npm start`.

## Utilizzo

- Trascina immagini, GIF o video dal computer alla lavagna, oppure usa il pulsante media. Sono supportati anche l’incolla di immagini e il trascinamento di immagini dal browser con URL accessibile.
- Aggiungi un indirizzo diretto con il pulsante ↗. Le pagine web, i link a YouTube e i contenuti protetti non sono file multimediali diretti. Per URL senza estensione puoi scegliere il formato nel dialogo.
- Sposta i nodi trascinandoli. I video hanno controlli nativi: trascina l’intestazione per spostarli. Usa la maniglia in basso a destra o il pannello proprietà per ridimensionare.
- Trascina dal pallino destro di un nodo a un altro per creare una relazione direzionale. In alternativa, premi **C** e seleziona partenza e arrivo. Clicca una freccia per modificarne l’etichetta o eliminarla.
- Aggiungi note con **N**, modifica titoli e testo nel pannello proprietà. **Canc** elimina la selezione, **V** attiva la selezione, **Esc** annulla.
- Trascina lo sfondo per muoverti, usa la rotella o i pulsanti per lo zoom, **F** per inquadrare tutto.
- Il progetto viene salvato automaticamente in IndexedDB nel browser corrente. **Esporta** scarica un file `.imageflux` con i media locali incorporati; **Apri progetto** lo ripristina. Esporta prima di cancellare i dati del browser o cambiare origine/porta.

## Dati e limiti

I file locali non vengono caricati su un server. I media aggiunti tramite URL vengono richiesti al sito di origine e restano collegamenti esterni nel progetto esportato. Possono smettere di funzionare se il sito blocca il caricamento o cambia il file. Per un archivio indipendente importa i file dal computer.

Limite di importazione: 80 MB per media, 500 MB per progetto, 2.000 nodi e 10.000 collegamenti. Lo spazio disponibile per il salvataggio dipende dal browser. I video devono avere un codec supportato dal browser; GIF e immagini animate mantengono l’animazione. Il formato corrente usa dati base64: progetti con molti video richiedono memoria e spazio aggiuntivi.

Questa versione è un’applicazione per uso individuale: non include sincronizzazione cloud, collaborazione, undo/redo o selezione multipla. Il server di sviluppo non offre autenticazione: usalo su una rete fidata.

## Verifica

```sh
npm run check
npm test
```

I test verificano validazione dei progetti, formati multimediali, sicurezza degli indirizzi e integrità dei collegamenti.
