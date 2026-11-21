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
    getProgetti: function () {
      var lista = D.progetti.filter(function (p) { return p.stato !== 'eliminato'; }).map(progettoPubblico);
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
    }
  };

  function oggi() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function trovaProgetto(id) { return D.progetti.filter(function (p) { return p.id === id && p.stato !== 'eliminato'; })[0]; }
  function quoteVendute(id) { return D.movimenti.filter(function (m) { return m.progetto === id; }).reduce(function (t, m) { return t + m.quote; }, 0); }
  function miniSocio(id) {
    var s = D.soci.filter(function (x) { return x.id === id; })[0] || { id: id, nome: '?' };
    return { id: s.id, nome: s.nome, foto: s.foto || '', numeroGara: s.numeroGara || null, numeroFont: s.numeroFont, numeroColore: s.numeroColore };
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
    getProgetti: function () {
      return rpc('get_progetti').then(function (d) { d.progetti.forEach(conFotoProgetto); return d; });
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
    }
  };
  function argsProgetto(k, d) {
    return { p_k: k, p_titolo: d.titolo, p_descrizione: d.descrizione || '', p_quote_totali: Number(d.quoteTotali),
             p_costo_quota: Number(d.costoQuota), p_scadenza: d.scadenza };
  }
  function conFotoProgetto(p) {
    if (!p) return p;
    p.foto = urlFoto(p.foto, 'progetti');
    conFoto(p.creatoDa);
    return p;
  }

  window.RanchAPI = Object.assign({ demo: DEMO }, DEMO ? demo : reale);
})();
