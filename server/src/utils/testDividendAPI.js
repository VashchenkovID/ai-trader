import TinkoffApiService from '../services/TinkoffApiService.js';

async function testDividendAPI() {
    console.log('🔍 ТЕСТИРОВАНИЕ API ДИВИДЕНДОВ\n');

    // Тестируем несколько известных российских акций
    const testFigis = [
        'BBG004730N88', // SBER
        'BBG004730ZJ9', // GAZP
        'BBG004730JJ5', // LKOH
        'BBG004S681W1', // NVTK
        'BBG004S681B4'  // TATN
    ];

    for (const figi of testFigis) {
        console.log(`\n📈 Тестируем FIGI: ${figi}`);
        try {
            const response = await TinkoffApiService.getDividends(figi);
            console.log('Ответ API:', JSON.stringify(response, null, 2));
            
            if (response.dividends && response.dividends.length > 0) {
                const lastDividend = response.dividends[0];
                console.log('Последний дивиденд:');
                console.log(`  yieldValue: ${lastDividend.yieldValue}`);
                console.log(`  dividendNet: ${lastDividend.dividendNet}`);
                console.log(`  dividendGross: ${lastDividend.dividendGross}`);
                console.log(`  paymentDate: ${lastDividend.paymentDate}`);
                console.log(`  declaredDate: ${lastDividend.declaredDate}`);
            } else {
                console.log('❌ Дивиденды не найдены');
            }
        } catch (error) {
            console.log(`❌ Ошибка: ${error.message}`);
        }
    }

    process.exit(0);
}

testDividendAPI();
