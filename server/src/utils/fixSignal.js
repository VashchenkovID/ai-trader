/**
 * Утилита для исправления некорректного сигнала
 * Использование: node server/src/utils/fixSignal.js "Эталон: строили, строили и наконец построили!" ZILLP
 */

import sequelize from '../config/database.js';
import CachedSignal from '../models/CachedSignal.js';
import CachedInstrument from '../models/CachedInstrument.js';
import { Op } from 'sequelize';

async function fixSignal(signalName, ticker) {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database');

        // Находим инструмент по ticker
        const instrument = await CachedInstrument.findOne({
            where: { ticker: ticker }
        });

        if (!instrument) {
            console.error(`❌ Instrument with ticker ${ticker} not found`);
            return;
        }

        console.log(`📊 Found instrument: ${instrument.name} (FIGI: ${instrument.figi})`);

        // Находим сигнал по имени и FIGI (используем LIKE для частичного совпадения)
        let signal = await CachedSignal.findOne({
            where: {
                name: signalName,
                figi: instrument.figi
            }
        });

        // Если не нашли точное совпадение, ищем по части имени
        if (!signal) {
            signal = await CachedSignal.findOne({
                where: {
                    name: {
                        [Op.like]: `%${signalName}%`
                    },
                    figi: instrument.figi
                }
            });
        }

        // Если все еще не нашли, ищем просто по FIGI и стратегии "Аналитики Атон"
        if (!signal) {
            signal = await CachedSignal.findOne({
                where: {
                    figi: instrument.figi,
                    strategyName: {
                        [Op.like]: '%Атон%'
                    }
                },
                order: [['createDt', 'DESC']] // Берем самый свежий
            });
        }

        if (!signal) {
            console.error(`❌ Signal "${signalName}" for ${ticker} not found`);
            console.log(`\n🔍 Searching for all signals for ${ticker}...`);
            const allSignals = await CachedSignal.findAll({
                where: {
                    figi: instrument.figi
                },
                order: [['createDt', 'DESC']],
                limit: 10
            });
            if (allSignals.length > 0) {
                console.log(`\n📋 Found ${allSignals.length} signals for ${ticker}:`);
                allSignals.forEach((s, i) => {
                    console.log(`   ${i + 1}. "${s.name}" (${s.strategyName}, ${s.direction})`);
                });
            }
            return;
        }

        console.log(`\n📋 Found signal:`);
        console.log(`   Signal ID: ${signal.signalId}`);
        console.log(`   Name: ${signal.name}`);
        console.log(`   Direction: ${signal.direction}`);
        console.log(`   Strategy: ${signal.strategyName}`);
        
        // Конвертируем цены
        let initialPrice = null;
        let targetPrice = null;
        let stoploss = null;

        if (signal.initialPrice) {
            if (typeof signal.initialPrice === 'object' && signal.initialPrice.units !== undefined) {
                initialPrice = parseFloat(signal.initialPrice.units || 0) + parseFloat(signal.initialPrice.nano || 0) / 1e9;
            } else if (typeof signal.initialPrice === 'number') {
                initialPrice = signal.initialPrice;
            }
        }

        if (signal.targetPrice) {
            if (typeof signal.targetPrice === 'object' && signal.targetPrice.units !== undefined) {
                targetPrice = parseFloat(signal.targetPrice.units || 0) + parseFloat(signal.targetPrice.nano || 0) / 1e9;
            } else if (typeof signal.targetPrice === 'number') {
                targetPrice = signal.targetPrice;
            }
        }

        if (signal.stoploss) {
            if (typeof signal.stoploss === 'object' && signal.stoploss.units !== undefined) {
                stoploss = parseFloat(signal.stoploss.units || 0) + parseFloat(signal.stoploss.nano || 0) / 1e9;
            } else if (typeof signal.stoploss === 'number') {
                stoploss = signal.stoploss;
            }
        }

        console.log(`   Initial Price: ${initialPrice ? initialPrice.toFixed(2) : 'N/A'} ₽`);
        console.log(`   Target Price: ${targetPrice ? targetPrice.toFixed(2) : 'N/A'} ₽`);
        console.log(`   Stop Loss: ${stoploss ? stoploss.toFixed(2) : 'N/A'} ₽`);
        console.log(`   Current Price (from instrument): ${instrument.lastPrice ? instrument.lastPrice.toFixed(2) : 'N/A'} ₽`);

        // Проверяем корректность данных
        if (signal.direction === 'SIGNAL_DIRECTION_BUY') {
            if (targetPrice && initialPrice && targetPrice <= initialPrice) {
                console.log(`\n⚠️ PROBLEM DETECTED: For BUY signal, targetPrice (${targetPrice}) should be HIGHER than initialPrice (${initialPrice})`);
                console.log(`   Current targetPrice is ${targetPrice}, which is ${((targetPrice / initialPrice - 1) * 100).toFixed(2)}% of initialPrice`);
                
                // Предлагаем исправление
                if (instrument.lastPrice && instrument.lastPrice > initialPrice) {
                    // Если текущая цена выше начальной, устанавливаем целевую цену на 10% выше текущей
                    const suggestedTargetPrice = instrument.lastPrice * 1.1;
                    console.log(`\n💡 SUGGESTED FIX: Set targetPrice to ${suggestedTargetPrice.toFixed(2)} ₽ (10% above current price)`);
                    
                    // Конвертируем обратно в формат {units, nano}
                    const units = Math.floor(suggestedTargetPrice);
                    const nano = Math.round((suggestedTargetPrice - units) * 1e9);
                    
                    await signal.update({
                        targetPrice: {
                            units: units.toString(),
                            nano: nano
                        }
                    });
                    
                    console.log(`✅ Signal fixed! New targetPrice: ${suggestedTargetPrice.toFixed(2)} ₽`);
                } else {
                    // Если текущая цена не доступна, устанавливаем целевую цену на 10% выше начальной
                    const suggestedTargetPrice = initialPrice * 1.1;
                    console.log(`\n💡 SUGGESTED FIX: Set targetPrice to ${suggestedTargetPrice.toFixed(2)} ₽ (10% above initial price)`);
                    
                    const units = Math.floor(suggestedTargetPrice);
                    const nano = Math.round((suggestedTargetPrice - units) * 1e9);
                    
                    await signal.update({
                        targetPrice: {
                            units: units.toString(),
                            nano: nano
                        }
                    });
                    
                    console.log(`✅ Signal fixed! New targetPrice: ${suggestedTargetPrice.toFixed(2)} ₽`);
                }
            } else if (targetPrice && instrument.lastPrice && targetPrice < instrument.lastPrice * 0.5) {
                console.log(`\n⚠️ PROBLEM DETECTED: targetPrice (${targetPrice}) is much lower than current price (${instrument.lastPrice})`);
                console.log(`   This suggests the signal data may be corrupted`);
                
                // Исправляем
                const suggestedTargetPrice = instrument.lastPrice * 1.1;
                console.log(`\n💡 FIXING: Set targetPrice to ${suggestedTargetPrice.toFixed(2)} ₽ (10% above current price)`);
                
                const units = Math.floor(suggestedTargetPrice);
                const nano = Math.round((suggestedTargetPrice - units) * 1e9);
                
                await signal.update({
                    targetPrice: {
                        units: units.toString(),
                        nano: nano
                    }
                });
                
                console.log(`✅ Signal fixed! New targetPrice: ${suggestedTargetPrice.toFixed(2)} ₽`);
            } else {
                console.log(`\n✅ Signal data looks correct`);
            }
        } else if (signal.direction === 'SIGNAL_DIRECTION_SELL') {
            if (targetPrice && initialPrice && targetPrice >= initialPrice) {
                console.log(`\n⚠️ PROBLEM DETECTED: For SELL signal, targetPrice (${targetPrice}) should be LOWER than initialPrice (${initialPrice})`);
                
                // Исправляем
                const suggestedTargetPrice = initialPrice * 0.9; // 10% ниже начальной цены
                console.log(`\n💡 FIXING: Set targetPrice to ${suggestedTargetPrice.toFixed(2)} ₽ (10% below initial price)`);
                
                const units = Math.floor(suggestedTargetPrice);
                const nano = Math.round((suggestedTargetPrice - units) * 1e9);
                
                await signal.update({
                    targetPrice: {
                        units: units.toString(),
                        nano: nano
                    }
                });
                
                console.log(`✅ Signal fixed! New targetPrice: ${suggestedTargetPrice.toFixed(2)} ₽`);
            } else {
                console.log(`\n✅ Signal data looks correct`);
            }
        }

        await sequelize.close();
        console.log('\n✅ Done!');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Получаем аргументы из командной строки
const signalName = process.argv[2];
const ticker = process.argv[3];

if (!signalName || !ticker) {
    console.error('Usage: node fixSignal.js "Signal Name" TICKER');
    console.error('Example: node fixSignal.js "Эталон: строили, строили и наконец построили!" ZILLP');
    process.exit(1);
}

fixSignal(signalName, ticker);

