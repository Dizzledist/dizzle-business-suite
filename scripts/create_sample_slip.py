"""Optional regeneration tool; runtime/CI uses the committed sample PDF, no Python needed."""
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'shared/sample-packing-slip.json').read_text())
target = root / 'output/pdf/sample-packing-slip.pdf'
target.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(target), pagesize=(612, 792))
c.setTitle('Sample packing slip - not an invoice')
c.setFillColor(HexColor('#ed4051'))
c.rect(0, 710, 612, 82, fill=True, stroke=False)
c.setFillColorRGB(1, 1, 1)
c.setFont('Helvetica-Bold', 23)
c.drawString(42, 746, 'DIZZLE / PACKING')
c.setFillColor(HexColor('#202027'))
c.setFont('Helvetica-Bold', 20)
c.drawString(42, 665, data['title'])
c.setFont('Helvetica', 11)
for y, line in [(640, data['reference']), (590, 'Ship to: ' + data['customer']), (570, data['address']), (540, 'Invoice reference: ' + data['invoiceReference'])]:
    c.drawString(42, y, line)
c.setFillColor(HexColor('#ededf1'))
c.rect(42, 455, 528, 35, fill=True, stroke=False)
c.setFillColor(HexColor('#202027'))
c.setFont('Helvetica-Bold', 11)
for x, value in [(54, 'SKU'), (205, 'Description'), (516, 'Qty')]: c.drawString(x, 468, value)
c.setFont('Helvetica', 11)
for x, value in [(54, data['sku']), (205, data['description']), (520, str(data['quantity']))]: c.drawString(x, 430, value)
c.line(42, 412, 570, 412)
c.drawString(42, 350, 'Packed by: ____________________     Checked by: ____________________')
c.setFont('Helvetica-Bold', 11)
c.drawString(42, 240, 'LOCAL REFERENCE SAMPLE ONLY')
c.setFont('Helvetica', 10)
for y, line in [(218, 'Generic sample - not job-specific. Not an invoice or shipping label.'), (200, 'No prices or payment information. Do not use for live fulfillment.')]: c.drawString(42, y, line)
c.setFont('Helvetica', 9)
c.drawString(42, 42, 'Dizzle local demo | Packing slip | Page 1 of 1')
c.save()
print(target)
