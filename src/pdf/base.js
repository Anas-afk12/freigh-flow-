// Shared PDF building blocks. All four documents share a company letterhead
// pulled from settings (§12B). We use a serif document font (times) so printed
// output reads like a real shipping document, not a web page printout.
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

const MARGIN = 14;

function newDoc() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('times', 'normal');
  return doc;
}

// Company letterhead block. Returns the Y position to continue drawing below.
function letterhead(doc, settings) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text(settings.company_name || 'FreightFlow PRO', pageWidth / 2, 16, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  const lines = [
    settings.company_address || '',
    [settings.company_phone ? `Tel: ${settings.company_phone}` : '', settings.company_email ? `Email: ${settings.company_email}` : '']
      .filter(Boolean)
      .join('   '),
  ].filter(Boolean);
  let y = 22;
  for (const line of lines) {
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += 5;
  }
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  return y + 8;
}

// Centered document title with a reference line beneath it.
function title(doc, text, refLine, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text(text, pageWidth / 2, startY, { align: 'center' });
  let y = startY + 6;
  if (refLine) {
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text(refLine, pageWidth / 2, y, { align: 'center' });
    y += 6;
  }
  return y + 2;
}

// A bordered labelled block (e.g. Shipper / Consignee) at the given position.
function labelledBlock(doc, label, contentLines, x, y, width) {
  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.text(label, x + 2, y + 4);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  let ty = y + 9;
  const lines = contentLines.filter((l) => l != null && l !== '');
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(String(line), width - 4);
    for (const w of wrapped) {
      doc.text(w, x + 2, ty);
      ty += 4.5;
    }
  }
  const height = Math.max(ty - y + 2, 20);
  doc.setDrawColor(120);
  doc.setLineWidth(0.2);
  doc.rect(x, y, width, height);
  return y + height;
}

// Footer with place/date of issue and a signature line.
function footer(doc, placeDate) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - 24;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  if (placeDate) doc.text(placeDate, MARGIN, y);
  doc.line(pageWidth - MARGIN - 55, y, pageWidth - MARGIN, y);
  doc.text('Authorised Signature', pageWidth - MARGIN - 55, y + 5);
}

function toBuffer(doc) {
  return Buffer.from(doc.output('arraybuffer'));
}

module.exports = { newDoc, letterhead, title, labelledBlock, footer, toBuffer, MARGIN };
