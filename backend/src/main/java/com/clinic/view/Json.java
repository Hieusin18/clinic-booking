package com.clinic.view;

import java.util.LinkedHashMap;
import java.util.Map;

/** Dựng object JSON theo thứ tự khóa: Json.obj("id", 1, "name", "A"). */
public final class Json {
  private Json() {}

  public static Map<String, Object> obj(Object... kv) {
    Map<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
    return m;
  }
}
