import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

export const cassoRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        const { data } = req.body;

        console.log(data);

        //         for (let i = 0; i < data.length; i++) {
        //             const { id, tid, description, amount, cusum_balance, when } = data[i];

        //             const formatWhen = Tools.formatDateTime(when);
        //             const formatAmount = `${amount > 0 ? 'tăng' : 'giảm'} ${Tools.formatCurrency(amount)}`;
        //             const formatCuSum = Tools.formatCurrency(cusum_balance);

        //             const content = `Số dư tài khoản vừa ${formatAmount} vào ${formatWhen}
        // Số dư hiện tại: ${formatCuSum}
        // Nội dung: ${description}
        // Mã giao dịch: ${id}
        // Mã tham chiếu: ${tid}
        // `;
        //             await ZaloAPI.sendMessage(accessToken, '4966494673333610309', content);
        //         }

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
