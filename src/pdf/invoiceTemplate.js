// Invoice. Data from jobs + clients (bill-to) + rates (SELLING rows only).
// Totals shown per currency present — the printed invoice is NOT force-
// converted (conversion is internal profit only, §12B).
const { newDoc, letterhead, title, labelledBlock, footer, toBuffer, MARGIN } = require('./base');
const { formatDisplay, today } = require('../utils/dates');
const { money } = require('../utils/numbers');

function build({ job, settings, docNumber, sellingRates }) {
  const doc = newDoc();
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = letterhead(doc, settings);
  y = title(doc, 'INVOICE', `Invoice No: ${docNumber}    Date: ${formatDisplay(today())}    Job: ${job.job_number}`, y);

  // Bill-to: consignee for PREPAID, otherwise shipper; default shipper.
  const terms = job.bl_data && job.bl_data.freight_terms;
  const billToName = terms === 'COLLECT' ? job.consignee_name : job.shipper_name;
  const billToAddr = terms === 'COLLECT' ? job.consignee_address : job.shipper_address;
  y = labelledBlock(doc, 'BILL TO', [billToName || job.shipper_name, billToAddr || job.shipper_address], MARGIN, y, pageWidth - MARGIN * 2) + 4;

  // Shipment reference.
  const ref = [
    job.bl_number ? `B/L: ${job.bl_number}` : '',
    job.pol_name && job.pod_name ? `${job.pol_name} → ${job.pod_name}` : '',
    job.etd ? `ETD: ${formatDisplay(job.etd)}` : '',
  ].filter(Boolean).join('    ');
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text(ref, MARGIN, y);
  y += 6;

  // Line items — one row per selling rate.
  doc.autoTable({
    startY: y,
    theme: 'grid',
    head: [['Charge Type', 'Currency', 'Amount']],
    body: (sellingRates || []).map((r) => [r.charge_type, r.currency, money(r.amount)]),
    styles: { font: 'times', fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 2: { halign: 'right' } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = doc.lastAutoTable.finalY + 4;

  // Subtotal per currency (no cross-currency conversion on the printed doc).
  const totals = {};
  for (const r of sellingRates || []) totals[r.currency] = (totals[r.currency] || 0) + Number(r.amount);
  const totalRows = Object.entries(totals).map(([cur, amt]) => [`TOTAL DUE (${cur})`, money(amt)]);
  doc.autoTable({
    startY: y,
    theme: 'plain',
    body: totalRows,
    styles: { font: 'times', fontSize: 11, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'right', cellWidth: pageWidth - MARGIN * 2 - 40 }, 1: { halign: 'right' } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = doc.lastAutoTable.finalY + 6;

  // A5 — LC block appears ONLY when the job actually has an LC number.
  if (job.lc_number) {
    doc.autoTable({
      startY: y,
      theme: 'grid',
      head: [['Letter of Credit', '']],
      body: [
        ['LC Number', job.lc_number],
        ['Issuing Bank', job.lc_issuing_bank || ''],
        ['LC Amount', job.lc_amount != null ? `${money(job.lc_amount)} ${job.lc_currency || ''}` : ''],
        ['Expiry Date', job.lc_expiry_date ? formatDisplay(job.lc_expiry_date) : ''],
      ],
      styles: { font: 'times', fontSize: 9, cellPadding: 1.6 },
      headStyles: { fillColor: [40, 40, 40] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = doc.lastAutoTable.finalY + 5;
  }

  if (settings.bank_details) {
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(`Payment details: ${settings.bank_details}`, pageWidth - MARGIN * 2), MARGIN, y);
  }

  footer(doc, `Date: ${formatDisplay(today())}`);
  return { buffer: toBuffer(doc), docNumber };
}

module.exports = { build };
