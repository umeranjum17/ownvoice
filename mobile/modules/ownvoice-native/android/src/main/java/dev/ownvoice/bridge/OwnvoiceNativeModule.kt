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
    Events("onServiceChange", "onInserted", "onModelProgress", "onModelPartial")
    OnCreate {
      OwnvoiceService.onInserted = { ok, newlinesLost -> sendEvent("onInserted", mapOf("ok" to ok, "newlinesLost" to newlinesLost)) }
      OwnvoiceService.onServiceChange = { state -> sendEvent("onServiceChange", mapOf("state" to state)) }
    }
    OnDestroy { OwnvoiceService.onInserted = null; OwnvoiceService.onServiceChange = null }

    AsyncFunction("openAccessibilitySettings") {
      context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).edit().putBoolean("comeBack", true).apply()
      val me = ComponentName(context, OwnvoiceService::class.java).flattenToString()
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(":settings:fragment_args_key", me))
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("launcherApps") {
      val pm = context.packageManager
      pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        .map { mapOf("app" to it.activityInfo.packageName, "label" to it.loadLabel(pm).toString()) }
        .distinctBy { it["app"] }
        .sortedBy { it["label"]?.lowercase() }
    }.runOnQueue(Queues.MAIN)
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
    AsyncFunction("say") { message: String, ms: Int? -> OwnvoiceService.instance?.say(message, (ms ?: 4000).toLong()) }.runOnQueue(Queues.MAIN)
    AsyncFunction("serviceState") { state() }.runOnQueue(Queues.MAIN)
    AsyncFunction("capture") {
      OwnvoiceService.instance?.captured()?.let { c -> mapOf("conversation" to c.conversation, "written" to c.written, "typed" to c.typed, "app" to c.app, "label" to c.label, "at" to c.at, "hasField" to (c.input != null), "fieldTop" to c.fieldTop, "nodes" to c.nodes.map { mapOf("text" to it.text, "left" to it.left, "top" to it.top, "bottom" to it.bottom, "clickable" to it.clickable) }) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("takeTapFacts") {
      OwnvoiceService.instance?.drainFacts()?.map { mapOf("at" to it.at, "app" to it.app, "label" to it.label, "screen" to it.screen, "typed" to it.typed, "replying" to it.replying) }.orEmpty()
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
        sendEvent("onInserted", mapOf("ok" to false, "newlinesLost" to false))
        return@AsyncFunction promise.resolve(mapOf("ok" to false, "newlinesLost" to false))
      }
      service.insert(text) { ok, newlinesLost -> promise.resolve(mapOf("ok" to ok, "newlinesLost" to newlinesLost)) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("closePanel") { PanelActivity.current?.finish() }.runOnQueue(Queues.MAIN)
    AsyncFunction("modelStatus") Coroutine { -> PhoneModel.status() }
    AsyncFunction("downloadModel") Coroutine { ->
      try { PhoneModel.download { fraction -> sendEvent("onModelProgress", mapOf("fraction" to fraction)) } }
      catch (error: Throwable) { throw Exception("${PhoneModel.errorCode(error)}", error) }
    }
    AsyncFunction("ask") Coroutine { id: String, prompt: String, options: Map<String, Any?> ->
      try {
        PhoneModel.ask(prompt, (options["maxTokens"] as? Number)?.toInt() ?: 256) { text ->
          sendEvent("onModelPartial", mapOf("id" to id, "text" to text))
        }
      } catch (error: Throwable) { throw Exception("${PhoneModel.errorCode(error)}", error) }
    }
    AsyncFunction("drafts") Coroutine { prompt: String, options: Map<String, Any?> ->
      try {
        PhoneModel.drafts(prompt, (options["candidates"] as? Number)?.toInt() ?: 3,
          (options["maxTokens"] as? Number)?.toInt() ?: 120)
      } catch (error: Throwable) { throw Exception("${PhoneModel.errorCode(error)}", error) }
    }
  }

  private fun state(): String {
    val component = ComponentName(context, OwnvoiceService::class.java).flattenToString()
    val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
      ?.split(':')?.any { it.equals(component, ignoreCase = true) } == true
    return when { OwnvoiceService.instance != null -> "on"; enabled -> "stuck"; else -> "off" }
  }
}
