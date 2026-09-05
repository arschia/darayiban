package app.darayiban.mobile

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SmsUploadWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
    override fun doWork(): Result {
        val message = inputData.getString(MESSAGE)?.takeIf { it.isNotBlank() } ?: return Result.failure()
        val settings = SmsSettings(applicationContext)
        val owner = inputData.getString(OWNER)
        val connection = settings.connection() ?: return Result.retry()
        // A queued message must never move to a different signed-in account.
        if (owner == null || owner != connection.userId) return Result.failure()
        return try {
            val receivedAt = inputData.getLong(RECEIVED_AT, 0)
            val time = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(Date(receivedAt))
            val response = SmsHttpClient.post(connection.endpoint, connection.token, JSONObject()
                .put("message", message).put("device_time", time))
            val body = response.body
            val outcome = SmsUploadPolicy.outcome(response.code, body?.optBoolean("ok") == true,
                body?.optBoolean("ignored") == true, body?.optString("reason"))
            settings.recordResult(outcome)
            when (outcome) {
                "uploaded", "duplicate" -> Result.success()
                "retry", "reconnect" -> Result.retry()
                else -> Result.failure()
            }
        } catch (_: IOException) {
            settings.recordResult("retry")
            Result.retry()
        } catch (_: Exception) {
            settings.recordResult("failed")
            Result.failure()
        }
    }

    companion object {
        const val MESSAGE = "message"
        const val OWNER = "owner"
        const val RECEIVED_AT = "received_at"
        const val TAG = "bank-sms-upload"
    }
}
