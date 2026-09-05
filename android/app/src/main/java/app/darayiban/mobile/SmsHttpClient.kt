package app.darayiban.mobile

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

internal object SmsHttpClient {
    data class Response(val code: Int, val body: JSONObject?)

    fun post(endpoint: String, token: String, payload: JSONObject): Response {
        val connection = URL(endpoint).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("x-selfmali-token", token)
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(payload.toString()) }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            return Response(code, runCatching { JSONObject(text.orEmpty()) }.getOrNull())
        } finally { connection.disconnect() }
    }
}

internal object SmsUploadPolicy {
    fun outcome(code: Int, ok: Boolean, ignored: Boolean, reason: String?): String = when {
        code == 401 || code == 403 -> "reconnect"
        code == 408 || code == 429 || code >= 500 -> "retry"
        code !in 200..299 -> "failed"
        !ok -> "retry"
        ignored && reason == "duplicate_message" -> "duplicate"
        ignored -> "unrecognized"
        else -> "uploaded"
    }
}
