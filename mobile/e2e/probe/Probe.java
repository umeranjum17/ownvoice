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

  @Override public void onCreate(Bundle args) { super.onCreate(args); click = args == null ? null : args.getString("click"); start(); }

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
      .put("focused", node.isFocused()).put("accessibilityFocused", node.isAccessibilityFocused()).put("clickable", node.isClickable()).put("enabled", node.isEnabled())
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
      for (AccessibilityWindowInfo window : ui.getWindows()) walk(window.getRoot(), window);
      if (click != null) result.putBoolean("clicked", target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK));
      result.putString("nodes", nodes.toString());
      finish(0, result);
    } catch (Throwable error) {
      result.putString("error", error.toString()); finish(1, result);
    }
  }
}
