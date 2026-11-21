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
  function urlFoto(p) {
    if (!p || /^(data:|https?:)/.test(p)) return p || '';
    return URL_DB + '/storage/v1/object/public/avatar/' + p.split('/').map(encodeURIComponent).join('/');
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
        .map(function (p) { return { id: p.id, nome: p.nome, quote: perProgetto[p.id].quote, importo: perProgetto[p.id].importo }; });
      var nomiProgetti = {};
      D.progetti.forEach(function (p) { nomiProgetti[p.id] = p.nome; });
      var movimenti = miei.slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, 10)
        .map(function (m) { return { data: m.data, tipo: m.tipo, importo: m.importo, causale: m.causale,
                                     progetto: nomiProgetti[m.progetto] || '' }; });
      return attesa({ socio: pubblico(socio, s), progetti: progetti, movimenti: movimenti });
    },
    whoami: function (k) {
      var socio = perCodice(k);
      if (!socio) return attesa(null);
      return attesa({ id: socio.id, nome: socio.nome, foto: socio.foto || '' });
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
    }
  };

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
    caricaFoto: function (k, dataUrl) { return funzione('carica-foto', { k: k, foto: dataUrl }).then(conFoto); }
  };

  window.RanchAPI = Object.assign({ demo: DEMO }, DEMO ? demo : reale);
})();
