/* Receipt → PDF in the formal M-PESA receipt style (as "Agency Banking Cash In Receipt PDF"):
   header with logo, company details and QR · red-bordered TRANSACTION INFORMATION box · the receipt's rows ·
   TRANSACTION DETAIL table (receipt no, date and time, amount, total) · amount in words, channel, reason ·
   official stamp, M-PESA watermark, thank-you footer and red bar.
   It reads what the receipt screen shows (.detail-row label/value, the amount, the QR), lays the page out
   off-screen at A4 size, captures it (html2canvas) and saves it as a PDF (jsPDF). Libraries load on demand.
   Usage: ReceiptPDF.download({ root: '.receipt-card', name: 'M-PESA Savings', toast }) */
(function () {
  const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
  const load = src => new Promise((ok, no) => { if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const clean = t => (t || '').replace(/\s+/g, ' ').replace(/Copy ID|Copied!/g, '').trim();
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Assets live next to the page (the receipt pages sit in the project root)
  const A = p => new URL('assets/' + p, document.baseURI).href;

  // 2023.60 → "Two Thousand Twenty-Three Birr and Sixty Cents Only"
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words(n) {
    if (n === 0) return 'Zero';
    const chunk = x => { let s = ''; if (x >= 100) { s += ONES[Math.floor(x / 100)] + ' Hundred'; x %= 100; if (x) s += ' '; }
      if (x >= 20) { s += TENS[Math.floor(x / 10)] + (x % 10 ? '-' + ONES[x % 10] : ''); } else if (x) s += ONES[x]; return s; };
    const parts = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand'], [1, '']];
    let out = [];
    for (const [v, name] of parts) { const c = Math.floor(n / v); if (c) { out.push(chunk(c) + (name ? ' ' + name : '')); n %= v; } }
    return out.join(' ');
  }
  function inWords(amount) {
    const birr = Math.floor(amount), cents = Math.round((amount - birr) * 100);
    return words(birr) + ' Birr' + (cents ? ' and ' + words(cents) + ' Cents' : '') + ' Only';
  }

  const CSS = `
  .rp-page { width: 793.7px; height: 1122.5px; background: #FFF; position: relative; padding: 45.4px 52.9px 75.6px; display: flex; flex-direction: column; box-sizing: border-box; font-family: Inter, Arial, sans-serif; color: #1C1C21; overflow: hidden; }
  .rp-page * { box-sizing: border-box; margin: 0; padding: 0; }
  .rp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15.1px; padding-bottom: 15.1px; border-bottom: 1px solid #E0E0E0; }
  .rp-logo { height: 56.7px; width: auto; margin-bottom: 11.3px; display: block; }
  .rp-company { font-size: 14.7px; font-weight: 700; margin-bottom: 7.6px; }
  .rp-details { font-size: 13.3px; line-height: 2.4; }
  .rp-details .l { color: #666; letter-spacing: 0.3px; } .rp-details .v { font-weight: 700; }
  .rp-qr { text-align: center; } .rp-qr div { width: 94.5px; height: 94.5px; border: 1px solid #E0E0E0; margin-bottom: 3.8px; }
  .rp-qr img { width: 100%; height: 100%; object-fit: contain; display: block; } .rp-qr span { font-size: 9.3px; font-weight: 600; letter-spacing: 0.5px; }
  .rp-title { border: 2px solid #FE353D; padding: 9.4px 0; text-align: center; margin: 15.1px 0 22.7px; }
  .rp-title h1 { font-size: 16px; font-weight: 700; color: #FE353D; letter-spacing: 1.5px; text-transform: uppercase; }
  .rp-row { display: flex; padding: 5.7px 0; gap: 11.3px; font-size: 12px; }
  .rp-row .l { min-width: 272.1px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
  .rp-row .v { flex: 1; font-weight: 600; }
  .rp-info { margin-bottom: 22.7px; }
  .rp-sec { background: #F5F5F5; padding: 7.6px 11.3px; text-align: center; margin-bottom: 7.6px; }
  .rp-sec h2 { font-size: 13.3px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .rp-table { width: 100%; border-collapse: collapse; font-size: 11.3px; margin-bottom: 22.7px; }
  .rp-table th { background: #F5F5F5; padding: 7.6px; text-align: left; font-weight: 600; border: 1px solid #E0E0E0; }
  .rp-table th:last-child, .rp-table td:last-child { text-align: right; }
  .rp-table td { padding: 7.6px; border: 1px solid #E0E0E0; } .rp-table td:last-child { font-weight: 600; }
  .rp-table .tot td { background: #FFF1F2; font-weight: 700; font-size: 12px; color: #FE353D; }
  .rp-extra { padding-top: 15.1px; border-top: 1px solid #E0E0E0; }
  .rp-extra .words { font-style: italic; }
  .rp-stamp { position: absolute; top: 597.2px; right: 68px; width: 249.4px; height: 249.4px; opacity: 0.95; transform: rotate(-12deg); z-index: 101; }
  .rp-stamp img { width: 100%; height: 100%; object-fit: contain; }
  .rp-water { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-25deg); font-size: 140px; font-weight: 900; color: rgba(180,180,180,0.2); letter-spacing: 12px; white-space: nowrap; z-index: 100; }
  .rp-foot { text-align: center; padding: 15.1px 0 11.3px; margin-top: auto; border-top: 1px solid #E0E0E0; font-size: 11.3px; font-weight: 500; letter-spacing: 0.5px; }
  .rp-bar { position: absolute; bottom: 0; left: 0; right: 0; background: #FE353D; padding: 11.3px 22.7px; display: flex; justify-content: flex-end; }
  .rp-bar img { height: 30.2px; width: auto; }`;

  function buildPage(box, name) {
    const title = clean((box.querySelector('h2') || {}).textContent) || 'Transaction';
    const all = [...box.querySelectorAll('.detail-row')].map(r => [clean((r.querySelector('.label') || {}).textContent), clean((r.querySelector('.value') || {}).textContent)])
      .filter(([k, v]) => k && v && v !== '—');
    const get = re => (all.find(([k]) => re.test(k)) || [])[1] || '';
    const txId = get(/transaction id/i) || ('TX' + Date.now());
    const when = get(/transaction date/i) || new Date().toLocaleString('en-GB');
    const info = all.filter(([k]) => !/transaction date/i.test(k));
    const amtEl = box.querySelector('.amount-value'), sec = box.querySelector('.amount-section');
    const shown = amtEl && sec && getComputedStyle(sec).display !== 'none' && clean(amtEl.textContent);
    const amount = shown ? parseFloat(clean(amtEl.textContent).replace(/[^\d.]/g, '')) || 0
      : parseFloat((get(/^amount$|amount locked|withdrawn amount|deposited amount|^amount/i) || '0').replace(/[^\d.]/g, '')) || 0;
    const money = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' BIRR';
    const qr = box.querySelector('.qr-wrapper img');
    const page = document.createElement('div');
    page.className = 'rp-page';
    page.innerHTML = `<div class="rp-water">M-PESA</div>
      <div class="rp-header"><div style="flex:1">
          <img class="rp-logo" src="${A('M-PESA-red-logo.svg')}" alt="M-PESA">
          <div class="rp-company">Safaricom M-PESA Mobile Financial Services PLC</div>
          <div class="rp-details"><span class="l">TIN NO:</span> <span class="v">0084242753</span><br><span class="l">VAT REG NO:</span> <span class="v">22371880003</span><br>
            <span class="l">Address:</span> <span class="v">Addis Ababa, Kirkos Woreda 1</span><br><span class="l">Tel:</span> <span class="v">+251 756 765434</span></div></div>
        <div class="rp-qr"><div><img src="${qr && qr.src ? qr.src : A('qr-placeholder.svg')}" alt="QR"></div><span>SCAN TO VERIFY</span></div></div>
      <div class="rp-title"><h1>TRANSACTION INFORMATION</h1></div>
      <div class="rp-info">${info.map(([k, v]) => `<div class="rp-row"><span class="l">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
      <div class="rp-sec"><h2>TRANSACTION DETAIL</h2></div>
      <table class="rp-table"><thead><tr><th style="width:33%">RECEIPT NO</th><th style="width:33%">TRANSACTION DATE AND TIME</th><th style="width:34%">AMOUNT</th></tr></thead>
        <tbody><tr><td>${esc(txId)}</td><td>${esc(when)}</td><td>${money(amount)}</td></tr>
          <tr class="tot"><td colspan="2" style="text-align:right;padding-right:15.1px">TOTAL AMOUNT</td><td>${money(amount)}</td></tr></tbody></table>
      <div class="rp-extra">
        <div class="rp-row"><span class="l">TOTAL AMOUNT IN WORD</span><span class="v words">${inWords(amount)}</span></div>
        <div class="rp-row"><span class="l">USED CHANNEL</span><span class="v">M-PESA App</span></div>
        <div class="rp-row"><span class="l">TRANSACTION REASON</span><span class="v">${esc(name)} · ${esc(title.replace(/!$/, ''))}</span></div></div>
      <div class="rp-stamp"><img src="${A('M-PESA-official_stamp.png')}" alt=""></div>
      <div class="rp-foot">THANK YOU FOR USING M-PESA</div>
      <div class="rp-bar"><img src="${A('M-PESA-white-logo.svg')}" alt="M-PESA"></div>`;
    return { page, txId };
  }

  async function download({ root = '.receipt-card', name = 'M-PESA', toast } = {}) {
    const say = m => { if (toast) toast(m); };
    say('Preparing PDF…');
    try { for (const src of LIBS) await load(src); } catch (e) { say('Could not load the PDF tool. Check your connection.'); return; }
    const box = document.querySelector(root) || document.body;
    const { page, txId } = buildPage(box, name);
    // Off-screen holder at A4 size
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;z-index:-1;';
    const st = document.createElement('style'); st.textContent = CSS;
    holder.append(st, page); document.body.appendChild(holder);
    try {
      await Promise.all([...page.querySelectorAll('img')].map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
      const canvas = await window.html2canvas(page, { scale: 2, backgroundColor: '#FFFFFF', useCORS: true, logging: false });
      const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      const img = canvas.toDataURL('image/jpeg', 0.92); window.ReceiptPDF.lastImage = img;   // kept for a preview
      doc.addImage(img, 'JPEG', 0, 0, W, H);
      doc.save(`M-PESA-Receipt-${txId.replace(/[^\w-]/g, '')}.pdf`);
      say('Receipt downloaded as PDF');
    } catch (e) {
      console.error('Receipt PDF failed:', e);
      say('Could not create the PDF. Please try again.');
    } finally { holder.remove(); }
  }

  /* ── Contract detail (Download Detail) ──
     ReceiptPDF.contract({ name, title, ref, status, sections: [{ title, rows: [[label, value]] }], terms: [text], qr, toast })
     A4 document: header · red title box · contract no / issued / status strip · sections in two columns ·
     terms and conditions · signatures with the official stamp · footer. */
  const CCSS = `
  .ct-page { width: 793.7px; height: 1122.5px; background: #FFF; position: relative; padding: 40px 50px 72px; display: flex; flex-direction: column; box-sizing: border-box; font-family: Inter, Arial, sans-serif; color: #1C1C21; overflow: hidden; }
  .ct-page * { box-sizing: border-box; margin: 0; padding: 0; }
  .ct-head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid #E0E0E0; }
  .ct-logo { height: 48px; display: block; margin-bottom: 8px; }
  .ct-co { font-size: 13.5px; font-weight: 700; margin-bottom: 4px; }
  .ct-co-d { font-size: 11px; color: #555; line-height: 1.7; }
  .ct-qr { text-align: center; } .ct-qr div { width: 84px; height: 84px; border: 1px solid #E0E0E0; margin-bottom: 3px; } .ct-qr img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .ct-qr span { font-size: 8.5px; font-weight: 600; letter-spacing: 0.5px; }
  .ct-title { border: 2px solid #FE353D; padding: 9px 0; text-align: center; margin: 16px 0 12px; }
  .ct-title h1 { font-size: 16px; font-weight: 700; color: #FE353D; letter-spacing: 1.5px; text-transform: uppercase; }
  .ct-meta { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #E0E0E0; border-radius: 6px; margin-bottom: 14px; }
  .ct-meta div { padding: 8px 12px; } .ct-meta div + div { border-left: 1px solid #E0E0E0; }
  .ct-meta small { display: block; font-size: 9.5px; color: #777; text-transform: uppercase; letter-spacing: 0.4px; } .ct-meta b { display: block; margin-top: 2px; font-size: 12px; }
  .ct-meta .ok { color: #16A34A; }
  .ct-sec { margin-bottom: 12px; }
  .ct-sec h2 { background: #F5F5F5; padding: 6px 12px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }
  .ct-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; padding: 2px 12px 0; }
  .ct-row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #E6E6EA; font-size: 11px; }
  .ct-row span { color: #555; } .ct-row b { font-weight: 600; text-align: right; }
  .ct-terms { margin-top: 2px; padding: 10px 12px; border: 1px solid #F2C9CB; border-radius: 6px; background: #FFF8F8; }
  .ct-terms h3 { font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #FE353D; margin-bottom: 5px; }
  .ct-terms ol { padding-left: 16px; } .ct-terms li { font-size: 10px; line-height: 1.55; color: #333; margin-bottom: 2px; }
  .ct-sign { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 22px; }
  .ct-sign div { padding-top: 34px; } .ct-sign i { display: block; border-top: 1px solid #1C1C21; margin-bottom: 5px; }
  .ct-sign b { display: block; font-size: 11px; } .ct-sign small { display: block; font-size: 9.5px; color: #777; }
  .ct-stamp { position: absolute; right: 30px; top: -36px; width: 150px; height: 150px; transform: rotate(-12deg); opacity: 0.92; }
  .ct-stamp img { width: 100%; height: 100%; object-fit: contain; }
  .ct-water { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-25deg); font-size: 140px; font-weight: 900; color: rgba(180,180,180,0.16); letter-spacing: 12px; white-space: nowrap; }
  .ct-foot { margin-top: auto; padding-top: 10px; border-top: 1px solid #E0E0E0; text-align: center; font-size: 10px; color: #555; }
  .ct-bar { position: absolute; bottom: 0; left: 0; right: 0; background: #FE353D; padding: 10px 22px; display: flex; justify-content: space-between; align-items: center; color: #FFF; font-size: 10px; }
  .ct-bar img { height: 26px; }`;
  async function contract({ name = 'M-PESA', title = 'Contract Detail', ref = '', status = 'Active', sections = [], terms = [], qr, toast } = {}) {
    const say = m => { if (toast) toast(m); };
    say('Preparing contract detail…');
    try { for (const src of LIBS) await load(src); } catch (e) { say('Could not load the PDF tool. Check your connection.'); return; }
    const issued = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const page = document.createElement('div'); page.className = 'ct-page';
    page.innerHTML = `<div class="ct-water">M-PESA</div>
      <div class="ct-head"><div><img class="ct-logo" src="${A('M-PESA-red-logo.svg')}" alt="M-PESA"><div class="ct-co">Safaricom M-PESA Mobile Financial Services PLC</div>
        <div class="ct-co-d">TIN NO: 0084242753 · VAT REG NO: 22371880003<br>Addis Ababa, Kirkos Woreda 1 · Tel: +251 756 765434</div></div>
        <div class="ct-qr"><div><img src="${qr || A('qr-placeholder.svg')}" alt=""></div><span>SCAN TO VERIFY</span></div></div>
      <div class="ct-title"><h1>${esc(title)}</h1></div>
      <div class="ct-meta"><div><small>Contract No</small><b>${esc(ref || '—')}</b></div><div><small>Issued</small><b>${esc(issued)}</b></div><div><small>Status</small><b class="ok">${esc(status)}</b></div></div>
      ${sections.filter(x => x.rows && x.rows.length).map(x => `<div class="ct-sec"><h2>${esc(x.title)}</h2><div class="ct-grid">${x.rows.map(([k, v]) => `<div class="ct-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></div>`).join('')}
      ${terms.length ? `<div class="ct-terms"><h3>Terms and Conditions</h3><ol>${terms.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>` : ''}
      <div class="ct-sign"><div><i></i><b>Customer</b><small>Accepted with M-PESA PIN · ${esc(issued)}</small></div>
        <div><i></i><b>For Safaricom M-PESA</b><small>Authorized signatory</small></div><span class="ct-stamp"><img src="${A('M-PESA-official_stamp.png')}" alt=""></span></div>
      <div class="ct-foot">This contract detail was generated by the M-PESA app and is valid without a handwritten signature.</div>
      <div class="ct-bar"><span>${esc(name)}</span><img src="${A('M-PESA-white-logo.svg')}" alt="M-PESA"></div>`;
    const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;z-index:-1;';
    const st = document.createElement('style'); st.textContent = CCSS; holder.append(st, page); document.body.appendChild(holder);
    try {
      await Promise.all([...page.querySelectorAll('img')].map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
      const canvas = await window.html2canvas(page, { scale: 2, backgroundColor: '#FFFFFF', useCORS: true, logging: false });
      const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const img = canvas.toDataURL('image/jpeg', 0.92); window.ReceiptPDF.lastImage = img;
      doc.addImage(img, 'JPEG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
      doc.save(`M-PESA-Contract-${String(ref || Date.now()).replace(/[^\w-]/g, '')}.pdf`);
      say('Contract detail downloaded');
    } catch (e) { console.error('Contract PDF failed:', e); say('Could not create the PDF. Please try again.'); }
    finally { holder.remove(); }
  }
  window.ReceiptPDF = { download, contract, inWords };
})();
