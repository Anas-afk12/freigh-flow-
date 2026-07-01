// Bill of Lading. Data comes live from jobs + clients (shipper/consignee/
// notify) + bl_data (BL-specific overrides) + containers (§12B). bl_data only
// supplies BL-specific fields; parties/commodity/weights read live from the job.
const { newDoc, letterhead, title, labelledBlock, footer, toBuffer, MARGIN } = require('./base');
const { formatDisplay } = require('../utils/dates');

function build({ job, settings, docNumber }) {
  const doc = newDoc();
  const bl = job.bl_data || {};
  const pageWidth = doc.internal.pageSize.getWidth();
  const colW = (pageWidth - MARGIN * 2 - 4) / 2;

  let y = letterhead(doc, settings);
  const blNumber = bl.bl_number || job.bl_number || '';
  y = title(doc, 'BILL OF LADING', `B/L No: ${blNumber || '—'}    Job: ${job.job_number}`, y);

  // Parties.
  let leftY = labelledBlock(doc, 'SHIPPER', [job.shipper_name, job.shipper_address], MARGIN, y, colW);
  let rightY = labelledBlock(doc, 'CONSIGNEE', [job.consignee_name, job.consignee_address], MARGIN + colW + 4, y, colW);
  y = Math.max(leftY, rightY) + 3;

  leftY = labelledBlock(doc, 'NOTIFY PARTY 1', [job.notify_1_name, job.notify_1_address], MARGIN, y, colW);
  rightY = labelledBlock(doc, 'NOTIFY PARTY 2', [job.notify_2_name, job.notify_2_address], MARGIN + colW + 4, y, colW);
  y = Math.max(leftY, rightY) + 3;

  // Voyage / ports — bl_data first, falling back to job port names.
  doc.autoTable({
    startY: y,
    theme: 'grid',
    styles: { font: 'times', fontSize: 9, cellPadding: 1.5 },
    body: [
      ['Vessel / Voyage', `${bl.vessel || firstContainerVessel(job) || ''}  ${bl.voyage || ''}`.trim()],
      ['Port of Loading', bl.port_loading || job.pol_name || ''],
      ['Port of Discharge', bl.port_discharge || job.pod_name || ''],
      ['Port of Delivery', bl.port_delivery || job.pod_name || ''],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = doc.lastAutoTable.finalY + 4;

  // Container & seal table.
  doc.autoTable({
    startY: y,
    theme: 'grid',
    head: [['Container No.', 'Seal No.', 'Type']],
    body: (job.containers || []).map((c) => [c.container_number || '', c.seal_number || '', c.container_type_code || '']),
    styles: { font: 'times', fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = doc.lastAutoTable.finalY + 4;

  // Goods / marks / weights.
  const goods = [job.commodity_name, job.commodity_description].filter(Boolean).join(' — ');
  doc.autoTable({
    startY: y,
    theme: 'grid',
    body: [
      ['Marks & Numbers', job.marks || ''],
      ['No. of Packages', job.packages != null ? String(job.packages) : ''],
      ['Description of Goods', goods],
      ['Gross Weight', job.gross_weight != null ? `${job.gross_weight} KG` : ''],
      ['Net Weight', job.net_weight != null ? `${job.net_weight} KG` : ''],
      ['Freight Terms', bl.freight_terms || ''],
      ['Free Days', bl.free_days != null ? String(bl.free_days) : ''],
    ],
    styles: { font: 'times', fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    margin: { left: MARGIN, right: MARGIN },
  });

  const issue = bl.issued_date ? formatDisplay(bl.issued_date) : formatDisplay(new Date().toISOString().slice(0, 10));
  footer(doc, `Place & Date of Issue: ${settings.company_address ? settings.company_address.split(',').pop().trim() : ''}, ${issue}`);
  return { buffer: toBuffer(doc), docNumber };
}

function firstContainerVessel(job) {
  return job.containers && job.containers[0] ? job.containers[0].vessel : '';
}

module.exports = { build };
