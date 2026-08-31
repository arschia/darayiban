package app.darayiban.mobile

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SmsUploadWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
    override fun doWork(): Result {
        val message = inputData.getString(MESSAGE)?.takeIf { it.isNotBlank() } ?: return Result.failure()
        val settings = SmsSettings(applicationContext)
        val token = settings.token() ?: return Result.failure()
        val endpoint = settings.endpoint ?: return Result.failure()

        return try {
            val connection = URL(endpoint).openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("x-selfmali-token", token)

            val payload = JSONObject()
                .put("message", message)
                .put("device_time", deviceTime())
                .toString()
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(payload) }
            val responseCode = connection.responseCode
            connection.disconnect()

            when {
                responseCode in 200..299 -> Result.success()
                responseCode == 408 || responseCode == 429 || responseCode >= 500 -> Result.retry()
                else -> Result.failure()
            }
        } catch (_: IOException) {
            Result.retry()
        } catch (_: Exception) {
            Result.failure()
        }
    }

    private fun deviceTime(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(Date())

    companion object {
        const val MESSAGE = "message"
    }
}
