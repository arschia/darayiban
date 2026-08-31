package app.darayiban.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BankSmsClassifierTest {
    @Test
    fun acceptsSamanWithdrawalWithBalance() {
        val message = """بانك سامان
            |برداشت مبلغ 333,740 خريدکالا
            |از 2137-800-5251414-1
            |مانده 8,904,191
            |1405/6/4
            |01:11:41
        """.trimMargin()

        assertTrue(BankSmsClassifier.looksLikeTransaction(message))
    }

    @Test
    fun acceptsPersianDigits() {
        assertTrue(BankSmsClassifier.looksLikeTransaction("بانک ملت؛ واریز ۱٬۲۵۰٬۰۰۰ ریال؛ موجودی ۴٬۰۰۰٬۰۰۰"))
    }

    @Test
    fun ignoresOneTimePassword() {
        assertFalse(BankSmsClassifier.looksLikeTransaction("رمز پویای خرید شما 452811 است. این کد را در اختیار دیگران قرار ندهید."))
    }

    @Test
    fun ignoresOrdinaryMessages() {
        assertFalse(BankSmsClassifier.looksLikeTransaction("جلسه امروز ساعت 18 برگزار می‌شود."))
    }
}
