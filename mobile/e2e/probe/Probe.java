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
  private String setLabel;
  private String setValue;
  private AccessibilityNodeInfo target;
  private AccessibilityNodeInfo setTarget;

  @Override public void onCreate(Bundle args) { super.onCreate(args); click = args == null ? null : args.getString("click");
    setLabel = args == null ? null : args.getString("settext"); setValue = args == null ? null : args.getString("value"); start(); }

  private JSONArray bounds(Rect r) {
    return new JSONArray().put(r.left).put(r.top).put(r.right).put(r.bottom);
  }

  private void walk(AccessibilityNodeInfo node, AccessibilityWindowInfo window) throws Exception {
    if (node == null) return;
    if (click != null && target == null && node.isVisibleToUser() && node.isClickable()
        && (click.contentEquals(node.getContentDescription() == null ? "" : node.getContentDescription())
          || click.contentEquals(node.getText() == null ? "" : node.getText()))) target = node;
    if (setLabel != null && setTarget == null && node.isVisibleToUser() && node.isEditable() && !node.isPassword()
        && !"com.android.chrome:id/url_bar".contentEquals(node.getViewIdResourceName())
        && (setLabel.isEmpty()
          || setLabel.contentEquals(node.getContentDescription() == null ? "" : node.getContentDescription())
          || setLabel.contentEquals(node.getText() == null ? "" : node.getText()))) setTarget = node;
    Rect rect = new Rect(); node.getBoundsInScreen(rect);
    Rect frame = new Rect(); window.getBoundsInScreen(frame);
    nodes.put(new JSONObject()
      .put("label", String.valueOf(node.getContentDescription() == null ? "" : node.getContentDescription()))
      .put("text", node.isPassword() || node.getText() == null ? "" : node.getText().toString())
      .put("className", String.valueOf(node.getClassName()))
      .put("checkable", node.isCheckable()).put("checked", node.isChecked())
      .put("editable", node.isEditable()).put("password", node.isPassword())
      .put("focused", node.isFocused()).put("clickable", node.isClickable())
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
      if (setLabel != null) {
        final Bundle arguments = new Bundle();
        arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, setValue == null ? "" : setValue);
        result.putBoolean("set", setTarget != null && setTarget.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments));
      }
      result.putString("nodes", nodes.toString());
      finish(0, result);
    } catch (Throwable error) {
      result.putString("error", error.toString()); finish(1, result);
    }
  }
}
