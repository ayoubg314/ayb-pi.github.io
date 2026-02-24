require('dotenv').config();
const StellarSDK = require("@stellar/stellar-sdk");

// الإعدادات
const server = new StellarSDK.Horizon.Server("https://api.testnet.minepi.com");
const NETWORK_PASSPHRASE = "Pi Testnet";

async function setupToken() {
    try {
        // تحميل المفاتيح من ملف .env
        const issuerKeypair = StellarSDK.Keypair.fromSecret(process.env.ISSUER_SECRET);
        const distributorKeypair = StellarSDK.Keypair.fromSecret(process.env.DISTRIBUTOR_SECRET);
        const tokenCode = process.env.TOKEN_CODE || "FXR";

        console.log(`--- بدء عملية إنشاء التوكن: ${tokenCode} ---`);

        // تعريف التوكن
        const customToken = new StellarSDK.Asset(tokenCode, issuerKeypair.publicKey());

        // الحصول على رسوم الشبكة الحالية
        const feeStats = await server.ledgers().order("desc").limit(1).call();
        const baseFee = feeStats.records[0].base_fee_in_stroops;

        // 1. إنشاء الـ Trustline (الموزع يثق في التوكن)
        console.log("1. إنشاء Trustline من طرف الموزع...");
        const distributorAccount = await server.loadAccount(distributorKeypair.publicKey());
        
        const trustTx = new StellarSDK.TransactionBuilder(distributorAccount, {
            fee: baseFee,
            networkPassphrase: NETWORK_PASSPHRASE,
            timebounds: await server.fetchTimebounds(90),
        })
        .addOperation(StellarSDK.Operation.changeTrust({ asset: customToken }))
        .build();

        trustTx.sign(distributorKeypair);
        await server.submitTransaction(trustTx);
        console.log("✅ تم إنشاء Trustline بنجاح.");

        // 2. ربط النطاق (Home Domain) بحساب المصدر
        const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());
        if (process.env.HOME_DOMAIN) {
            console.log(`2. ربط النطاق ${process.env.HOME_DOMAIN} بحساب المصدر...`);
            const setOptionsTx = new StellarSDK.TransactionBuilder(issuerAccount, {
                fee: baseFee,
                networkPassphrase: NETWORK_PASSPHRASE,
                timebounds: await server.fetchTimebounds(90),
            })
            .addOperation(StellarSDK.Operation.setOptions({ homeDomain: process.env.HOME_DOMAIN }))
            .build();

            setOptionsTx.sign(issuerKeypair);
            await server.submitTransaction(setOptionsTx);
            console.log("✅ تم ربط النطاق بنجاح.");
        }

        // 3. عملية السك (Minting)
        console.log(`3. سك ${process.env.MINT_AMOUNT} توكن وإرسالها للموزع...`);
        
        const mintTx = new StellarSDK.TransactionBuilder(issuerAccount, {
            fee: baseFee,
            networkPassphrase: NETWORK_PASSPHRASE,
            timebounds: await server.fetchTimebounds(90),
        })
        .addOperation(StellarSDK.Operation.payment({
            destination: distributorKeypair.publicKey(),
            asset: customToken,
            amount: process.env.MINT_AMOUNT.toString(),
        }))
        .build();

        mintTx.sign(issuerKeypair);
        await server.submitTransaction(mintTx);
        console.log("✅ تم سك التوكن بنجاح!");

        console.log("\n--- اكتملت العملية بنجاح! ---");
        console.log(`المصدر (Issuer): ${issuerKeypair.publicKey()}`);
        console.log(`الموزع (Distributor): ${distributorKeypair.publicKey()}`);

    } catch (error) {
        console.error("❌ حدث خطأ:");
        if (error.response && error.response.data) {
            console.error(JSON.stringify(error.response.data.extras.result_codes, null, 2));
        } else {
            console.error(error);
        }
    }
}

setupToken();
