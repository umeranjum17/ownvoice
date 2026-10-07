package dev.ownvoice.probe;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.graphics.Rect;
import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import org.json.JSONArray;
import org.json.JSONObject;

/** Snapshot the real accessible UI without unbinding the app's accessibility service. */
public class Probe extends Instrumentation {
  private final JSONArray nodes = new JSONArray();
  private String click;
  private AccessibilityNodeInfo target;
  private int watchMs;

  @Override public void onCreate(Bundle args) { super.onCreate(args); click = args == null ? null : args.getString("click"); watchMs = args == null ? 0 : Integer.parseInt(args.getString("watchMs", "0")); start(); }

  private JSONArray bounds(Rect r) {
    return new JSONArray().put(r.left).put(r.top).put(r.right).put(r.bottom);
  }

  private void walk(AccessibilityNodeInfo node, AccessibilityWindowInfo window) throws Exception {
    if (node == null) return;
    if (click != null && target == null && node.isVisibleToUser() && node.isClickable()
        && (click.contentEquals(node.getContentDescription() == null ? "" : node.getContentDescription())
          || click.contentEquals(node.getText() == null ? "" : node.getText()))) target = node;
    Rect rect = new Rect(); node.getBoundsInScreen(rect);
    Rect frame = new Rect(); window.getBoundsInScreen(frame);
    nodes.put(new JSONObject()
      .put("label", String.valueOf(node.getContentDescription() == null ? "" : node.getContentDescription()))
      .put("text", node.isPassword() || node.getText() == null ? "" : node.getText().toString())
      .put("className", String.valueOf(node.getClassName()))
      .put("checkable", node.isCheckable()).put("checked", node.isChecked())
      .put("editable", node.isEditable()).put("password", node.isPassword())
      .put("focused", node.isFocused()).put("clickable", node.isClickable()).put("enabled", node.isEnabled())
      .put("app", String.valueOf(node.getPackageName()))
      .put("selectionStart", node.getTextSelectionStart()).put("selectionEnd", node.getTextSelectionEnd())
      .put("visible", node.isVisibleToUser()).put("bounds", bounds(rect))
      .put("windowType", window.getType()).put("windowBounds", bounds(frame)));
    for (int i = 0; i < node.getChildCount(); i++) walk(node.getChild(i), window);
  }

  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      UiAutomation ui = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
      AccessibilityServiceInfo info = ui.getServiceInfo();
      info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
      ui.setServiceInfo(info);
      if (watchMs > 0) {
        JSONArray changes = new JSONArray();
        ui.setOnAccessibilityEventListener(event -> {
          if (event.getEventType() != android.view.accessibility.AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
              || event.isPassword() || !"com.android.chrome".contentEquals(event.getPackageName() == null ? "" : event.getPackageName())) return;
          try {
            String text = event.getText().isEmpty() ? "" : event.getText().get(0).toString();
            String before = event.getBeforeText() == null ? "" : event.getBeforeText().toString();
            JSONObject change = new JSONObject().put("fromIndex", event.getFromIndex()).put("addedCount", event.getAddedCount())
              .put("removedCount", event.getRemovedCount()).put("textLength", text.length()).put("beforeLength", before.length())
              .put("tail", text.substring(Math.max(0, text.length() - 80))).put("beforeTail", before.substring(Math.max(0, before.length() - 80)));
            synchronized (changes) { changes.put(change); }
          } catch (Exception error) { throw new RuntimeException(error); }
        });
        Thread.sleep(watchMs);
        ui.setOnAccessibilityEventListener(null);
        synchronized (changes) { result.putString("changes", changes.toString()); }
      }
      for (AccessibilityWindowInfo window : ui.getWindows()) walk(window.getRoot(), window);
      if (click != null) result.putBoolean("clicked", target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK));
      result.putString("nodes", nodes.toString());
      finish(0, result);
    } catch (Throwable error) {
      result.putString("error", error.toString()); finish(1, result);
    }
  }
}
