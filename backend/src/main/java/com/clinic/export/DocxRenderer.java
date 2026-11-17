package com.clinic.export;

import com.clinic.export.PrintDoc.Block;
import com.clinic.export.PrintDoc.Field;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.util.List;
import java.util.stream.Collectors;
import org.apache.poi.openxml4j.exceptions.InvalidFormatException;
import org.apache.poi.util.Units;
import org.apache.poi.wp.usermodel.HeaderFooterType;
import org.apache.poi.xwpf.usermodel.BreakType;
import org.apache.poi.xwpf.usermodel.Document;
import org.apache.poi.xwpf.usermodel.LineSpacingRule;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFFooter;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageMar;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageSz;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSectPr;

/** Xuất bệnh án và đơn thuốc ra Word (.docx) bằng Apache POI; cùng nội dung với bản PDF. */
public final class DocxRenderer {
  private static final String FONT = "Times New Roman";
  private static final double SIZE = 11.5;

  private final XWPFDocument doc = new XWPFDocument();

  private DocxRenderer() {}

  public static byte[] render(PrintDoc printDoc) throws IOException {
    return new DocxRenderer().doRender(printDoc);
  }

  private byte[] doRender(PrintDoc printDoc) throws IOException {
    doc.getProperties().getCoreProperties().setCreator("Hệ thống đặt lịch khám");
    doc.getProperties().getCoreProperties().setTitle(printDoc.pages().stream().map(PrintDoc.Page::title).collect(Collectors.joining(" – ")));

    CTSectPr sect = doc.getDocument().getBody().isSetSectPr() ? doc.getDocument().getBody().getSectPr() : doc.getDocument().getBody().addNewSectPr();
    CTPageSz size = sect.isSetPgSz() ? sect.getPgSz() : sect.addNewPgSz();
    size.setW(BigInteger.valueOf(11906));
    size.setH(BigInteger.valueOf(16838));
    CTPageMar mar = sect.isSetPgMar() ? sect.getPgMar() : sect.addNewPgMar();
    mar.setTop(BigInteger.valueOf(720));
    mar.setBottom(BigInteger.valueOf(720));
    mar.setLeft(BigInteger.valueOf(1130));
    mar.setRight(BigInteger.valueOf(840));
    mar.setFooter(BigInteger.valueOf(360));

    XWPFFooter footer = doc.createFooter(HeaderFooterType.DEFAULT);
    XWPFParagraph fp = footer.createParagraph();
    run(fp, printDoc.footer(), false, true, 8);

    List<PrintDoc.Page> pages = printDoc.pages();
    for (int i = 0; i < pages.size(); i++) page(pages.get(i), i == pages.size() - 1);

    ByteArrayOutputStream out = new ByteArrayOutputStream();
    doc.write(out);
    doc.close();
    return out.toByteArray();
  }

  private static XWPFRun run(XWPFParagraph p, String text, boolean bold, boolean italic, double size) {
    XWPFRun r = p.createRun();
    r.setText(text);
    r.setFontFamily(FONT);
    r.setFontSize(size);
    r.setBold(bold);
    r.setItalic(italic);
    return r;
  }

  private static XWPFRun run(XWPFParagraph p, String text, boolean bold, boolean italic) {
    return run(p, text, bold, italic, SIZE);
  }

  private static void spacing(XWPFParagraph p, int before, int after) {
    p.setSpacingBefore(before);
    p.setSpacingAfter(after);
    p.setSpacingBetween(1.1, LineSpacingRule.AUTO);
  }

  private XWPFParagraph para(int before, int after) {
    XWPFParagraph p = doc.createParagraph();
    spacing(p, before, after);
    return p;
  }

  private static void fieldRuns(XWPFParagraph p, Field f) {
    run(p, f.label() + ": ", false, false);
    run(p, f.shown(), f.bold(), false);
  }

  /** Bảng không viền chiếm toàn bộ bề rộng. */
  private XWPFTable table(int rows, int cols, boolean borders) {
    XWPFTable t = doc.createTable(rows, cols);
    t.setWidth("100%");
    if (!borders) {
      t.setTopBorder(XWPFTable.XWPFBorderType.NONE, 0, 0, "FFFFFF");
      t.setBottomBorder(XWPFTable.XWPFBorderType.NONE, 0, 0, "FFFFFF");
      t.setLeftBorder(XWPFTable.XWPFBorderType.NONE, 0, 0, "FFFFFF");
      t.setRightBorder(XWPFTable.XWPFBorderType.NONE, 0, 0, "FFFFFF");
      t.setInsideHBorder(XWPFTable.XWPFBorderType.NONE, 0, 0, "FFFFFF");
      t.setInsideVBorder(XWPFTable.XWPFBorderType.NONE, 0, 0, "FFFFFF");
    }
    return t;
  }

  /** Đoạn đầu tiên của ô (ô mới tạo đã có sẵn một đoạn trống). */
  private static XWPFParagraph first(XWPFTableCell c) {
    XWPFParagraph p = c.getParagraphs().get(0);
    spacing(p, 0, 0);
    return p;
  }

  private static XWPFParagraph next(XWPFTableCell c) {
    XWPFParagraph p = c.addParagraph();
    spacing(p, 0, 0);
    return p;
  }

  private void page(PrintDoc.Page page, boolean last) throws IOException {
    XWPFTable head = table(1, 2, false);
    XWPFTableCell left = head.getRow(0).getCell(0);
    left.setWidth("60%");
    for (int i = 0; i < page.headerLeft().size(); i++) run(i == 0 ? first(left) : next(left), page.headerLeft().get(i), i == 0, false, 11);
    XWPFTableCell right = head.getRow(0).getCell(1);
    right.setWidth("40%");
    for (int i = 0; i < page.headerRight().size(); i++) {
      XWPFParagraph p = i == 0 ? first(right) : next(right);
      p.setAlignment(ParagraphAlignment.RIGHT);
      run(p, page.headerRight().get(i), false, false, 11);
    }

    XWPFParagraph title = para(200, 20);
    title.setAlignment(ParagraphAlignment.CENTER);
    run(title, page.title(), true, false, 17);
    if (page.subtitle() != null) {
      XWPFParagraph sub = para(0, 120);
      sub.setAlignment(ParagraphAlignment.CENTER);
      run(sub, page.subtitle(), false, true);
    }

    for (Block b : page.blocks()) block(b);

    XWPFTable sign = table(1, 2, false);
    XWPFTableRow row = sign.getRow(0);
    row.setCantSplitRow(true);
    row.getCell(0).setWidth("50%");
    XWPFTableCell s = row.getCell(1);
    s.setWidth("50%");
    XWPFParagraph p1 = first(s);
    p1.setSpacingBefore(120);
    p1.setAlignment(ParagraphAlignment.CENTER);
    run(p1, page.sign().date(), false, true);
    XWPFParagraph p2 = next(s);
    p2.setAlignment(ParagraphAlignment.CENTER);
    run(p2, page.sign().role(), true, false);
    XWPFParagraph p3 = next(s);
    p3.setAlignment(ParagraphAlignment.CENTER);
    run(p3, "(Ký, ghi rõ họ tên)", false, true, 10);
    XWPFParagraph p4 = next(s);
    p4.setAlignment(ParagraphAlignment.CENTER);
    p4.setSpacingBefore(760);
    run(p4, page.sign().name(), true, false);

    if (page.note() != null) run(para(200, 20), page.note(), false, true, 10);
    if (!last) para(0, 0).createRun().addBreak(BreakType.PAGE);
  }

  private void block(Block b) throws IOException {
    if (b instanceof PrintDoc.Heading h) {
      run(para(120, 40), h.text(), true, false);
    } else if (b instanceof PrintDoc.Text t) {
      XWPFParagraph p = para(0, 20);
      if (t.indent()) p.setIndentationLeft(240);
      run(p, t.text(), t.bold(), t.italic());
    } else if (b instanceof PrintDoc.Fields fs) {
      // Nhiều ô trên một dòng: cách nhau bằng tab để người dùng Word dễ sửa
      XWPFParagraph p = para(0, 20);
      for (int i = 0; i < fs.fields().size(); i++) {
        if (i > 0) {
          XWPFRun tab = p.createRun();
          tab.addTab();
          tab.addTab();
        }
        fieldRuns(p, fs.fields().get(i));
      }
    } else if (b instanceof PrintDoc.Grid g) {
      int rows = (g.cells().size() + g.columns() - 1) / g.columns();
      XWPFTable t = table(rows, g.columns(), true);
      for (int i = 0; i < g.cells().size(); i++) {
        XWPFTableCell c = t.getRow(i / g.columns()).getCell(i % g.columns());
        c.setWidth((100 / g.columns()) + "%");
        fieldRuns(first(c), g.cells().get(i));
      }
      para(0, 40);
    } else if (b instanceof PrintDoc.Image img) {
      int[] box = PrintDocBuilder.fitBox(img.width(), img.height(), 520, 380);
      XWPFParagraph p = para(80, 20);
      p.setAlignment(ParagraphAlignment.CENTER);
      try {
        p.createRun().addPicture(new ByteArrayInputStream(img.data()),
            "image/png".equals(img.mimeType()) ? Document.PICTURE_TYPE_PNG : Document.PICTURE_TYPE_JPEG, img.caption(),
            Units.pixelToEMU(box[0]), Units.pixelToEMU(box[1]));
      } catch (InvalidFormatException e) {
        throw new IOException(e);
      }
      XWPFParagraph cap = para(0, 80);
      cap.setAlignment(ParagraphAlignment.CENTER);
      run(cap, img.caption(), false, true, 9.5);
    } else {
      PrintDoc.Medicine m = (PrintDoc.Medicine) b;
      XWPFTable t = table(1, 2, false);
      XWPFTableCell nameCell = t.getRow(0).getCell(0);
      nameCell.setWidth("75%");
      XWPFParagraph np = first(nameCell);
      np.setSpacingBefore(60);
      run(np, m.index() + ". " + m.name(), true, false);
      XWPFTableCell qtyCell = t.getRow(0).getCell(1);
      qtyCell.setWidth("25%");
      XWPFParagraph qp = first(qtyCell);
      qp.setSpacingBefore(60);
      qp.setAlignment(ParagraphAlignment.RIGHT);
      run(qp, m.quantity(), true, false);
      XWPFParagraph usage = para(0, 20);
      usage.setIndentationLeft(280);
      run(usage, m.usage(), false, true);
    }
  }
}
