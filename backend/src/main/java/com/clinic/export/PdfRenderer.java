package com.clinic.export;

import com.clinic.export.PrintDoc.Block;
import com.clinic.export.PrintDoc.Field;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfTemplate;
import com.lowagie.text.pdf.PdfWriter;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.stream.Collectors;

/** Xuất bệnh án và đơn thuốc ra PDF khổ A4 (OpenPDF), font Tinos nhúng sẵn để hiển thị đúng tiếng Việt. */
public final class PdfRenderer {
  private static final float SIZE = 11.5f;
  private static final float MARGIN_LEFT = 56;
  private static final float MARGIN_RIGHT = 42;

  private final BaseFont regular;
  private final BaseFont bold;
  private final BaseFont italic;
  private final BaseFont boldItalic;

  private PdfRenderer() throws IOException {
    regular = load("Tinos-Regular.ttf");
    bold = load("Tinos-Bold.ttf");
    italic = load("Tinos-Italic.ttf");
    boldItalic = load("Tinos-BoldItalic.ttf");
  }

  private static BaseFont load(String name) throws IOException {
    return BaseFont.createFont(Fonts.file(name).toString(), BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
  }

  private Font font(boolean b, boolean i, float size) {
    BaseFont bf = b && i ? boldItalic : b ? bold : i ? italic : regular;
    return new Font(bf, size);
  }

  private Font font(boolean b, boolean i) {
    return font(b, i, SIZE);
  }

  public static byte[] render(PrintDoc doc) throws IOException {
    return new PdfRenderer().doRender(doc);
  }

  private byte[] doRender(PrintDoc doc) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    Document d = new Document(PageSize.A4, MARGIN_LEFT, MARGIN_RIGHT, 36, 40);
    try {
      PdfWriter writer = PdfWriter.getInstance(d, out);
      writer.setPageEvent(new Footer(doc.footer()));
      d.addTitle(doc.pages().stream().map(PrintDoc.Page::title).collect(Collectors.joining(" – ")));
      d.addCreator("Hệ thống đặt lịch khám");
      d.open();
      boolean first = true;
      for (PrintDoc.Page p : doc.pages()) {
        if (!first) d.newPage();
        first = false;
        page(d, p);
      }
      d.close();
    } catch (DocumentException e) {
      throw new IOException(e);
    }
    return out.toByteArray();
  }

  /** Chân trang: dòng ghi chú bên trái, "Trang x/y" bên phải (y điền khi đóng tài liệu). */
  private final class Footer extends PdfPageEventHelper {
    private final String text;
    private PdfTemplate total;

    Footer(String text) {
      this.text = text;
    }

    @Override
    public void onOpenDocument(PdfWriter writer, Document document) {
      total = writer.getDirectContent().createTemplate(30, 12);
    }

    @Override
    public void onEndPage(PdfWriter writer, Document document) {
      PdfContentByte cb = writer.getDirectContent();
      Font f = font(false, true, 8);
      f.setColor(new Color(0x66, 0x66, 0x66));
      float right = document.getPageSize().getWidth() - MARGIN_RIGHT;
      ColumnText ct = new ColumnText(cb);
      ct.setSimpleColumn(new Phrase(text, f), MARGIN_LEFT, 10, right - 60, 30, 9, Element.ALIGN_LEFT);
      try {
        ct.go();
      } catch (DocumentException e) {
        throw new IllegalStateException(e);
      }
      String label = "Trang " + writer.getPageNumber() + "/";
      float w = italic.getWidthPoint(label, 8);
      cb.beginText();
      cb.setFontAndSize(italic, 8);
      cb.setColorFill(new Color(0x66, 0x66, 0x66));
      cb.setTextMatrix(right - 30 - w + 18, 22);
      cb.showText(label);
      cb.endText();
      cb.addTemplate(total, right - 12, 22);
    }

    @Override
    public void onCloseDocument(PdfWriter writer, Document document) {
      total.beginText();
      total.setFontAndSize(italic, 8);
      total.setColorFill(new Color(0x66, 0x66, 0x66));
      total.setTextMatrix(0, 0);
      total.showText(String.valueOf(writer.getPageNumber() - 1));
      total.endText();
    }
  }

  private static PdfPCell bare(Element e) {
    PdfPCell c = new PdfPCell();
    c.setBorder(Rectangle.NO_BORDER);
    c.setPadding(0);
    c.addElement(e);
    return c;
  }

  private Paragraph para(String text, Font f, int align) {
    Paragraph p = new Paragraph(text, f);
    p.setAlignment(align);
    p.setLeading(0, 1.15f);
    return p;
  }

  private void page(Document d, PrintDoc.Page page) throws DocumentException, IOException {
    // Đầu trang: tên phòng khám bên trái, số bệnh án / mã đơn bên phải
    PdfPTable head = new PdfPTable(new float[] {62, 38});
    head.setWidthPercentage(100);
    PdfPCell left = new PdfPCell();
    left.setBorder(Rectangle.NO_BORDER);
    for (int i = 0; i < page.headerLeft().size(); i++) left.addElement(para(page.headerLeft().get(i), font(i == 0, false, i == 0 ? 12 : 11), Element.ALIGN_LEFT));
    PdfPCell right = new PdfPCell();
    right.setBorder(Rectangle.NO_BORDER);
    for (String t : page.headerRight()) right.addElement(para(t, font(false, false, 11), Element.ALIGN_RIGHT));
    head.addCell(left);
    head.addCell(right);
    d.add(head);

    Paragraph title = para(page.title(), font(true, false, 17), Element.ALIGN_CENTER);
    title.setSpacingBefore(10);
    title.setSpacingAfter(2);
    d.add(title);
    Paragraph sub = para(page.subtitle() == null ? "" : page.subtitle(), font(false, true), Element.ALIGN_CENTER);
    sub.setSpacingAfter(6);
    d.add(sub);

    for (Block b : page.blocks()) d.add(block(b));

    // Chữ ký: cột bên phải rộng 230 pt
    PdfPTable sign = new PdfPTable(new float[] {497 - 230, 230});
    sign.setWidthPercentage(100);
    sign.setSpacingBefore(8);
    sign.setKeepTogether(true);
    sign.addCell(bare(new Paragraph("")));
    PdfPCell s = new PdfPCell();
    s.setBorder(Rectangle.NO_BORDER);
    s.addElement(para(page.sign().date(), font(false, true), Element.ALIGN_CENTER));
    s.addElement(para(page.sign().role(), font(true, false), Element.ALIGN_CENTER));
    s.addElement(para("(Ký, ghi rõ họ tên)", font(false, true, 10), Element.ALIGN_CENTER));
    Paragraph name = para(page.sign().name(), font(true, false), Element.ALIGN_CENTER);
    name.setSpacingBefore(34);
    s.addElement(name);
    sign.addCell(s);
    d.add(sign);

    if (page.note() != null) {
      Paragraph note = para(page.note(), font(false, true, 10), Element.ALIGN_LEFT);
      note.setSpacingBefore(8);
      d.add(note);
    }
  }

  private Phrase fieldPhrase(Field f, float size) {
    Phrase ph = new Phrase();
    ph.add(new Chunk(f.label() + ": ", font(false, false, size)));
    ph.add(new Chunk(f.shown(), font(f.bold(), false, size)));
    return ph;
  }

  private Element block(Block b) throws DocumentException, IOException {
    if (b instanceof PrintDoc.Heading h) {
      Paragraph p = para(h.text(), font(true, false), Element.ALIGN_LEFT);
      p.setSpacingBefore(6);
      p.setSpacingAfter(2);
      p.setKeepTogether(true);
      return p;
    }
    if (b instanceof PrintDoc.Text t) {
      Paragraph p = para(t.text(), font(t.bold(), t.italic()), Element.ALIGN_LEFT);
      if (t.indent()) p.setIndentationLeft(12);
      p.setSpacingBefore(1);
      p.setSpacingAfter(1);
      return p;
    }
    if (b instanceof PrintDoc.Fields fs) {
      Paragraph p = new Paragraph();
      p.setLeading(0, 1.15f);
      for (int i = 0; i < fs.fields().size(); i++) {
        if (i > 0) p.add(new Chunk("        ", font(false, false)));
        p.add(fieldPhrase(fs.fields().get(i), SIZE));
      }
      p.setSpacingBefore(1);
      p.setSpacingAfter(1);
      return p;
    }
    if (b instanceof PrintDoc.Grid g) {
      PdfPTable table = new PdfPTable(g.columns());
      table.setWidthPercentage(100);
      table.setSpacingBefore(2);
      table.setSpacingAfter(4);
      Color line = new Color(0xcc, 0xcc, 0xcc);
      for (Field f : g.cells()) {
        PdfPCell c = new PdfPCell(fieldPhrase(f, 11));
        c.setBorder(Rectangle.TOP | Rectangle.BOTTOM);
        c.setBorderColor(line);
        c.setPadding(3);
        table.addCell(c);
      }
      table.completeRow();
      return table;
    }
    if (b instanceof PrintDoc.Image img) {
      // Vùng nội dung A4 rộng khoảng 497 pt
      int[] box = PrintDocBuilder.fitBox(img.width(), img.height(), 420, 300);
      Image image = Image.getInstance(img.data());
      image.scaleAbsolute(box[0], box[1]);
      image.setAlignment(Element.ALIGN_CENTER);
      PdfPTable wrap = new PdfPTable(1);
      wrap.setWidthPercentage(100);
      wrap.setKeepTogether(true);
      wrap.setSpacingBefore(4);
      wrap.setSpacingAfter(4);
      PdfPCell c = new PdfPCell();
      c.setBorder(Rectangle.NO_BORDER);
      c.addElement(image);
      Paragraph caption = para(img.caption(), font(false, true, 9.5f), Element.ALIGN_CENTER);
      caption.setSpacingBefore(2);
      c.addElement(caption);
      wrap.addCell(c);
      return wrap;
    }
    PrintDoc.Medicine m = (PrintDoc.Medicine) b;
    PdfPTable t = new PdfPTable(new float[] {75, 25});
    t.setWidthPercentage(100);
    t.setSpacingBefore(3);
    t.setSpacingAfter(2);
    t.setKeepTogether(true);
    PdfPCell nameCell = new PdfPCell(new Phrase(m.index() + ". " + m.name(), font(true, false)));
    nameCell.setBorder(Rectangle.NO_BORDER);
    nameCell.setPadding(0);
    PdfPCell qtyCell = new PdfPCell(new Phrase(m.quantity(), font(true, false)));
    qtyCell.setBorder(Rectangle.NO_BORDER);
    qtyCell.setPadding(0);
    qtyCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
    t.addCell(nameCell);
    t.addCell(qtyCell);
    PdfPCell usage = new PdfPCell(new Phrase(m.usage(), font(false, true)));
    usage.setColspan(2);
    usage.setBorder(Rectangle.NO_BORDER);
    usage.setPaddingLeft(14);
    usage.setPaddingTop(1);
    t.addCell(usage);
    return t;
  }
}
