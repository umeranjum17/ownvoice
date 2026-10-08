package dev.ownvoice.bridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OwnvoiceNativeModule : Module() {
  private val context get() = appContext.reactContext!!
  override fun definition() = ModuleDefinition {
    Name("OwnvoiceNative")
    Events("onServiceChange", "onInserted", "onTyped")
    OnCreate {
      OwnvoiceService.onInserted = { ok, newlinesLost, practice -> sendEvent("onInserted", mapOf("ok" to ok, "newlinesLost" to newlinesLost, "practice" to practice)) }
      OwnvoiceService.onServiceChange = { state -> sendEvent("onServiceChange", mapOf("state" to state)) }
    }
    OnDestroy { OwnvoiceService.onInserted = null; OwnvoiceService.onServiceChange = null; OwnvoiceService.onTyped = null }
    // A typing pause reaches JavaScript only while it listens; one that came first waits for the listener.
    OnStartObserving("onTyped") {
      OwnvoiceService.onTyped = { app, text -> sendEvent("onTyped", mapOf("app" to app, "text" to text)) }
      OwnvoiceService.pendingTyped?.let { (app, text) -> OwnvoiceService.pendingTyped = null; sendEvent("onTyped", mapOf("app" to app, "text" to text)) }
    }
    OnStopObserving("onTyped") { OwnvoiceService.onTyped = null }

    AsyncFunction("openAccessibilitySettings") { comeBack: Boolean ->
      check(context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).edit().putBoolean("comeBack", comeBack).commit())
      val me = ComponentName(context, OwnvoiceService::class.java).flattenToString()
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(":settings:fragment_args_key", me))
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("clearSetupReturn") {
      check(context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).edit().remove("comeBack").commit())
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setPractice") { on: Boolean ->
      OwnvoiceService.practice = on
      OwnvoiceService.instance?.updateBubble()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("openAppInfo") {
      context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        .setData(android.net.Uri.fromParts("package", context.packageName, null)))
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("launcherApps") Coroutine { packages: List<String>? ->
      val pm = context.packageManager
      val size = (40 * context.resources.displayMetrics.density).toInt()
      pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        .filter { packages == null || it.activityInfo.packageName in packages }
        .distinctBy { it.activityInfo.packageName }
        .map { info ->
          val icon = if (packages != null) runCatching {
            val drawable = info.loadIcon(pm)
            val bitmap = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(bitmap)
            drawable.setBounds(0, 0, canvas.width, canvas.height)
            drawable.draw(canvas)
            val bytes = java.io.ByteArrayOutputStream()
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, bytes)
            bitmap.recycle()
            android.util.Base64.encodeToString(bytes.toByteArray(), android.util.Base64.NO_WRAP)
          }.getOrNull() else null
          mapOf("app" to info.activityInfo.packageName, "label" to info.loadLabel(pm).toString(), "icon" to icon)
        }
        .sortedBy { it["label"]?.lowercase() }
    }
    AsyncFunction("bubbleRules") {
      val prefs = context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE)
      mapOf("paused" to prefs.getBoolean("paused", false), "on" to prefs.getStringSet("on", emptySet()).orEmpty().toList(),
        "off" to prefs.getStringSet("off", emptySet()).orEmpty().toList())
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setBubbleRules") { rules: Map<String, Any?> ->
      val paused = rules["paused"] as? Boolean ?: false
      val on = (rules["on"] as? List<String>).orEmpty()
      val off = (rules["off"] as? List<String>).orEmpty()
      val service = OwnvoiceService.instance
      if (service != null) service.setRules(paused, on.toSet(), off.toSet())
      else check(context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).edit()
        .putBoolean("paused", paused).putStringSet("on", on.toSet()).putStringSet("off", off.toSet()).commit())
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("typingCheck") {
      context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).getBoolean("typingCheck", false)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setTypingCheck") { on: Boolean ->
      check(context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).edit().putBoolean("typingCheck", on).commit())
      OwnvoiceService.typingCheck = on
      if (!on) OwnvoiceService.instance?.typingOff()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("showSlips") { app: String, count: Int, label: String, checkMs: Double ->
      OwnvoiceService.instance?.showSlips(app, count, label, checkMs)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("say") { message: String, ms: Int? -> OwnvoiceService.instance?.say(message, (ms ?: 4000).toLong()) }.runOnQueue(Queues.MAIN)
    AsyncFunction("serviceState") { state() }.runOnQueue(Queues.MAIN)
    // The home switch turns the service off the same way the phone's own row does (MainActivity.power).
    AsyncFunction("turnOff") { OwnvoiceService.instance?.disableSelf() }.runOnQueue(Queues.MAIN)
    AsyncFunction("capture") {
      OwnvoiceService.instance?.captured()?.let { c -> mapOf("conversation" to c.conversation, "written" to c.written, "typed" to c.typed, "app" to c.app, "label" to c.label, "at" to c.at, "id" to c.id, "hasField" to (c.input != null), "typingLimited" to c.typingLimited, "fieldTop" to c.fieldTop, "nodes" to c.nodes.map { mapOf("text" to it.text, "left" to it.left, "top" to it.top, "bottom" to it.bottom, "clickable" to it.clickable, "viewId" to it.viewId, "description" to it.description) }) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("takeTapFacts") {
      OwnvoiceService.savedFacts(context).map { mapOf("at" to it.at, "app" to it.app, "label" to it.label, "screen" to it.screen, "typed" to it.typed, "replying" to it.replying, "id" to it.id, "sent" to it.sent, "inserted" to it.inserted) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("markTapSent") { id: String -> OwnvoiceService.markTapSent(context, id) }.runOnQueue(Queues.MAIN)
    AsyncFunction("unmarkTapSent") { id: String -> OwnvoiceService.unmarkTapSent(context, id) }.runOnQueue(Queues.MAIN)
    AsyncFunction("clearTapFacts") {
      OwnvoiceService.clearSavedFacts(context)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("forget") { OwnvoiceService.instance?.forget() }.runOnQueue(Queues.MAIN)
    AsyncFunction("copy") { text: String ->
      context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", text))
      OwnvoiceService.instance?.say("Copied.")
      PanelActivity.current?.finish()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("insert") { text: String, promise: Promise ->
      val service = OwnvoiceService.instance
      PanelActivity.current?.finish()
      if (service == null) {
        context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", text))
        sendEvent("onInserted", mapOf("ok" to false, "newlinesLost" to false, "practice" to false))
        return@AsyncFunction promise.resolve(mapOf("ok" to false, "newlinesLost" to false))
      }
      service.insert(text) { ok, newlinesLost -> promise.resolve(mapOf("ok" to ok, "newlinesLost" to newlinesLost)) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("sharedMarkdown") { RewriteActivity.current?.sharedMarkdown() }
    Function("rewriteInput") {
      val activity = RewriteActivity.current ?: return@Function null
      mapOf("text" to activity.selectedText, "editable" to activity.editable, "markdown" to activity.markdownShare)
    }
    AsyncFunction("finishRewrite") { text: String?, replace: Boolean -> RewriteActivity.current?.finishRewrite(text, replace) }.runOnQueue(Queues.MAIN)
    AsyncFunction("closePanel") { PanelActivity.current?.finish() }.runOnQueue(Queues.MAIN)
    AsyncFunction("networkType") {
      val manager = context.getSystemService(android.net.ConnectivityManager::class.java)
      val caps = manager.getNetworkCapabilities(manager.activeNetwork)
      if (caps == null) "none"
      else if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)) "wifi"
      else if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)) "cellular"
      else "other"
    }
  }

  private fun state(): String {
    val component = ComponentName(context, OwnvoiceService::class.java).flattenToString()
    val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
      ?.split(':')?.any { it.equals(component, ignoreCase = true) } == true
    return when { OwnvoiceService.instance != null -> "on"; enabled -> "stuck"; else -> "off" }
  }
}
