// Booking Note. Data from jobs + clients (shipper) + containers (§12B).
const { newDoc, letterhead, title, labelledBlock, footer, toBuffer, MARGIN } = require('./base');
const { formatDisplay, today } = require('../utils/dates');

function build({ job, settings, docNumber }) {
  const doc = newDoc();
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = letterhead(doc, settings);
  y = title(doc, 'BOOKING NOTE', `Booking No: ${docNumber}    Date: ${formatDisplay(today())}    Job: ${job.job_number}`, y);

  y = labelledBlock(doc, 'SHIPPER', [job.shipper_name, job.shipper_address], MARGIN, y, pageWidth - MARGIN * 2) + 4;

  const firstC = (job.containers && job.containers[0]) || {};
  doc.autoTable({
    startY: y,
    theme: 'grid',
    body: [
      ['Commodity', job.commodity_name || ''],
      ['Packages', job.packages != null ? String(job.packages) : ''],
      ['Gross Weight', job.gross_weight != null ? `${job.gross_weight} KG` : ''],
      ['Port of Loading', job.pol_name || ''],
      ['Port of Discharge', job.pod_name || ''],
      ['ETD', job.etd ? formatDisplay(job.etd) : ''],
      ['ETA', job.eta ? formatDisplay(job.eta) : ''],
      ['Vessel', firstC.vessel || ''],
      ['Voyage', firstC.voyage || ''],
    ],
    styles: { font: 'times', fontSize: 9, cellPadding: 1.6 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = doc.lastAutoTable.finalY + 4;

  // Container requirements — type + quantity requested.
  const byType = {};
  for (const c of job.containers || []) {
    const key = c.container_type_code || 'UNSPECIFIED';
    byType[key] = (byType[key] || 0) + 1;
  }
  doc.autoTable({
    startY: y,
    theme: 'grid',
    head: [['Container Type', 'Quantity']],
    body: Object.entries(byType).map(([t, q]) => [t, String(q)]),
    styles: { font: 'times', fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = doc.lastAutoTable.finalY + 6;

  if (job.notes) {
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.text('Special Instructions:', MARGIN, y);
    doc.setFont('times', 'normal');
    doc.text(doc.splitTextToSize(job.notes, pageWidth - MARGIN * 2), MARGIN, y + 5);
  }

  footer(doc, `Date: ${formatDisplay(today())}`);
  return { buffer: toBuffer(doc), docNumber };
}

module.exports = { build };
