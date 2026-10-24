package dev.ownvoice.bridge

import android.app.AppOpsManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OwnvoiceNativeModule : Module() {
  private val context get() = appContext.reactContext!!
  override fun definition() = ModuleDefinition {
    Name("OwnvoiceNative")
    Events("onServiceChange", "onInserted", "onTyped", "onDictate")
    OnCreate {
      OwnvoiceService.onInserted = { ok, newlinesLost, practice -> sendEvent("onInserted", mapOf("ok" to ok, "newlinesLost" to newlinesLost, "practice" to practice)) }
      OwnvoiceService.onServiceChange = { state -> sendEvent("onServiceChange", mapOf("state" to state)) }
      Dictate.emit = { payload -> sendEvent("onDictate", payload) }
    }
    OnDestroy { OwnvoiceService.onInserted = null; OwnvoiceService.onServiceChange = null; OwnvoiceService.onTyped = null; Dictate.emit = null; Dictate.teardown() }
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
    // The panel's own Linking start lands the app on Home; the bridge start the service itself uses
    // for ownvoice://setup (NEW_TASK|CLEAR_TOP) is what reaches the router's screen.
    AsyncFunction("openRoute") { url: String ->
      context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
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
    // Android 13+ greys out the switch of an app installed from a file until App info's "Allow restricted
    // settings" is tapped, and offers that menu item only after the person tried the greyed switch once.
    // Where the app op can be read (Android 13 and 14), it tells the three apart: errored (blocked, not
    // tried yet), ignored (tried), allowed (done). Android 15+ keeps it from the app itself, so there an
    // install from a file is all the app can know: likely blocked, tried or not.
    AsyncFunction("restrictedSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@AsyncFunction "clear"
      val mode = runCatching {
        context.getSystemService(AppOpsManager::class.java)
          .unsafeCheckOpNoThrow("android:access_restricted_settings", context.applicationInfo.uid, context.packageName)
      }.getOrNull()
      when (mode) {
        AppOpsManager.MODE_ERRORED -> "blocked"
        AppOpsManager.MODE_IGNORED -> "tried"
        AppOpsManager.MODE_ALLOWED -> "clear"
        else -> {
          val source = runCatching { context.packageManager.getInstallSourceInfo(context.packageName).packageSource }.getOrNull()
          if (source == PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE || source == PackageInstaller.PACKAGE_SOURCE_LOCAL_FILE) "likely" else "clear"
        }
      }
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
      OwnvoiceService.instance?.captured()?.let { c -> mapOf("conversation" to c.conversation, "written" to c.written, "typed" to c.typed, "app" to c.app, "label" to c.label, "at" to c.at, "id" to c.id, "hasField" to (c.input != null), "opensReply" to c.opensReply, "typingLimited" to c.typingLimited, "fieldTop" to c.fieldTop, "nodes" to c.nodes.map { mapOf("text" to it.text, "left" to it.left, "top" to it.top, "bottom" to it.bottom, "clickable" to it.clickable, "viewId" to it.viewId, "description" to it.description) }) }
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
      mapOf("text" to activity.selectedText, "editable" to activity.editable, "markdown" to activity.markdownShare, "app" to activity.sourceApp)
    }
    AsyncFunction("finishRewrite") { text: String?, replace: Boolean -> RewriteActivity.current?.finishRewrite(text, replace) }.runOnQueue(Queues.MAIN)
    AsyncFunction("closePanel") { PanelActivity.current?.finish() }.runOnQueue(Queues.MAIN)
    // Developer diagnostics (logcat) that survive release minification, which strips console.*.
    Function("logDev") { line: String -> Log.d("Ownvoice", line.take(2000)) }
    // On-device dictation for the panel mic: the kit's systemEngine port (Dictate.kt owns the recognizer).
    AsyncFunction("dictateAvailable") { locale: String -> Dictate.available(context) }.runOnQueue(Queues.MAIN)
    // Fresh on-device language verdict: ready, needs-download or unknown.
    AsyncFunction("dictateSupport") Coroutine { locale: String -> Dictate.supportOf(context, locale.ifEmpty { java.util.Locale.getDefault().toLanguageTag() }) }
    // Hide the full-screen transparent panel while Android's speech-pack confirmation is shown.
    AsyncFunction("dictatePanelVisible") { visible: Boolean ->
      PanelActivity.current?.window?.decorView?.visibility = if (visible) android.view.View.VISIBLE else android.view.View.INVISIBLE
    }.runOnQueue(Queues.MAIN)
    // The device's language tag: the one locale the panel's pack check, download and session share.
    Function("dictateLocale") { java.util.Locale.getDefault().toLanguageTag() }
    // Pack download trigger; resolves with the recognizer's outcome (scheduled, success, error N, timeout).
    AsyncFunction("dictateDownload") Coroutine { locale: String ->
      Dictate.downloadPack(context, locale.ifEmpty { java.util.Locale.getDefault().toLanguageTag() })
    }
    AsyncFunction("dictateStart") { id: String, options: Map<String, Any?> ->
      Dictate.start(context, id, options["locale"] as? String ?: "en-US",
        options["partial"] as? Boolean ?: true, options["punctuation"] as? Boolean ?: true)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("dictateStop") { id: String -> Dictate.stop(id) }.runOnQueue(Queues.MAIN)
    AsyncFunction("dictateCancel") { id: String -> Dictate.cancel(id) }.runOnQueue(Queues.MAIN)
    // Debug-only proof hook: stage a recorded WAV for the next session (EXTRA_AUDIO_SOURCE).
    AsyncFunction("dictateProofWav") { path: String -> Dictate.armProof(context, path) }.runOnQueue(Queues.MAIN)
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
