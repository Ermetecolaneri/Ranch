// Dati di esempio per la modalità demo. Nomi e cifre inventati.
window.RANCH_DEMO = {
  soci: [
    { id: 's01', nome: 'Andrea Di Paolo', numeroGara: 7,  bio: 'Curva La Parente in terza piena.', dataIngresso: '2025-03-01', foto: '', attivo: true, codice: 'demo-andrea' },
    { id: 's02', nome: 'Ermete',          numeroGara: 1,  bio: 'Fondatore e tesoriere del ranch.', dataIngresso: '2025-01-15', foto: '', attivo: true, codice: 'demo-ermete' },
    { id: 's03', nome: 'Francesco Rossi', numeroGara: 23, bio: '', dataIngresso: '2025-04-10', foto: '', attivo: true, codice: 'demo-francesco' },
    { id: 's04', nome: 'Giulia Colanzi',  numeroGara: 44, bio: 'Più veloce in salita che in discesa.', dataIngresso: '2025-02-20', foto: '', attivo: true, codice: 'demo-giulia' },
    { id: 's05', nome: 'Luca Bianchi',    numeroGara: 12, bio: 'Meccanico ufficiale.', dataIngresso: '2025-01-15', foto: '', attivo: true, codice: 'demo-luca' },
    { id: 's06', nome: 'Marco Ricci',     numeroGara: 99, bio: '', dataIngresso: '2025-05-02', foto: '', attivo: true, codice: 'demo-marco' },
    { id: 's07', nome: 'Matteo Ferri',    numeroGara: 5,  bio: 'Telemetria o non è successo.', dataIngresso: '2025-06-01', foto: '', attivo: true, codice: 'demo-matteo' },
    { id: 's08', nome: 'Paolo Santoro',   numeroGara: 31, bio: '', dataIngresso: '2025-06-01', foto: '', attivo: true, codice: 'demo-paolo' },
    { id: 's09', nome: 'Sara Di Biase',   numeroGara: 8,  bio: 'Fotografa del gruppo.', dataIngresso: '2025-07-12', foto: '', attivo: true, codice: 'demo-sara' },
    { id: 's10', nome: 'Simone Verna',    numeroGara: 66, bio: '', dataIngresso: '2025-09-01', foto: '', attivo: true, codice: 'demo-simone' },
    { id: 's11', nome: 'Vecchio Socio',   numeroGara: 0,  bio: '', dataIngresso: '2025-01-15', foto: '', attivo: false, codice: 'demo-vecchio' }
  ],
  progetti: [
    { id: 'p01', nome: 'Tribuna' },
    { id: 'p02', nome: 'Illuminazione pista' },
    { id: 'p03', nome: 'Box attrezzi' }
  ],
  movimenti: (function () {
    var m = [], n = 0;
    function add(data, socio, tipo, importo, progetto, quote, causale) {
      n++;
      m.push({ id: 'm' + n, data: data, socio: socio, tipo: tipo, importo: importo,
               progetto: progetto || '', quote: quote || 0, causale: causale || '' });
    }
    var attivi = ['s01','s02','s03','s04','s05','s06','s07','s08','s09','s10'];
    ['2026-09-01','2026-10-01','2026-11-01'].forEach(function (d, i) {
      var mese = ['settembre','ottobre','novembre'][i];
      attivi.forEach(function (s) { add(d + 'T10:00:00', s, 'accredito', 25, '', 0, 'Quota ' + mese); });
    });
    add('2026-09-05T18:20:00', 's01', 'acquisto', -40, 'p01', 4, '4 quote');
    add('2026-09-06T21:02:00', 's02', 'acquisto', -50, 'p01', 5, '5 quote');
    add('2026-09-10T09:41:00', 's04', 'acquisto', -20, 'p02', 1, '1 quota');
    add('2026-10-02T19:15:00', 's05', 'acquisto', -30, 'p01', 3, '3 quote');
    add('2026-10-03T12:00:00', 's07', 'acquisto', -40, 'p02', 2, '2 quote');
    add('2026-10-04T08:30:00', 's06', 'acquisto', -60, 'p01', 6, '6 quote');
    add('2026-10-09T17:44:00', 's01', 'acquisto', -20, 'p03', 4, '4 quote');
    add('2026-10-12T20:10:00', 's09', 'acquisto', -20, 'p02', 1, '1 quota');
    add('2026-10-15T11:00:00', 's06', 'storno', 10, 'p01', -1, 'Correzione: 1 quota in più');
    add('2026-11-03T18:00:00', 's02', 'acquisto', -15, 'p03', 3, '3 quote');
    add('2026-11-04T22:05:00', 's03', 'acquisto', -50, 'p01', 5, '5 quote');
    add('2026-11-08T07:55:00', 's08', 'acquisto', -40, 'p02', 2, '2 quote');
    add('2026-11-10T16:20:00', 's10', 'acquisto', -25, 'p03', 5, '5 quote');
    add('2026-11-12T13:13:00', 's05', 'acquisto', -20, 'p02', 1, '1 quota');
    return m;
  })()
};
