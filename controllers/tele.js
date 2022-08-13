import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const botRequest = async (req, res) => {
    try {
        const data = req.body;
        console.log(data);
        console.log('Telegram đang gọi đến server!');
        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
