package com.clinic.export;

import com.clinic.export.PrintDoc.Block;
import com.clinic.export.PrintDoc.Field;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Trang HTML giống bản in (khổ A4), để xem trước trước khi tải PDF/Word. Không có JavaScript; CSP chặn mọi tài nguyên
 * ngoài. Dữ liệu người dùng nhập (địa chỉ, lời dặn…) luôn được thoát ký tự, không bao giờ thành thẻ HTML.
 */
public final class HtmlRenderer {
  private HtmlRenderer() {}

  static String esc(String s) {
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
  }

  static String dataUrl(String mime, byte[] data) {
    return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(data);
  }

  private static String field(Field f) {
    return "<span>" + esc(f.label()) + ": </span><span class=\"" + (f.bold() ? "b" : "") + "\">" + esc(f.shown()) + "</span>";
  }

  private static String block(Block b) {
    if (b instanceof PrintDoc.Heading h) return "<h3>" + esc(h.text()) + "</h3>";
    if (b instanceof PrintDoc.Text t) {
      List<String> cls = new ArrayList<>();
      if (t.italic()) cls.add("i");
      if (t.bold()) cls.add("b");
      if (t.indent()) cls.add("ind");
      return "<p class=\"" + String.join(" ", cls) + "\">" + esc(t.text()) + "</p>";
    }
    if (b instanceof PrintDoc.Fields fs) {
      return "<div class=\"row\">" + fs.fields().stream().map(f -> "<div>" + field(f) + "</div>").collect(Collectors.joining()) + "</div>";
    }
    if (b instanceof PrintDoc.Grid g) {
      StringBuilder rows = new StringBuilder();
      for (int i = 0; i < g.cells().size(); i += g.columns()) {
        rows.append("<tr>")
            .append(g.cells().subList(i, Math.min(i + g.columns(), g.cells().size())).stream().map(f -> "<td>" + field(f) + "</td>").collect(Collectors.joining()))
            .append("</tr>");
      }
      return "<table class=\"grid\">" + rows + "</table>";
    }
    if (b instanceof PrintDoc.Image img) {
      return "<figure><img src=\"" + dataUrl(img.mimeType(), img.data()) + "\" alt=\"" + esc(img.caption()) + "\"><figcaption>" + esc(img.caption())
          + "</figcaption></figure>";
    }
    PrintDoc.Medicine m = (PrintDoc.Medicine) b;
    return "<div class=\"med\"><div class=\"row b\"><div>" + m.index() + ". " + esc(m.name()) + "</div><div class=\"r\">" + esc(m.quantity())
        + "</div></div><p class=\"i ind\">" + esc(m.usage()) + "</p></div>";
  }

  private static final String STYLE = """
      <style>
        /* Kích thước tính theo em; cỡ chữ gốc co theo bề rộng màn hình nên cả trang A4 luôn vừa khung (như xem PDF), tối đa 15px */
        :root { color-scheme: light; }
        body { margin: 0; padding: 1em 0; background: #e5e7eb; color: #111; line-height: 1.35;
          font-family: 'Times New Roman', Tinos, 'Noto Serif', serif; font-size: min(15px, calc((100vw - 16px) / 52.933)); }
        .page { box-sizing: border-box; width: 52.933em; min-height: 74.867em; margin: 0 auto 1em; padding: 3.2em 3.733em 2.667em 5em; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
        .head { display: flex; justify-content: space-between; gap: 1em; font-size: .933em; }
        h1 { text-align: center; font-size: 1.467em; margin: .8em 0 .1em; }
        h3 { font-size: 1em; margin: .667em 0 .2em; }
        p { margin: .133em 0; }
        .sub { text-align: center; font-style: italic; margin-bottom: .533em; }
        .row { display: flex; gap: 1.867em; margin: .133em 0; } .row > div:last-child { flex: 1; }
        .grid { width: 100%; border-collapse: collapse; margin: .267em 0 .4em; font-size: .933em; }
        .grid td { border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: .2em .267em; }
        figure { margin: .4em 0; text-align: center; } figure img { max-width: 28em; max-height: 20em; } figcaption { font-style: italic; font-size: .8em; }
        .med { margin: .267em 0; } .med .row > div:last-child { flex: 0 0 auto; }
        .sign { width: 20em; margin: .933em 0 0 auto; text-align: center; } .sign .name { margin-top: 3.733em; }
        .b { font-weight: bold; } .i { font-style: italic; } .r { text-align: right; } .ind { padding-left: 1.067em; } .small { font-size: .867em; }
        .foot { width: 52.933em; margin: 0 auto; font-size: .8em; font-style: italic; color: #555; }
      </style>""";

  public static String render(PrintDoc doc) {
    StringBuilder pages = new StringBuilder();
    for (PrintDoc.Page p : doc.pages()) {
      if (!pages.isEmpty()) pages.append('\n');
      StringBuilder left = new StringBuilder();
      for (int i = 0; i < p.headerLeft().size(); i++) left.append("<div class=\"").append(i == 0 ? "b" : "").append("\">").append(esc(p.headerLeft().get(i))).append("</div>");
      String right = p.headerRight().stream().map(t -> "<div>" + esc(t) + "</div>").collect(Collectors.joining());
      pages.append("<section class=\"page\">\n")
          .append("  <div class=\"head\"><div>").append(left).append("</div>\n")
          .append("  <div class=\"r\">").append(right).append("</div></div>\n")
          .append("  <h1>").append(esc(p.title())).append("</h1>").append(p.subtitle() != null ? "<p class=\"sub\">" + esc(p.subtitle()) + "</p>" : "").append('\n')
          .append("  ").append(p.blocks().stream().map(HtmlRenderer::block).collect(Collectors.joining("\n  "))).append('\n')
          .append("  <div class=\"sign\"><div class=\"i\">").append(esc(p.sign().date())).append("</div><div class=\"b\">").append(esc(p.sign().role()))
          .append("</div><div class=\"i small\">(Ký, ghi rõ họ tên)</div><div class=\"b name\">").append(esc(p.sign().name())).append("</div></div>\n")
          .append("  ").append(p.note() != null ? "<p class=\"i small\">" + esc(p.note()) + "</p>" : "").append('\n')
          .append("</section>");
    }
    String title = doc.pages().stream().map(PrintDoc.Page::title).collect(Collectors.joining(" – "));
    return "<!doctype html>\n<html lang=\"vi\"><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>"
        + esc(title) + "</title>\n" + STYLE + "</head>\n<body>\n" + pages + "\n<p class=\"foot\">" + esc(doc.footer()) + "</p>\n</body></html>";
  }
}
