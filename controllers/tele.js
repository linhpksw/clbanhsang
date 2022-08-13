import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import axios from 'axios';

const { TELE_TOKEN, SERVER_URL } = process.env;
const TELE_API = `https://api.telegram.org/bot${TELE_TOKEN}`;
const URI = `/tele/${TELE_TOKEN}`;
const URL = SERVER_URL + URI;

export const botRequest = async () => {
    try {
        const res = await axios.get(`${TELE_API}/setWebhook?url=${URL}`);
        console.log(res.data);

        console.log('Telegram đang gọi đến server!');
        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
