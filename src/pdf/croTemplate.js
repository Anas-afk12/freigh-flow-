// CRO Request (Container Release Order). Data from jobs + clients (shipper) +
// containers + container_types (§12B). Pickup location comes from
// containers.pickup_location; validity/free days from bl_data if generated.
const { newDoc, letterhead, title, labelledBlock, footer, toBuffer, MARGIN } = require('./base');
const { formatDisplay, today } = require('../utils/dates');

function build({ job, settings, docNumber }) {
  const doc = newDoc();
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = letterhead(doc, settings);
  y = title(doc, 'CRO REQUEST', `CRO No: ${docNumber}    Date: ${formatDisplay(today())}    Job: ${job.job_number}`, y);

  y = labelledBlock(doc, 'REQUESTING PARTY (SHIPPER)', [job.shipper_name, job.shipper_address], MARGIN, y, pageWidth - MARGIN * 2) + 4;

  const firstC = (job.containers && job.containers[0]) || {};
  const byType = {};
  for (const c of job.containers || []) {
    const key = c.container_type_code || 'UNSPECIFIED';
    byType[key] = (byType[key] || 0) + 1;
  }
  const typeQty = Object.entries(byType).map(([t, q]) => `${q} x ${t}`).join(', ');
  const freeDays = job.bl_data && job.bl_data.free_days != null ? String(job.bl_data.free_days) : '';

  doc.autoTable({
    startY: y,
    theme: 'grid',
    body: [
      ['Container Type / Qty', typeQty],
      ['Vessel', firstC.vessel || ''],
      ['Voyage', firstC.voyage || ''],
      ['Port of Loading', job.pol_name || ''],
      ['Pickup Location / Empty Depot', firstC.pickup_location || ''],
      ['Validity / Free Days', freeDays],
    ],
    styles: { font: 'times', fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    margin: { left: MARGIN, right: MARGIN },
  });

  footer(doc, `Date: ${formatDisplay(today())}`);
  return { buffer: toBuffer(doc), docNumber };
}

module.exports = { build };
