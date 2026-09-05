package app.darayiban.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

class SmsUploadPolicyTest {
    @Test fun requiresAValidSuccessBody() {
        assertEquals("retry", SmsUploadPolicy.outcome(200, false, false, null))
        assertEquals("uploaded", SmsUploadPolicy.outcome(200, true, false, null))
    }
    @Test fun ignoredFinancialMessagesAreNotSuccess() {
        assertEquals("unrecognized", SmsUploadPolicy.outcome(200, true, true, "not_financial"))
        assertEquals("unrecognized", SmsUploadPolicy.outcome(200, true, true, "amount_not_found"))
        assertEquals("duplicate", SmsUploadPolicy.outcome(200, true, true, "duplicate_message"))
    }
    @Test fun transientFailuresAndExpiredConnectionsKeepTheQueue() {
        for (code in listOf(408, 429, 500, 503)) assertEquals("retry", SmsUploadPolicy.outcome(code, false, false, null))
        assertEquals("reconnect", SmsUploadPolicy.outcome(401, false, false, null))
        assertEquals("failed", SmsUploadPolicy.outcome(400, false, false, null))
    }
}
