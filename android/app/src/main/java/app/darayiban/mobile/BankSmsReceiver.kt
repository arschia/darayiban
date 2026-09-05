package app.darayiban.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors

class BankSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val settings = SmsSettings(context)
        if (!settings.isConfigured) return
        val owner = settings.userId ?: return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) return
        val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }.trim()
        settings.recordReceived(messages.first().timestampMillis)
        if (!BankSmsClassifier.looksLikeTransaction(body)) {
            settings.recordResult("filtered")
            return
        }

        val input = Data.Builder()
            .putString(SmsUploadWorker.MESSAGE, body)
            .putString(SmsUploadWorker.OWNER, owner)
            .putLong(SmsUploadWorker.RECEIVED_AT, messages.first().timestampMillis)
            .build()
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = OneTimeWorkRequestBuilder<SmsUploadWorker>()
            .addTag(SmsUploadWorker.TAG)
            .addTag("sms-owner:$owner")
            .setInputData(input)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        val pending = goAsync()
        settings.recordResult("queued")
        // Keep the broadcast alive until WorkManager has durably saved the job.
        executor.execute {
            try {
                WorkManager.getInstance(context.applicationContext).enqueue(request).result.get(8, TimeUnit.SECONDS)
            } catch (_: Exception) {
                settings.recordResult("queue_error")
            } finally {
                pending.finish()
            }
        }
    }
    companion object { private val executor = Executors.newSingleThreadExecutor() }
}

internal object BankSmsClassifier {
    fun looksLikeTransaction(body: String): Boolean {
        if (!body.any { it.isDigit() }) return false
        val normalized = body.lowercase().replace('ي', 'ی').replace('ك', 'ک')
            .replace('\u200c', ' ').replace('\u00a0', ' ')
            .replace(Regex("[\u200e\u200f\u202a-\u202e]"), "").replace('−', '-')
        if (Regex("رمز|کد\\s*(ورود|فعال|تأیید|تایید)|\\botp\\b").containsMatchIn(normalized)) return false
        val transactionTerms = listOf(
            "برداشت", "واریز", "واريز", "خرید", "خريد", "مانده", "موجودی",
            "موجودي", "انتقال وجه", "کارت به کارت", "بدهکار", "بستانکار", "پرداخت", "کسر", "دریافت",
        )
        if (transactionTerms.none(normalized::contains)) return false
        return true
    }
}
