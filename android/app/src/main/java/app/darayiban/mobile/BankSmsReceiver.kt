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

class BankSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        if (!SmsSettings(context).isConfigured) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) return
        val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }.trim()
        if (!BankSmsClassifier.looksLikeTransaction(body)) return

        val input = Data.Builder()
            .putString(SmsUploadWorker.MESSAGE, body)
            .build()
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = OneTimeWorkRequestBuilder<SmsUploadWorker>()
            .setInputData(input)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueue(request)
    }

}

internal object BankSmsClassifier {
    fun looksLikeTransaction(body: String): Boolean {
        if (!body.any { it.isDigit() }) return false
        val normalized = body.lowercase()
        val transactionTerms = listOf(
            "برداشت", "واریز", "واريز", "خرید", "خريد", "مانده", "موجودی",
            "موجودي", "انتقال وجه", "کارت به کارت", "بدهکار", "بستانکار",
        )
        if (transactionTerms.none(normalized::contains)) return false
        val securityTerms = listOf("رمز پویا", "رمز پويا", "رمز یکبار", "رمز يکبار", "کد ورود", "کد فعال")
        val hasBalanceOrMovement = listOf("مانده", "موجودی", "موجودي", "برداشت", "واریز", "واريز")
            .any(normalized::contains)
        return hasBalanceOrMovement || securityTerms.none(normalized::contains)
    }
}
