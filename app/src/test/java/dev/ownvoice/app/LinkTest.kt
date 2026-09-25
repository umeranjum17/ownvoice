package dev.ownvoice.app

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.security.KeyFactory
import java.security.KeyStore
import java.security.PrivateKey
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec
import java.util.Base64
import kotlin.concurrent.thread
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLServerSocket
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

class LinkTest {
    private fun resource(name: String) = javaClass.getResource("/link/$name")!!.readText()
    private fun cert(name: String) = CertificateFactory.getInstance("X.509").generateCertificate(resource("$name-cert.pem").byteInputStream()) as X509Certificate
    private fun key(name: String): PrivateKey = KeyFactory.getInstance("EC").generatePrivate(
        PKCS8EncodedKeySpec(Base64.getMimeDecoder().decode(resource("$name-key.pem").lines().filter { !it.startsWith("-----") }.joinToString(""))),
    )

    /** The pin openssl gives for the test computer key, and the two words the helper would show for it. */
    private val computerPin = "3g18llpqJj8rEqB7+nnaZ/g/cTfh9uP0BQf2nNRfKA8="

    @Test fun pinAndCheckCodeMatchTheHelpers() {
        assertEquals(computerPin, Link.pin(cert("computer")))
        assertEquals("water branch", Link.fingerprint(computerPin))
        assertEquals(256, Link.WORDS.toSet().size)
    }

    @Test fun readsTheComputersPairingCode() {
        val p = Link.parse("""{"v":1,"pin":"$computerPin","code":"abc","addrs":["192.168.1.144:7441","100.124.161.1:7441"]}""")
        assertEquals(Link.Pairing(computerPin, "abc", listOf("192.168.1.144:7441", "100.124.161.1:7441")), p)
    }

    @Test fun refusesOtherCodesAndNewerVersions() {
        val newer = assertThrows(PlainError::class.java) { Link.parse("""{"v":2,"pin":"x","code":"c","addrs":["1.2.3.4:1"]}""") }
        assertTrue(newer.message!!, "newer version" in newer.message!!)
        for (bad in listOf("https://example.com", "", "{}", """{"v":1,"pin":"x","code":"c","addrs":[]}""",
            """{"v":1,"pin":"x","code":"c","addrs":["evil.com/path?x=1:7441"]}""", """{"v":1,"code":"c","addrs":["1.2.3.4:1"]}""")) {
            assertThrows(bad, PlainError::class.java) { Link.parse(bad) }
        }
    }

    private var server: SSLServerSocket? = null

    @After fun stop() {
        server?.close()
    }

    /**
     * A stand-in computer holding the test computer key and requiring a client key. /v1/hello answers with the
     * pin of the key the phone showed; anything else answers the helper's limit error.
     */
    private fun computer(): String {
        val store = KeyStore.getInstance("PKCS12").apply { load(null); setKeyEntry("k", key("computer"), CharArray(0), arrayOf(cert("computer"))) }
        val keys = KeyManagerFactory.getInstance("SunX509").apply { init(store, CharArray(0)) }
        val anyPhone = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        }
        val ctx = SSLContext.getInstance("TLS").apply { init(keys.keyManagers, arrayOf(anyPhone), null) }
        val s = ctx.serverSocketFactory.createServerSocket(0, 5, InetAddress.getLoopbackAddress()) as SSLServerSocket
        s.needClientAuth = true
        thread(isDaemon = true) {
            while (!s.isClosed) {
                val c = runCatching { s.accept() as SSLSocket }.getOrNull() ?: break
                runCatching {
                    c.use {
                        val input = c.inputStream.bufferedReader()
                        val path = input.readLine().split(" ")[1]
                        var length = 0
                        while (true) {
                            val line = input.readLine()
                            if (line.isEmpty()) break
                            if (line.lowercase().startsWith("content-length:")) length = line.substringAfter(':').trim().toInt()
                        }
                        repeat(length) { input.read() }
                        val (status, body) = if (path == "/v1/hello") {
                            "200 OK" to JSONObject().put("computer", "test").put("phone", Link.pin(c.session.peerCertificates[0] as X509Certificate)).toString()
                        } else "502 Bad Gateway" to """{"error":"limit","message":"x"}"""
                        c.outputStream.write("HTTP/1.1 $status\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n$body".toByteArray())
                        c.outputStream.flush()
                    }
                }
            }
        }
        server = s
        return "127.0.0.1:${s.localPort}"
    }

    private val phone get() = Link.PhoneKey(key("phone"), cert("phone"))

    @Test fun talksOnlyToThePinnedComputerAndShowsItsOwnKey() {
        val addr = computer()
        val (answer, used) = Link.post(listOf("127.0.0.1:1", addr), "/v1/hello", JSONObject(), Link.socketFactory(phone, computerPin), 5_000)
        assertEquals(addr, used)
        assertEquals(Link.pin(cert("phone")), answer.getString("phone"))
    }

    @Test fun aComputerWithAnotherKeyIsNeverTalkedTo() {
        val addr = computer()
        val otherPin = Link.pin(cert("phone"))
        val e = assertThrows(Link.Failure::class.java) { Link.post(listOf(addr), "/v1/hello", JSONObject(), Link.socketFactory(phone, otherPin), 5_000) }
        assertEquals("unreachable", e.code)
    }

    @Test fun theComputersErrorCodeComesThrough() {
        val addr = computer()
        val e = assertThrows(Link.Failure::class.java) { Link.post(listOf(addr), "/v1/write", JSONObject(), Link.socketFactory(phone, computerPin), 5_000) }
        assertEquals("limit", e.code)
    }

    /** The phone's own model, standing in as the fallback. */
    private object Phone : DraftEngine {
        override suspend fun drafts(conversation: String, guide: String, status: (String) -> Unit) = listOf("from the phone")
        override suspend fun ask(prompt: String, maxTokens: Int) = "judged on the phone"
    }

    private fun draft(engine: Computer) = runBlocking { engine.drafts("Ana: shipped it", "") {} }

    @Test fun theComputerWritesWhenItAnswers() {
        val engine = Computer(Phone) { _, _ -> listOf("from the computer") }
        assertEquals(listOf("from the computer"), draft(engine))
        assertEquals(Writer.COMPUTER, engine.wrote)
        assertNull(engine.why)
        assertEquals("judged on the phone", runBlocking { engine.ask("x", 5) })
    }

    @Test fun thePhoneWritesWhenTheComputerCant() {
        for ((failure, why) in listOf(
            Link.Failure("unreachable") to "Your computer didn't answer, so this phone wrote these.",
            Link.Failure("limit") to "Your computer has reached its limit for now, so this phone wrote these.",
            Link.Failure("no_texts") to "Your computer couldn't write these, so this phone did.",
            IllegalStateException("keystore") to "Your computer couldn't write these, so this phone did.",
        )) {
            val engine = Computer(Phone) { _, _ -> throw failure }
            assertEquals(listOf("from the phone"), draft(engine))
            assertEquals(Writer.PHONE, engine.wrote)
            assertEquals(why, engine.why)
        }
    }

    @Test fun aSlowComputerFallsBackInTime() {
        val engine = Computer(Phone, timeoutMs = 200) { _, _ -> Thread.sleep(3_000); listOf("too late") }
        val started = System.currentTimeMillis()
        assertEquals(listOf("from the phone"), draft(engine))
        assertTrue(System.currentTimeMillis() - started < 2_000)
        assertEquals("Your computer didn't answer, so this phone wrote these.", engine.why)
    }

    @Test fun wordingNeverNamesAModelOrANumber() {
        for (code in listOf("unreachable", "timeout", "limit", "busy", "not_paired", "failed", "no_texts")) {
            val why = Computer.reason(code)
            assertTrue(why, Regex("(?i)claude|gemini|nano|sonnet|model|%|\\d").find(why) == null)
        }
        for (w in Writer.entries) assertTrue(Regex("(?i)claude|gemini|nano|model").find(w.caption) == null)
    }
}
