package dev.ownvoice.app

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Principal
import java.security.PrivateKey
import java.security.ProviderException
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509ExtendedKeyManager
import javax.net.ssl.X509TrustManager
import javax.security.auth.x500.X500Principal

/**
 * The link to the person's own computer running ownvoice-link. Both sides hold one key each and pin the
 * other's: this phone's key lives in the Android Keystore and can't be copied off it. Only text goes out,
 * only drafts come back, and nothing goes anywhere until a computer is paired.
 */
object Link {
    private const val ALIAS = "ownvoice-link"

    /** What the computer's pairing code holds: its key's pin, a one-time code and where to reach it. */
    data class Pairing(val pin: String, val code: String, val addrs: List<String>)

    /** A reply from the computer, or the reason there was none. */
    class Failure(val code: String) : Exception(code)

    fun parse(qr: String): Pairing {
        val o = runCatching { JSONObject(qr) }.getOrNull() ?: throw PlainError("That isn't a pairing code from your computer.")
        if (o.optInt("v") != 1) throw PlainError("That pairing code is from a newer version. Update Ownvoice and try again.")
        val addrs = o.optJSONArray("addrs")?.let { a -> (0 until a.length()).map { a.getString(it) } }.orEmpty()
        val pin = o.optString("pin")
        val code = o.optString("code")
        if (pin.isEmpty() || code.isEmpty() || addrs.isEmpty() || addrs.any { !Regex("[\\w.:\\[\\]-]+:\\d+").matches(it) }) {
            throw PlainError("That isn't a pairing code from your computer.")
        }
        return Pairing(pin, code, addrs)
    }

    /** SHA-256 of a certificate's public key, base64: the same pin the computer shows and uses. */
    fun pin(cert: X509Certificate): String = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(cert.publicKey.encoded))

    /** Two plain words from a pin, the same two the computer shows, so the person can check they pair this phone. */
    fun fingerprint(pin: String): String {
        val b = Base64.getDecoder().decode(pin)
        return WORDS[b[0].toInt() and 0xff] + " " + WORDS[b[1].toInt() and 0xff]
    }

    /** The same list as the helper's words in link/helper.go. */
    val WORDS = listOf(
        "apple", "arrow", "autumn", "bamboo", "banana", "basket", "beach", "berry", "bicycle", "blanket", "bloom",
        "boat", "bottle", "branch", "bread", "breeze", "brick", "bridge", "brook", "brush", "bubble", "bucket",
        "butter", "button", "cabin", "cactus", "camel", "candle", "canoe", "canyon", "carpet", "carrot", "castle",
        "cedar", "chalk", "cherry", "chess", "cliff", "clock", "cloud", "clover", "coast", "cocoa", "comet",
        "copper", "coral", "cotton", "cradle", "crane", "crayon", "creek", "cricket", "crown", "crystal", "cup",
        "daisy", "dawn", "desert", "diamond", "dolphin", "donkey", "dragon", "drum", "eagle", "earth", "echo",
        "elbow", "ember", "engine", "falcon", "feather", "fern", "ferry", "field", "fig", "flag", "flame", "flute",
        "forest", "fossil", "fountain", "fox", "frost", "garden", "garlic", "giant", "ginger", "glacier", "glove",
        "goat", "gold", "grape", "grass", "guitar", "hammer", "harbor", "harp", "hazel", "helmet", "hill", "honey",
        "horizon", "horse", "island", "ivory", "jacket", "jasmine", "jelly", "jungle", "kettle", "kite", "koala",
        "ladder", "lagoon", "lake", "lamp", "lantern", "lemon", "lily", "lion", "lizard", "lotus", "magnet", "mango",
        "maple", "marble", "meadow", "melon", "meteor", "mint", "mirror", "mitten", "moon", "moss", "mountain",
        "mushroom", "needle", "nest", "night", "noodle", "oak", "ocean", "olive", "onion", "orange", "orbit",
        "otter", "owl", "paddle", "palm", "panda", "paper", "parrot", "peach", "peanut", "pearl", "pebble", "pencil",
        "pepper", "piano", "pillow", "pine", "planet", "plum", "pocket", "pond", "poppy", "potato", "puzzle",
        "quartz", "quilt", "rabbit", "radio", "rain", "raven", "reef", "ribbon", "river", "robin", "rocket", "rose",
        "saddle", "sail", "salmon", "sand", "saturn", "shell", "silver", "sky", "sled", "snow", "sock", "spark",
        "spider", "spoon", "spring", "squash", "star", "stone", "storm", "straw", "sugar", "summer", "sun", "swan",
        "table", "tiger", "toast", "tomato", "torch", "tower", "train", "tulip", "tunnel", "turtle", "umbrella",
        "valley", "velvet", "violet", "volcano", "wagon", "walnut", "water", "whale", "wheat", "whistle", "willow",
        "window", "winter", "wolf", "wool", "yarn", "zebra", "acorn", "anchor", "badger", "beacon", "birch", "bison",
        "cobalt", "compass", "dune", "elm", "fiddle", "galaxy", "geyser", "gravel", "heron", "iris", "juniper",
        "kayak", "lava", "lemur", "linen", "lynx", "yogurt",
    )

    /** Trusts exactly one computer key, whatever name or address it answers on. */
    class PinnedTrust(private val pin: String) : X509TrustManager {
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            if (chain.isEmpty() || pin(chain[0]) != pin) throw CertificateException("not your computer")
        }
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = throw CertificateException("client only")
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    /** Offers this phone's one key to the computer. */
    class PhoneKey(private val key: PrivateKey, private val cert: X509Certificate) : X509ExtendedKeyManager() {
        val pin get() = pin(cert)
        override fun chooseClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, socket: Socket?) = ALIAS
        override fun chooseEngineClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, engine: SSLEngine?) = ALIAS
        override fun getClientAliases(keyType: String?, issuers: Array<out Principal>?) = arrayOf(ALIAS)
        override fun getCertificateChain(alias: String?) = arrayOf(cert)
        override fun getPrivateKey(alias: String?) = key
        override fun getServerAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? = null
        override fun chooseServerAlias(keyType: String?, issuers: Array<out Principal>?, socket: Socket?): String? = null
    }

    fun socketFactory(key: PhoneKey, pin: String): SSLSocketFactory =
        SSLContext.getInstance("TLS").apply { init(arrayOf(key), arrayOf(PinnedTrust(pin)), null) }.socketFactory

    /**
     * Posts [body] to the first of [addrs] that answers, trying each in turn. Returns the answer and the
     * address that gave it. Throws [Failure] with the computer's error code, or "unreachable".
     */
    fun post(addrs: List<String>, path: String, body: JSONObject, factory: SSLSocketFactory, readMs: Int): Pair<JSONObject, String> {
        for (addr in addrs) {
            val conn = URL("https://$addr$path").openConnection() as HttpsURLConnection
            conn.sslSocketFactory = factory
            conn.hostnameVerifier = javax.net.ssl.HostnameVerifier { _, _ -> true } // the pin identifies the computer
            conn.connectTimeout = 1500
            conn.readTimeout = readMs
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            try {
                conn.connect()
            } catch (e: java.io.IOException) {
                conn.disconnect()
                continue // the next address
            }
            // Connected: a failure now is final, so a slow computer is never asked twice.
            val status = try {
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
                conn.responseCode
            } catch (e: java.io.IOException) {
                conn.disconnect()
                throw Failure("unreachable")
            }
            val text = (if (status < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()
            val json = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
            if (status != 200) throw Failure(json.optString("error").ifEmpty { "failed" })
            return json to addr
        }
        throw Failure("unreachable")
    }

    // --- On the phone: the Keystore key and the saved pairing. ---

    private fun prefs(context: Context) = context.getSharedPreferences("link", Context.MODE_PRIVATE)

    /** This phone's key, made in the Keystore (StrongBox when there is one) the first time. */
    fun phoneKey(): PhoneKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!store.containsAlias(ALIAS)) makeKey()
        return PhoneKey(store.getKey(ALIAS, null) as PrivateKey, store.getCertificate(ALIAS) as X509Certificate)
    }

    private fun makeKey() {
        fun spec(strongBox: Boolean) = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_NONE, KeyProperties.DIGEST_SHA256)
            .setCertificateSubject(X500Principal("CN=ownvoice phone"))
            .apply { if (Build.VERSION.SDK_INT >= 28) setIsStrongBoxBacked(strongBox) }
            .build()
        val gen = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        try {
            gen.initialize(spec(strongBox = Build.VERSION.SDK_INT >= 28))
            gen.generateKeyPair()
        } catch (e: ProviderException) { // StrongBoxUnavailableException, on phones without StrongBox
            gen.initialize(spec(strongBox = false))
            gen.generateKeyPair()
        }
    }

    /** The paired computer, or null. */
    class Paired(val name: String, val pin: String, val addrs: List<String>, val seen: Long)

    fun computer(context: Context): Paired? {
        val p = prefs(context)
        val pin = p.getString("pin", null) ?: return null
        return Paired(p.getString("name", "").orEmpty(), pin, p.getString("addrs", "").orEmpty().lines().filter { it.isNotEmpty() }, p.getLong("seen", 0))
    }

    /** The name this phone gives itself when pairing, such as "OnePlus 13". */
    fun phoneName(context: Context) =
        Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)?.takeIf { it.isNotBlank() }?.take(60) ?: Build.MODEL

    /** Pairs with the computer in [qr]. Blocks until the person says yes or no at the computer. */
    fun pair(context: Context, qr: String): String {
        val pairing = parse(qr)
        val key = phoneKey()
        val body = JSONObject().put("code", pairing.code).put("name", phoneName(context))
        val (answer, addr) = try {
            post(pairing.addrs, "/v1/pair", body, socketFactory(key, pairing.pin), readMs = 180_000)
        } catch (e: Failure) {
            throw PlainError(
                when (e.code) {
                    "unreachable" -> "Your computer didn't answer. Check ownvoice-link pair is still showing its code, and that this phone is on the same Wi-Fi or network."
                    "refused" -> "Not paired: it was turned down on your computer."
                    else -> "Not paired: the code was wrong or ran out. Run ownvoice-link pair again."
                }
            )
        }
        val name = answer.optString("computer").ifEmpty { "your computer" }
        prefs(context).edit().putString("pin", pairing.pin).putString("name", name)
            .putString("addrs", (listOf(addr) + pairing.addrs).distinct().joinToString("\n"))
            .putLong("seen", System.currentTimeMillis()).putString("writer", "computer").commit()
        return name
    }

    /** Forgets the computer and deletes this phone's key, so the old pairing can't be used again. */
    fun forget(context: Context) {
        prefs(context).edit().clear().commit()
        runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(ALIAS) }
    }

    /** Whether the person chose their computer to write drafts (the default once one is paired). */
    fun computerWrites(context: Context) = computer(context) != null && prefs(context).getString("writer", "computer") == "computer"

    fun setComputerWrites(context: Context, on: Boolean) {
        prefs(context).edit().putString("writer", if (on) "computer" else "phone").commit()
    }

    /** Reply drafts from the paired computer. Throws [Failure]. */
    fun write(context: Context, screen: String, guide: String, readMs: Int): List<String> {
        val computer = computer(context) ?: throw Failure("not_paired")
        val body = JSONObject().put("kind", "reply").put("engine", "claude").put("screen", screen.takeLast(12_000)).put("guide", guide.take(1000))
        val (answer, addr) = post(computer.addrs, "/v1/write", body, socketFactory(phoneKey(), computer.pin), readMs)
        // The address that answered goes first next time.
        prefs(context).edit().putString("addrs", (listOf(addr) + computer.addrs).distinct().joinToString("\n"))
            .putLong("seen", System.currentTimeMillis()).commit()
        val texts = answer.optJSONArray("texts") ?: JSONArray()
        return (0 until texts.length()).map { texts.getString(it) }.filter { it.isNotBlank() }.ifEmpty { throw Failure("no_texts") }
    }
}
