// Accesso ai dati: Supabase se configurato, altrimenti dati demo.
(function () {
  var C = window.RANCH_CONFIG || {};
  var URL_DB = (C.SUPABASE_URL || '').replace(/\/$/, '');
  var KEY = C.SUPABASE_KEY || '';
  var DEMO = !(URL_DB && KEY);

  function errore(msg) { var e = new Error(msg); e.utente = true; return e; }

  // ---------- modalità reale (Supabase) ----------
  function headers() {
    var h = { 'Content-Type': 'application/json', apikey: KEY };
    if (/^eyJ/.test(KEY)) h.Authorization = 'Bearer ' + KEY; // chiavi anon legacy (JWT)
    return h;
  }
  // Le funzioni SQL alzano errori con codice P0001: quel messaggio è scritto per l'utente
  function leggi(r) {
    return r.text().then(function (t) {
      var j = null;
      try { j = t ? JSON.parse(t) : null; } catch (e) { /* risposta non JSON */ }
      if (r.ok) return j;
      if (j && j.code === 'P0001' && j.message) throw errore(j.message);
      if (j && j.error) throw errore(j.error);
      throw errore('Errore del server. Riprova tra poco.');
    });
  }
  function rpc(nome, args) {
    return fetch(URL_DB + '/rest/v1/rpc/' + nome, {
      method: 'POST', headers: headers(), body: JSON.stringify(args || {})
    }).then(leggi);
  }
  function funzione(nome, body) {
    return fetch(URL_DB + '/functions/v1/' + nome, {
      method: 'POST', headers: headers(), body: JSON.stringify(body || {})
    }).then(leggi);
  }
  // foto_path nel bucket pubblico "avatar" -> URL completo
  function urlFoto(p, bucket) {
    if (!p || /^(data:|https?:)/.test(p)) return p || '';
    return URL_DB + '/storage/v1/object/public/' + (bucket || 'avatar') + '/' + p.split('/').map(encodeURIComponent).join('/');
  }
  function conFoto(x) { if (x) x.foto = urlFoto(x.foto); return x; }

  // ---------- modalità demo (stesse regole del backend) ----------
  var D = window.RANCH_DEMO;
  if (D && !D.cuori) D.cuori = { p01: ['s01', 's04', 's07'], p02: ['s03'] };
  if (D && !D.piano) D.piano = { titolo: '4 moto in 8', soci: 8, aggiornatoIl: '2026-11-22T01:00:00',
    note: 'Moto da 1.400 €. Ingresso in due metà (nov–dic) che compra la prima coppia a dicembre; rate gen–apr per la seconda coppia ad aprile.',
    rate: [{ mese: '2026-11-01', voce: 'Ingresso (1/2)', quotaMoto: 175, quotaCassa: 0 }, { mese: '2026-12-01', voce: 'Ingresso (2/2)', quotaMoto: 175, quotaCassa: 0 },
           { mese: '2027-01-01', voce: 'Rata', quotaMoto: 87.5, quotaCassa: 15.625 }, { mese: '2027-02-01', voce: 'Rata', quotaMoto: 87.5, quotaCassa: 15.625 },
           { mese: '2027-03-01', voce: 'Rata', quotaMoto: 87.5, quotaCassa: 15.625 }, { mese: '2027-04-01', voce: 'Rata', quotaMoto: 87.5, quotaCassa: 15.625 }],
    uscite: [] };
  if (D && !D.eventi) D.eventi = [
    { id: 'e01', titolo: 'Gara sociale d\'inverno', descrizione: 'Tre manche sul tracciato completo, poi pranzo tutti insieme.', foto: '',
      stato: 'da_programmare', dataInizio: null, dataFine: null, creatoIl: '2026-11-10T10:00:00', date: [
        { id: 'd1', dataInizio: '2026-12-12', dataFine: '2026-12-13', voti: ['s01', 's02', 's05'] },
        { id: 'd2', dataInizio: '2026-12-19', dataFine: '2026-12-19', voti: ['s02', 's04'] },
        { id: 'd3', dataInizio: '2027-01-09', dataFine: '2027-01-10', voti: [] } ] },
    { id: 'e02', titolo: 'Giornata lavori pista', descrizione: 'Sistemiamo la curva La Parente e le reti di protezione.', foto: '',
      stato: 'programmato', dataInizio: '2026-11-29', dataFine: '2026-11-29', creatoIl: '2026-11-01T10:00:00', date: [] },
    { id: 'e03', titolo: 'Inaugurazione ranch', descrizione: 'Primo giro ufficiale e foto di gruppo.', foto: '',
      stato: 'programmato', dataInizio: '2026-10-04', dataFine: '2026-10-04', creatoIl: '2026-09-01T10:00:00', date: [] } ];
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function attesa(v) { return new Promise(function (ok) { setTimeout(function () { ok(clone(v)); }, 150); }); }
  function rifiuto(msg) { return new Promise(function (_, ko) { setTimeout(function () { ko(errore(msg)); }, 150); }); }

  function saldi(movimenti) {
    var s = {};
    movimenti.forEach(function (m) {
      var x = s[m.socio] || (s[m.socio] = { credito: 0, investito: 0 });
      x.credito += Number(m.importo) || 0;
      if (m.tipo === 'acquisto' || m.tipo === 'storno' || m.tipo === 'rimborso') {
        if (m.progetto) x.investito -= Number(m.importo) || 0;
      }
    });
    return s;
  }
  function pubblico(socio, s) {
    var x = s[socio.id] || { credito: 0, investito: 0 };
    return { id: socio.id, nome: socio.nome, numeroGara: socio.numeroGara || null, bio: socio.bio || '',
             numeroFont: socio.numeroFont || 'corsa', numeroColore: socio.numeroColore || 'rosso',
             dataIngresso: socio.dataIngresso || '', foto: socio.foto || '',
             credito: Math.round(x.credito * 100) / 100, investito: Math.round(x.investito * 100) / 100 };
  }
  function perCodice(k) { return D.soci.filter(function (s) { return s.attivo && s.codice === k; })[0]; }

  var demo = {
    getSoci: function () {
      var s = saldi(D.movimenti);
      var soci = D.soci.filter(function (x) { return x.attivo; })
        .map(function (x) { return pubblico(x, s); })
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it'); });
      var credito = soci.reduce(function (t, x) { return t + x.credito; }, 0);
      return attesa({ soci: soci, totali: { soci: soci.length, credito: credito } });
    },
    getSocio: function (id) {
      var socio = D.soci.filter(function (x) { return x.id === id && x.attivo; })[0];
      if (!socio) return rifiuto('Socio non trovato.');
      var s = saldi(D.movimenti);
      var miei = D.movimenti.filter(function (m) { return m.socio === id; });
      var perProgetto = {};
      miei.forEach(function (m) {
        if (!m.progetto) return;
        var p = perProgetto[m.progetto] || (perProgetto[m.progetto] = { quote: 0, importo: 0 });
        p.quote += Number(m.quote) || 0;
        p.importo -= Number(m.importo) || 0;
      });
      var progetti = D.progetti
        .filter(function (p) { return perProgetto[p.id] && perProgetto[p.id].quote > 0; })
        .map(function (p) { return { id: p.id, nome: p.titolo, quote: perProgetto[p.id].quote, importo: perProgetto[p.id].importo }; });
      var nomiProgetti = {};
      D.progetti.forEach(function (p) { nomiProgetti[p.id] = p.titolo; });
      var movimenti = miei.slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, 10)
        .map(function (m) { return { data: m.data, tipo: m.tipo, importo: m.importo, causale: m.causale,
                                     progetto: nomiProgetti[m.progetto] || '' }; });
      return attesa({ socio: pubblico(socio, s), progetti: progetti, movimenti: movimenti });
    },
    whoami: function (k) {
      var socio = perCodice(k);
      if (!socio) return attesa(null);
      return attesa({ id: socio.id, nome: socio.nome, foto: socio.foto || '', admin: !!socio.admin,
                      credito: pubblico(socio, saldi(D.movimenti)).credito });
    },
    aggiornaProfilo: function (k, dati) {
      var socio = perCodice(k);
      if (!socio) return rifiuto('Link personale non valido.');
      var v = validaProfilo(dati, socio.id, D.soci);
      if (v.errore) return rifiuto(v.errore);
      socio.numeroGara = v.numeroGara;
      socio.bio = v.bio;
      socio.numeroFont = v.numeroFont;
      socio.numeroColore = v.numeroColore;
      return attesa(pubblico(socio, saldi(D.movimenti)));
    },
    caricaFoto: function (k, dataUrl) {
      var socio = perCodice(k);
      if (!socio) return rifiuto('Link personale non valido.');
      if (!/^data:image\/jpeg;base64,/.test(dataUrl)) return rifiuto('Formato immagine non valido.');
      if (dataUrl.length > 1400000) return rifiuto('Immagine troppo grande.');
      socio.foto = dataUrl; // in demo la foto resta solo in memoria
      return attesa({ foto: dataUrl });
    },

    // ----- progetti (demo) -----
    getProgetti: function (k) {
      var io = perCodice(k);
      var lista = D.progetti.filter(function (p) { return p.stato !== 'eliminato'; }).map(function (p) {
        var x = progettoPubblico(p); x.mioCuore = !!(io && (D.cuori[p.id] || []).indexOf(io.id) >= 0); return x;
      });
      var ordine = { raccolta: 0, sviluppo: 1, chiuso: 2 };
      lista.sort(function (a, b) { return (ordine[a.stato] - ordine[b.stato]) || (a.scadenza < b.scadenza ? -1 : 1); });
      return attesa({ progetti: lista, kpi: {
        progetti: lista.length,
        raccolto: lista.reduce(function (t, p) { return t + p.raccolto; }, 0),
        totale: lista.reduce(function (t, p) { return t + p.totale; }, 0) } });
    },
    getProgetto: function (id) {
      var p = trovaProgetto(id);
      if (!p) return rifiuto('Progetto non trovato.');
      var fin = D.movimenti.filter(function (m) { return m.progetto === id; })
        .sort(function (a, b) { return a.data < b.data ? 1 : -1; })
        .map(function (m) { return { socio: miniSocio(m.socio), data: m.data, tipo: m.tipo, quote: m.quote,
                                     importo: -m.importo, messaggio: m.messaggio || '' }; });
      return attesa({ progetto: progettoPubblico(p), finanziatori: fin });
    },
    creaProgetto: function (k, d) {
      var s = perCodice(k);
      if (!s) return rifiuto('Link personale non valido.');
      var e = validaProgetto(d) || (d.scadenza < oggi() ? 'La scadenza non può essere nel passato.' : '');
      if (e) return rifiuto(e);
      var p = { id: 'p' + Date.now(), titolo: d.titolo.trim(), descrizione: (d.descrizione || '').trim(),
                quoteTotali: Number(d.quoteTotali), costoQuota: Number(d.costoQuota), scadenza: d.scadenza,
                stato: 'raccolta', creatoDa: s.id, foto: '', creatoIl: new Date().toISOString() };
      D.progetti.push(p);
      return attesa(progettoPubblico(p));
    },
    modificaProgetto: function (k, id, d) {
      var s = perCodice(k), p = trovaProgetto(id);
      if (!s) return rifiuto('Link personale non valido.');
      if (!p) return rifiuto('Progetto non trovato.');
      if (p.creatoDa !== s.id && !s.admin) return rifiuto('Solo chi ha proposto il progetto può modificarlo.');
      var e = validaProgetto(d);
      if (e) return rifiuto(e);
      if ((p.stato === 'sviluppo' || p.stato === 'chiuso') && (Number(d.quoteTotali) !== p.quoteTotali || Number(d.costoQuota) !== p.costoQuota))
        return rifiuto('Il progetto è in esecuzione: per cambiare quote o costo riportalo prima in raccolta.');
      var vend = quoteVendute(id), haMov = D.movimenti.some(function (m) { return m.progetto === id; });
      if (haMov && Number(d.costoQuota) !== p.costoQuota) return rifiuto('Il costo quota non si può cambiare dopo il primo acquisto.');
      if (haMov && Number(d.quoteTotali) < vend) return rifiuto('Sono già state vendute ' + vend + ' quote: le quote totali non possono essere meno.');
      Object.assign(p, { titolo: d.titolo.trim(), descrizione: (d.descrizione || '').trim(), quoteTotali: Number(d.quoteTotali),
                         costoQuota: Number(d.costoQuota), scadenza: d.scadenza });
      return attesa(progettoPubblico(p));
    },
    acquistaQuote: function (k, id, quote, messaggio) {
      var s = perCodice(k), p = trovaProgetto(id);
      if (!s) return rifiuto('Link personale non valido.');
      if (!p) return rifiuto('Progetto non trovato.');
      if (p.stato !== 'raccolta') return rifiuto('La raccolta per questo progetto è chiusa.');
      if (p.scadenza < oggi()) return rifiuto('Il progetto è scaduto.');
      quote = Number(quote);
      if (!(quote >= 1)) return rifiuto('Scegli almeno una quota.');
      var resto = p.quoteTotali - quoteVendute(id);
      if (quote > resto) return rifiuto('Restano solo ' + resto + ' quote.');
      var costo = quote * p.costoQuota, credito = saldi(D.movimenti)[s.id] ? saldi(D.movimenti)[s.id].credito : 0;
      if (costo > credito) return rifiuto('Credito insufficiente: hai ' + UI.euro(credito) + ', servono ' + UI.euro(costo) + '.');
      D.movimenti.push({ id: 'm' + Date.now(), data: new Date().toISOString(), socio: s.id, tipo: 'acquisto', importo: -costo,
                         progetto: id, quote: quote, causale: quote + (quote === 1 ? ' quota' : ' quote'), messaggio: (messaggio || '').trim() });
      return attesa({ progetto: progettoPubblico(p), credito: credito - costo });
    },
    impostaStato: function (k, id, stato) {
      var s = perCodice(k), p = trovaProgetto(id);
      if (!s || !s.admin) return rifiuto('Solo l\'admin può cambiare lo stato.');
      if (!p) return rifiuto('Progetto non trovato.');
      var manc = p.quoteTotali - quoteVendute(id);
      if ((stato === 'sviluppo' || stato === 'chiuso') && manc > 0)
        return rifiuto('Per passare in esecuzione il progetto deve essere finanziato al 100%: ' + (manc === 1 ? 'manca 1 quota' : 'mancano ' + manc + ' quote') + ' (' + UI.euro(manc * p.costoQuota) + ').');
      p.stato = stato;
      return attesa(progettoPubblico(p));
    },
    eliminaProgetto: function (k, id) {
      var s = perCodice(k), p = trovaProgetto(id);
      if (!s || !s.admin) return rifiuto('Solo l\'admin può eliminare un progetto.');
      if (!p) return rifiuto('Progetto non trovato.');
      var per = {}, n = 0, tot = 0;
      D.movimenti.filter(function (m) { return m.progetto === id; }).forEach(function (m) {
        var x = per[m.socio] || (per[m.socio] = { q: 0, i: 0 }); x.q += m.quote; x.i -= m.importo;
      });
      Object.keys(per).forEach(function (sid) {
        if (per[sid].i <= 0) return;
        D.movimenti.push({ id: 'm' + Date.now() + sid, data: new Date().toISOString(), socio: sid, tipo: 'rimborso',
                           importo: per[sid].i, progetto: id, quote: -per[sid].q, causale: 'Rimborso: progetto eliminato' });
        n++; tot += per[sid].i;
      });
      p.stato = 'eliminato';
      return attesa({ rimborsati: n, importo: tot });
    },
    caricaFotoProgetto: function (k, id, dataUrl) {
      var s = perCodice(k), p = trovaProgetto(id);
      if (!s) return rifiuto('Link personale non valido.');
      if (!p) return rifiuto('Progetto non trovato.');
      if (p.creatoDa !== s.id && !s.admin) return rifiuto('Solo chi ha proposto il progetto può cambiarne la foto.');
      p.foto = dataUrl;
      return attesa({ foto: dataUrl });
    },

    cuore: function (k, id) {
      var s = perCodice(k);
      if (!s) return rifiuto('Link personale non valido.');
      var l = D.cuori[id] || (D.cuori[id] = []), i = l.indexOf(s.id);
      if (i >= 0) l.splice(i, 1); else l.push(s.id);
      return attesa({ mioCuore: i < 0, cuori: l.length });
    },
    getAndamento: function () {
      var giorni = {};
      D.movimenti.forEach(function (m) {
        var p = trovaProgetto(m.progetto); if (!p) return;
        var g = String(m.data).slice(0, 10); giorni[g] = (giorni[g] || 0) - m.importo;
      });
      return attesa({ oggi: oggi(),
        progetti: D.progetti.filter(function (p) { return p.stato !== 'eliminato'; })
          .map(function (p) { return { id: p.id, titolo: p.titolo, scadenza: p.scadenza, stato: p.stato, totale: p.quoteTotali * p.costoQuota }; })
          .sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; }),
        raccolta: Object.keys(giorni).sort().map(function (g) { return { giorno: g, importo: giorni[g] }; }) });
    },

    // ----- piano di cassa (demo) -----
    getPiano: function () {
      var prog = D.progetti.filter(function (x) { return x.stato !== 'eliminato'; }).map(function (x) {
        var pp = progettoPubblico(x);
        return { id: x.id, titolo: x.titolo, descrizione: x.descrizione, stato: x.stato, scadenza: x.scadenza, quoteTotali: x.quoteTotali,
                 costoQuota: x.costoQuota, totale: pp.totale, raccolto: pp.raccolto, quoteVendute: pp.quoteVendute };
      }).sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; });
      var vers = 0, cred = 0;
      D.movimenti.forEach(function (m) { cred += m.importo; if (m.tipo === 'accredito' || m.tipo === 'addebito') vers += m.importo; });
      var es = prog.filter(function (x) { return x.stato === 'sviluppo' || x.stato === 'chiuso'; });
      return attesa(Object.assign({}, D.piano, { progetti: prog, reale: {
        versato: vers, creditoLibero: cred,
        quoteAperte: prog.filter(function (x) { return x.stato === 'raccolta'; }).reduce(function (t, x) { return t + x.raccolto; }, 0),
        raccoltoEsecuzione: es.reduce(function (t, x) { return t + x.raccolto; }, 0),
        speso: es.reduce(function (t, x) { return t + x.totale; }, 0) } }));
    },
    adminPianoSalva: function (k, d) {
      var a = perCodice(k); if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      D.piano = { titolo: d.titolo, soci: d.soci, note: d.note, aggiornatoIl: new Date().toISOString(),
        rate: d.rate.slice().sort(function (x, y) { return x.mese < y.mese ? -1 : 1; }),
        uscite: d.uscite.slice().sort(function (x, y) { return x.mese < y.mese ? -1 : 1; }) };
      return attesa(D.piano);
    },

    // ----- eventi (demo) -----
    getEventi: function (k) {
      var io = perCodice(k), t = oggi();
      var l = D.eventi.map(function (e) { return eventoPubblico(e, io); });
      function rango(e) { return e.stato === 'programmato' && !e.concluso ? 0 : e.stato === 'da_programmare' ? 1 : 2; }
      l.sort(function (a, b) { return (rango(a) - rango(b)) || ((a.dataInizio || '') < (b.dataInizio || '') ? (rango(a) === 2 ? 1 : -1) : (rango(a) === 2 ? -1 : 1)); });
      return attesa(l);
    },
    getEvento: function (id, k) {
      var e = D.eventi.filter(function (x) { return x.id === id; })[0];
      if (!e) return rifiuto('Evento non trovato.');
      return attesa(eventoPubblico(e, perCodice(k)));
    },
    votaData: function (k, idData) {
      var s = perCodice(k); if (!s) return rifiuto('Link personale non valido.');
      var e = D.eventi.filter(function (x) { return x.date.some(function (d) { return d.id === idData; }); })[0];
      if (!e) return rifiuto('Data non trovata.');
      if (e.stato !== 'da_programmare') return rifiuto('L\'evento è già programmato: non si vota più.');
      var d = e.date.filter(function (x) { return x.id === idData; })[0], i = d.voti.indexOf(s.id);
      if (i >= 0) d.voti.splice(i, 1); else d.voti.push(s.id);
      return attesa({ mioVoto: i < 0, voti: d.voti.length });
    },
    adminEventoSalva: function (k, id, d) {
      var a = perCodice(k); if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      if (!String(d.titolo || '').trim()) return rifiuto('Scrivi un titolo.');
      if (d.stato === 'programmato' && !d.dataInizio) return rifiuto('Scegli la data di inizio.');
      if (d.stato === 'programmato' && d.dataFine && d.dataFine < d.dataInizio) return rifiuto('La data di fine non può essere prima dell\'inizio.');
      if (d.stato === 'da_programmare' && !(d.date || []).length) return rifiuto('Aggiungi almeno una data da proporre.');
      var e = id ? D.eventi.filter(function (x) { return x.id === id; })[0] : null;
      if (!e) { e = { id: 'e' + Date.now(), foto: '', creatoIl: new Date().toISOString(), date: [] }; D.eventi.push(e); }
      var vecchie = e.date;
      Object.assign(e, { titolo: d.titolo.trim(), descrizione: (d.descrizione || '').trim(), stato: d.stato,
        dataInizio: d.stato === 'programmato' ? d.dataInizio : null, dataFine: d.stato === 'programmato' ? (d.dataFine || d.dataInizio) : null });
      e.date = (d.date || []).map(function (x, i) {
        var v = vecchie.filter(function (y) { return y.id === x.id; })[0];
        return { id: v ? v.id : 'd' + Date.now() + i, dataInizio: x.dataInizio, dataFine: x.dataFine || x.dataInizio, voti: v ? v.voti : [] };
      });
      return attesa(eventoPubblico(e, a));
    },
    adminEventoFissa: function (k, idData) {
      var a = perCodice(k); if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      var e = D.eventi.filter(function (x) { return x.date.some(function (d) { return d.id === idData; }); })[0];
      var d = e.date.filter(function (x) { return x.id === idData; })[0];
      Object.assign(e, { stato: 'programmato', dataInizio: d.dataInizio, dataFine: d.dataFine });
      return attesa(eventoPubblico(e, a));
    },
    adminEventoElimina: function (k, id) {
      var a = perCodice(k); if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      D.eventi = D.eventi.filter(function (x) { return x.id !== id; });
      return attesa({ ok: true });
    },
    caricaFotoEvento: function (k, id, dataUrl) {
      var e = D.eventi.filter(function (x) { return x.id === id; })[0]; if (e) e.foto = dataUrl;
      return attesa({ foto: dataUrl });
    },

    // ----- admin (demo) -----
    adminGet: function (k) {
      var a = perCodice(k);
      if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      var s = saldi(D.movimenti);
      var soci = D.soci.slice().sort(function (x, y) { return (y.attivo - x.attivo) || x.nome.localeCompare(y.nome, 'it'); })
        .map(function (x) { var p = pubblico(x, s); p.attivo = x.attivo; p.admin = !!x.admin; p.codice = x.codice; return p; });
      var causali = [];
      D.movimenti.slice().reverse().forEach(function (m) {
        if (m.tipo === 'accredito' && m.causale && causali.indexOf(m.causale) < 0 && causali.length < 6) causali.push(m.causale);
      });
      return attesa({ soci: soci, causaliRecenti: causali,
        fondocassa: soci.filter(function (x) { return x.attivo; }).reduce(function (t, x) { return t + x.credito; }, 0) });
    },
    adminAccredita: function (k, ids, importo, causale, forza) {
      var a = perCodice(k);
      if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      importo = Number(importo); causale = String(causale || '').trim();
      if (!ids.length) return rifiuto('Scegli almeno un socio.');
      if (!importo || Math.round(importo * 100) !== importo * 100) return rifiuto('Importo non valido.');
      if (!causale) return rifiuto('Scrivi una causale.');
      if (!forza) {
        var doppi = D.movimenti.filter(function (m) { return ids.indexOf(m.socio) >= 0 && (m.tipo === 'accredito' || m.tipo === 'addebito') &&
          m.causale.toLowerCase() === causale.toLowerCase(); })
          .map(function (m) { return miniSocio(m.socio).nome; })
          .filter(function (n, i, arr) { return arr.indexOf(n) === i; });
        if (doppi.length) return attesa({ ok: false, doppi: doppi });
      }
      var s = saldi(D.movimenti);
      if (importo < 0) {
        for (var i = 0; i < ids.length; i++) {
          var c = s[ids[i]] ? s[ids[i]].credito : 0;
          if (c + importo < 0) return rifiuto('Credito di ' + miniSocio(ids[i]).nome + ' insufficiente: ha ' + UI.euro(c) + '.');
        }
      }
      ids.forEach(function (id, j) {
        D.movimenti.push({ id: 'm' + Date.now() + j, data: new Date().toISOString(), socio: id, tipo: importo > 0 ? 'accredito' : 'addebito',
                           importo: importo, progetto: '', quote: 0, causale: causale, fattoDa: 'admin' });
      });
      return attesa({ ok: true, soci: ids.length, totale: ids.length * importo });
    },
    adminStorna: function (k, idm, quote, causale) {
      var a = perCodice(k);
      if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      var m = D.movimenti.filter(function (x) { return x.id === idm; })[0];
      if (!m || m.tipo !== 'acquisto') return rifiuto('Si possono stornare solo gli acquisti.');
      var resto = m.quote + D.movimenti.filter(function (x) { return x.rif === idm; }).reduce(function (t, x) { return t + x.quote; }, 0);
      quote = Number(quote);
      if (resto <= 0) return rifiuto('Questo acquisto è già stato stornato del tutto.');
      if (!(quote >= 1 && quote <= resto)) return rifiuto('Puoi stornare da 1 a ' + resto + ' quote di questo acquisto.');
      var unit = -m.importo / m.quote;
      D.movimenti.push({ id: 'm' + Date.now(), data: new Date().toISOString(), socio: m.socio, tipo: 'storno', importo: quote * unit,
                         progetto: m.progetto, quote: -quote, causale: causale || ('Storno ' + quote + (quote === 1 ? ' quota' : ' quote')), rif: idm, fattoDa: 'admin' });
      return attesa({ ok: true, importo: quote * unit });
    },
    adminStorico: function (k, f) {
      var a = perCodice(k);
      if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      f = f || {};
      var lista = D.movimenti.filter(function (m) {
        return (!f.socio || m.socio === f.socio) && (!f.tipo || m.tipo === f.tipo) && (!f.mese || String(m.data).slice(0, 7) === f.mese);
      }).sort(function (x, y) { return x.data < y.data ? 1 : -1; }).map(function (m) {
        var p = D.progetti.filter(function (x) { return x.id === m.progetto; })[0];
        var resto = m.tipo === 'acquisto' ? m.quote + D.movimenti.filter(function (x) { return x.rif === m.id; }).reduce(function (t, x) { return t + x.quote; }, 0) : 0;
        return { id: m.id, data: m.data, tipo: m.tipo, importo: m.importo, quote: m.quote, causale: m.causale, messaggio: m.messaggio || '',
                 fattoDa: m.fattoDa || (m.tipo === 'acquisto' ? 'socio' : 'admin'), rif: m.rif || null, socio: miniSocio(m.socio),
                 progetto: p ? { id: p.id, titolo: p.titolo, stato: p.stato } : null, stornabili: resto };
      });
      return attesa(lista);
    },
    adminSocioSalva: function (k, id, d) {
      var a = perCodice(k);
      if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      var nome = String(d.nome || '').trim();
      if (!nome) return rifiuto('Scrivi il nome.');
      if (!id) {
        var nuovo = { id: 's' + Date.now(), nome: nome, numeroGara: null, bio: '', dataIngresso: d.dataIngresso || '', foto: '', attivo: true,
                      codice: 'demo-' + Math.random().toString(16).slice(2, 10) };
        D.soci.push(nuovo);
        return attesa({ id: nuovo.id, nome: nome, codice: nuovo.codice });
      }
      var s = D.soci.filter(function (x) { return x.id === id; })[0];
      if (!s) return rifiuto('Socio non trovato.');
      if (s.id === a.id && d.attivo === false) return rifiuto('Non puoi disattivare te stesso.');
      Object.assign(s, { nome: nome, dataIngresso: d.dataIngresso || '', attivo: d.attivo === undefined ? s.attivo : !!d.attivo });
      return attesa({ id: s.id, nome: s.nome, codice: s.codice });
    },
    adminRigenera: function (k, id) {
      var a = perCodice(k);
      if (!a || !a.admin) return rifiuto('Funzione riservata all\'admin.');
      if (id === a.id) return rifiuto('Il tuo link non si rigenera da qui: perderesti l\'accesso admin da questo dispositivo.');
      var s = D.soci.filter(function (x) { return x.id === id; })[0];
      s.codice = 'demo-' + Math.random().toString(16).slice(2, 10);
      return attesa({ codice: s.codice });
    },
    adminRimuoviFoto: function (k, id) {
      var s = D.soci.filter(function (x) { return x.id === id; })[0];
      if (s) s.foto = '';
      return attesa({ ok: true });
    }
  };

  function oggi() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function trovaProgetto(id) { return D.progetti.filter(function (p) { return p.id === id && p.stato !== 'eliminato'; })[0]; }
  function quoteVendute(id) { return D.movimenti.filter(function (m) { return m.progetto === id; }).reduce(function (t, m) { return t + m.quote; }, 0); }
  function miniSocio(id) {
    var s = D.soci.filter(function (x) { return x.id === id; })[0] || { id: id, nome: '?' };
    return { id: s.id, nome: s.nome, foto: s.foto || '', numeroGara: s.numeroGara || null, numeroFont: s.numeroFont, numeroColore: s.numeroColore };
  }
  function eventoPubblico(e, io) {
    return { id: e.id, titolo: e.titolo, descrizione: e.descrizione, foto: e.foto || '', stato: e.stato,
      dataInizio: e.dataInizio, dataFine: e.dataFine, creatoIl: e.creatoIl,
      concluso: e.stato === 'programmato' && e.dataFine < oggi(),
      date: e.date.slice().sort(function (a, b) { return a.dataInizio < b.dataInizio ? -1 : 1; }).map(function (d) {
        return { id: d.id, dataInizio: d.dataInizio, dataFine: d.dataFine, voti: d.voti.length,
          mioVoto: !!(io && d.voti.indexOf(io.id) >= 0), votanti: d.voti.map(miniSocio) };
      }) };
  }
  function progettoPubblico(p) {
    var mov = D.movimenti.filter(function (m) { return m.progetto === p.id; });
    var raccolto = mov.reduce(function (t, m) { return t - m.importo; }, 0);
    var perSocio = {};
    mov.forEach(function (m) { perSocio[m.socio] = (perSocio[m.socio] || 0) + m.quote; });
    return { id: p.id, titolo: p.titolo, descrizione: p.descrizione, foto: p.foto || '', quoteTotali: p.quoteTotali,
             costoQuota: p.costoQuota, totale: p.quoteTotali * p.costoQuota, raccolto: raccolto,
             quoteVendute: quoteVendute(p.id),
             sostenitori: Object.keys(perSocio).filter(function (k) { return perSocio[k] > 0; }).length,
             scadenza: p.scadenza, scaduto: p.scadenza < oggi(), stato: p.stato, creatoIl: p.creatoIl,
             cuori: (D.cuori[p.id] || []).length,
             creatoDa: miniSocio(p.creatoDa) };
  }
  function validaProgetto(d) {
    var t = String(d.titolo || '').trim();
    if (!t) return 'Scrivi un titolo.';
    if (t.length > 80) return 'Il titolo può avere al massimo 80 caratteri.';
    if (String(d.descrizione || '').length > 1000) return 'La descrizione può avere al massimo 1000 caratteri.';
    var q = Number(d.quoteTotali), c = Number(d.costoQuota);
    if (!Number.isInteger(q) || q < 1 || q > 10000) return 'Le quote totali vanno da 1 a 10000.';
    if (!(c > 0) || c > 10000 || Math.round(c * 100) !== c * 100) return 'Il costo quota deve essere tra 0,01 e 10000 euro.';
    if (!d.scadenza) return 'Scegli una data di scadenza.';
    return '';
  }

  // Regole condivise con il backend (vedi apps-script/Code.gs)
  function validaProfilo(dati, idSocio, soci) {
    var bio = String(dati.bio || '').trim();
    if (bio.length > 200) return { errore: 'La bio può avere al massimo 200 caratteri.' };
    var num = dati.numeroGara === '' || dati.numeroGara == null ? null : Number(dati.numeroGara);
    if (num !== null && (!Number.isInteger(num) || num < 1 || num > 999))
      return { errore: 'Il numero di gara va da 1 a 999.' };
    if (num !== null) {
      var preso = soci.filter(function (s) { return s.attivo && s.id !== idSocio && Number(s.numeroGara) === num; })[0];
      if (preso) return { errore: 'Il numero ' + num + ' è già di ' + preso.nome + '.' };
    }
    var font = dati.numeroFont || 'corsa', colore = dati.numeroColore || 'rosso';
    if (['corsa', 'squadrato', 'stencil'].indexOf(font) < 0) return { errore: 'Stile del numero non valido.' };
    if (['rosso','arancione','giallo','oro','verde','acqua','azzurro','blu','viola','rosa','nero','bianco'].indexOf(colore) < 0)
      return { errore: 'Colore del numero non valido.' };
    return { numeroGara: num, bio: bio, numeroFont: font, numeroColore: colore };
  }

  var reale = {
    getSoci: function () {
      return rpc('get_soci').then(function (d) { d.soci.forEach(conFoto); return d; });
    },
    getSocio: function (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.reject(errore('Socio non trovato.'));
      return rpc('get_socio', { p_id: id }).then(function (d) { conFoto(d.socio); return d; });
    },
    whoami: function (k) { return rpc('whoami', { p_k: k }).then(conFoto); },
    aggiornaProfilo: function (k, dati) {
      var n = dati.numeroGara === '' || dati.numeroGara == null ? null : Number(dati.numeroGara);
      return rpc('aggiorna_profilo', { p_k: k, p_numero_gara: n, p_bio: dati.bio || '',
        p_numero_font: dati.numeroFont || 'corsa', p_numero_colore: dati.numeroColore || 'rosso' }).then(conFoto);
    },
    caricaFoto: function (k, dataUrl) { return funzione('carica-foto', { k: k, foto: dataUrl }).then(conFoto); },

    // ----- progetti -----
    getProgetti: function (k) {
      return rpc('get_progetti', { p_k: k || null }).then(function (d) { d.progetti.forEach(conFotoProgetto); return d; });
    },
    cuore: function (k, id) { return rpc('cuore', { p_k: k, p_id: id }); },
    getAndamento: function () { return rpc('get_andamento'); },
    getPiano: function () { return rpc('get_piano'); },
    adminPianoSalva: function (k, d) {
      return rpc('admin_piano_salva', { p_k: k, p_titolo: d.titolo, p_soci: d.soci, p_note: d.note || '', p_rate: d.rate, p_uscite: d.uscite });
    },

    // ----- eventi -----
    getEventi: function (k) {
      return rpc('get_eventi', { p_k: k || null }).then(function (l) { l.forEach(conFotoEvento); return l; });
    },
    getEvento: function (id, k) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.reject(errore('Evento non trovato.'));
      return rpc('get_evento', { p_id: id, p_k: k || null }).then(conFotoEvento);
    },
    votaData: function (k, idData) { return rpc('vota_data', { p_k: k, p_data: idData }); },
    adminEventoSalva: function (k, id, d) {
      return rpc('admin_evento_salva', { p_k: k, p_id: id || null, p_titolo: d.titolo, p_descrizione: d.descrizione || '',
        p_stato: d.stato, p_inizio: d.dataInizio || null, p_fine: d.dataFine || null, p_date: d.date || [] }).then(conFotoEvento);
    },
    adminEventoFissa: function (k, idData) { return rpc('admin_evento_fissa', { p_k: k, p_data: idData }).then(conFotoEvento); },
    adminEventoElimina: function (k, id) { return rpc('admin_evento_elimina', { p_k: k, p_id: id }); },
    caricaFotoEvento: function (k, id, dataUrl) {
      return funzione('carica-foto', { k: k, foto: dataUrl, evento: id })
        .then(function (r) { r.foto = urlFoto(r.foto, 'eventi'); return r; });
    },
    getProgetto: function (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.reject(errore('Progetto non trovato.'));
      return rpc('get_progetto', { p_id: id }).then(function (d) {
        conFotoProgetto(d.progetto);
        d.finanziatori.forEach(function (f) { conFoto(f.socio); });
        return d;
      });
    },
    creaProgetto: function (k, d) {
      return rpc('crea_progetto', argsProgetto(k, d)).then(conFotoProgetto);
    },
    modificaProgetto: function (k, id, d) {
      var a = argsProgetto(k, d); a.p_id = id;
      return rpc('modifica_progetto', a).then(conFotoProgetto);
    },
    acquistaQuote: function (k, id, quote, messaggio) {
      return rpc('acquista_quote', { p_k: k, p_id: id, p_quote: Number(quote), p_messaggio: messaggio || '' })
        .then(function (d) { conFotoProgetto(d.progetto); return d; });
    },
    impostaStato: function (k, id, stato) {
      return rpc('imposta_stato_progetto', { p_k: k, p_id: id, p_stato: stato }).then(conFotoProgetto);
    },
    eliminaProgetto: function (k, id) { return rpc('elimina_progetto', { p_k: k, p_id: id }); },
    caricaFotoProgetto: function (k, id, dataUrl) {
      return funzione('carica-foto', { k: k, foto: dataUrl, progetto: id })
        .then(function (r) { r.foto = urlFoto(r.foto, 'progetti'); return r; });
    },

    // ----- admin -----
    adminGet: function (k) {
      return rpc('admin_get', { p_k: k }).then(function (d) { d.soci.forEach(conFoto); return d; });
    },
    adminAccredita: function (k, ids, importo, causale, forza) {
      return rpc('admin_accredita', { p_k: k, p_soci: ids, p_importo: Number(importo), p_causale: causale, p_forza: !!forza });
    },
    adminStorna: function (k, idMovimento, quote, causale) {
      return rpc('admin_storna', { p_k: k, p_movimento: idMovimento, p_quote: Number(quote), p_causale: causale || '' });
    },
    adminStorico: function (k, f) {
      f = f || {};
      return rpc('admin_storico', { p_k: k, p_socio: f.socio || null, p_mese: f.mese || null, p_tipo: f.tipo || null })
        .then(function (l) { l.forEach(function (m) { conFoto(m.socio); }); return l; });
    },
    adminSocioSalva: function (k, id, d) {
      return rpc('admin_socio_salva', { p_k: k, p_id: id || null, p_nome: d.nome, p_data_ingresso: d.dataIngresso || null,
                                        p_attivo: d.attivo === undefined ? true : !!d.attivo });
    },
    adminRigenera: function (k, id) { return rpc('admin_rigenera_codice', { p_k: k, p_id: id }); },
    adminRimuoviFoto: function (k, id) { return rpc('admin_rimuovi_foto', { p_k: k, p_id: id }); }
  };
  function argsProgetto(k, d) {
    return { p_k: k, p_titolo: d.titolo, p_descrizione: d.descrizione || '', p_quote_totali: Number(d.quoteTotali),
             p_costo_quota: Number(d.costoQuota), p_scadenza: d.scadenza };
  }
  function conFotoEvento(e) {
    if (!e) return e;
    e.foto = urlFoto(e.foto, 'eventi');
    (e.date || []).forEach(function (d) { (d.votanti || []).forEach(conFoto); });
    return e;
  }
  function conFotoProgetto(p) {
    if (!p) return p;
    p.foto = urlFoto(p.foto, 'progetti');
    conFoto(p.creatoDa);
    return p;
  }

  window.RanchAPI = Object.assign({ demo: DEMO }, DEMO ? demo : reale);
})();
