import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const tokenRequest = async (req, res) => {
    await run(res).catch(console.dir);
};

const uri = process.env.URI;
const client = new MongoClient(uri);

async function run(res) {
    try {
        await client.connect();
        const db = client.db('zalo_servers');

        const tokens = db.collection('tokens');
        const result = await readTokenFromDB(tokens);

        const { accessToken, refreshToken } = result[0];

        res.send('Generate new Token success!');

        await updateTokenInDB(tokens, refreshToken);
    } finally {
        await client.close();
    }
}

async function updateTokenInDB(coll, refreshToken) {
    const query = { refreshToken: `${refreshToken}` };

    const { access_token, refresh_token } = await createNewToken(refreshToken);

    const replacement = {
        accessToken: `${access_token}`,
        refreshToken: `${refresh_token}`,
    };

    const result = await coll.replaceOne(query, replacement);

    console.log(result);
}

async function readTokenFromDB(coll) {
    const result = coll.find({}).toArray();
    return result;
}

async function createNewToken(refreshToken) {
    const SECRET_KEY = process.env.SECRET_KEY;
    const APP_ID = process.env.APP_ID;

    const URL = `https://oauth.zaloapp.com/v4/oa/access_token?refresh_token=${refreshToken}&app_id=${APP_ID}&grant_type=refresh_token`;

    const headers = {
        secret_key: SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    try {
        const response = await fetch(URL, {
            method: 'post',
            headers: headers,
        });

        const jsonResponse = await response.json();
        return jsonResponse;
    } catch (err) {
        console.error(err);
    }
}
