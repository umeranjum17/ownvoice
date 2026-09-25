package dev.ownvoice.bridge

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OwnvoiceNativeModule : Module() {
  private val context get() = appContext.reactContext!!
  override fun definition() = ModuleDefinition {
    Name("OwnvoiceNative")
    Events("onServiceChange", "onInserted")
    OnCreate {
      OwnvoiceService.onInserted = { ok, newlinesLost -> sendEvent("onInserted", mapOf("ok" to ok, "newlinesLost" to newlinesLost)) }
      OwnvoiceService.onServiceChange = { state -> sendEvent("onServiceChange", mapOf("state" to state)) }
    }
    OnDestroy { OwnvoiceService.onInserted = null; OwnvoiceService.onServiceChange = null }

    Function("openAccessibilitySettings") {
      context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).edit().putBoolean("comeBack", true).apply()
      val me = ComponentName(context, OwnvoiceService::class.java).flattenToString()
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(":settings:fragment_args_key", me))
    }.runOnQueue(Queues.MAIN)
    Function("setBubbleRules") { rules: Map<String, Any?> ->
      val paused = rules["paused"] as? Boolean ?: false
      val on = (rules["on"] as? List<String>).orEmpty()
      val off = (rules["off"] as? List<String>).orEmpty()
      val defaults = (rules["defaults"] as? List<String>).orEmpty()
      context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).edit()
        .putBoolean("paused", paused).putStringSet("on", on.toSet()).putStringSet("off", off.toSet()).putStringSet("defaults", defaults.toSet()).apply()
      OwnvoiceService.instance?.setRules(paused, on.toSet(), off.toSet(), defaults.toSet())
    }.runOnQueue(Queues.MAIN)
    Function("setPractice") { on: Boolean ->
      OwnvoiceService.practice = on
      context.getSharedPreferences("ownvoice-native", android.content.Context.MODE_PRIVATE).edit().putBoolean("practice", on).apply()
      OwnvoiceService.instance?.updateBubble()
    }.runOnQueue(Queues.MAIN)
    Function("say") { message: String, ms: Int? -> OwnvoiceService.instance?.say(message, (ms ?: 4000).toLong()) }.runOnQueue(Queues.MAIN)
    Function("serviceState") { state() }.runOnQueue(Queues.MAIN)
    Function("capture") { OwnvoiceService.instance?.captured()?.let { c -> mapOf("conversation" to c.conversation, "written" to c.written, "typed" to c.typed, "app" to c.app, "label" to c.label, "at" to c.at, "hasField" to (c.input != null)) } }.runOnQueue(Queues.MAIN)
    Function("takeTapFacts") { OwnvoiceService.instance?.drainFacts()?.map { mapOf("at" to it.at, "app" to it.app, "label" to it.label, "screen" to it.screen, "typed" to it.typed, "replying" to it.replying) }.orEmpty() }.runOnQueue(Queues.MAIN)
    Function("forget") { OwnvoiceService.instance?.forget() }.runOnQueue(Queues.MAIN)
    Function("debugTree") { OwnvoiceService.instance?.debugTree() ?: "{}" }.runOnQueue(Queues.MAIN)
    AsyncFunction("insert") { text: String, promise: Promise ->
      val service = OwnvoiceService.instance ?: return@AsyncFunction promise.resolve(mapOf("ok" to false, "newlinesLost" to false))
      PanelActivity.current?.finish()
      service.insert(text) { ok, newlinesLost -> promise.resolve(mapOf("ok" to ok, "newlinesLost" to newlinesLost)) }
    }.runOnQueue(Queues.MAIN)
    Function("closePanel") { PanelActivity.current?.finish() }.runOnQueue(Queues.MAIN)
  }

  private fun state(): String {
    val component = ComponentName(context, OwnvoiceService::class.java).flattenToString()
    val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
      ?.split(':')?.any { it.equals(component, ignoreCase = true) } == true
    return when { OwnvoiceService.instance != null -> "on"; enabled -> "stuck"; else -> "off" }
  }
}
