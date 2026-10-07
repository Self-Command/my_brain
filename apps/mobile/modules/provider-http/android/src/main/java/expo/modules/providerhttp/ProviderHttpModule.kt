package expo.modules.providerhttp

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

// Platform primitive only: no vendor SDK, recording, persistence, or business logic.
class ProviderHttpModule : Module() {
  private val requests = ConcurrentHashMap<String, HttpURLConnection>()
  private val cancelled = ConcurrentHashMap.newKeySet<String>()
  private val workers = Executors.newCachedThreadPool()
  override fun definition() = ModuleDefinition {
    Name("ProviderHttp")
    Events("ProviderResponse")
    AsyncFunction("request") { id: String, address: String, method: String, headers: Map<String, String>, body: String?, promise: Promise ->
      workers.execute {
        var connection: HttpURLConnection? = null
        try {
          val url = URL(address)
          require(url.protocol == "https")
          val client = url.openConnection() as HttpURLConnection
          connection = client
          client.instanceFollowRedirects = false
          client.connectTimeout = 15000
          client.readTimeout = 30000
          client.requestMethod = method
          headers.forEach { (name, value) -> client.setRequestProperty(name, value) }
          requests[id] = client
          check(!cancelled.contains(id))
          if (body != null) {
            client.doOutput = true
            client.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
          }
          val status = client.responseCode
          sendEvent("ProviderResponse", mapOf("id" to id, "type" to "headers", "status" to status))
          // Never follow a redirect with authorization, and never return server error bodies.
          if (status !in 200..299) {
            sendEvent("ProviderResponse", mapOf("id" to id, "type" to "end"))
          } else {
            var size = 0
            client.inputStream.use { stream ->
              val buffer = ByteArray(8192)
              while (true) {
                check(!cancelled.contains(id))
                val count = stream.read(buffer)
                if (count < 0) break
                size += count
                require(size <= 16 * 1024 * 1024)
                sendEvent("ProviderResponse", mapOf("id" to id, "type" to "chunk", "data" to Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP)))
              }
            }
            sendEvent("ProviderResponse", mapOf("id" to id, "type" to "end"))
          }
          promise.resolve(null)
        } catch (_: Exception) {
          sendEvent("ProviderResponse", mapOf("id" to id, "type" to "error"))
          promise.reject("PROVIDER_NETWORK_ERROR", "Provider network request failed", null)
        } finally {
          requests.remove(id)
          cancelled.remove(id)
          connection?.disconnect()
        }
      }
    }
    Function("cancel") { id: String -> cancelled.add(id); requests.remove(id)?.disconnect(); Unit }
    OnDestroy { requests.values.forEach { it.disconnect() }; requests.clear(); workers.shutdownNow() }
  }
}
