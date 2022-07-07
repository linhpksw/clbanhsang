import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';
/********************************************************** */
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
/********************************************************** */
const uri = process.env.URI;
const client = new MongoClient(uri);

export const userRequest = async (req, res) => {
    const webhook = req.body;
    const eventName = webhook.event_name;
    const unixTimestamp = parseInt(webhook.timestamp);
    const localeTimeStamp = new Date(unixTimestamp).toLocaleString('vi-VN');

    try {
        await client.connect();
        const db = client.db('zalo_servers');
        const tokenColl = db.collection('tokens');

        const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);
        let userId;

        switch (eventName) {
            case 'user_click_chatnow':
                userId = webhook.user_id;

                const notFollowContent =
                    'PHHS vui lòng nhấn quan tâm OA để sử dụng đầy đủ những tính năng của lớp toán.';
                await sendMessage(accessToken, userId, notFollowContent);
                break;

            case 'user_send_text':
                userId = webhook.sender.id;
                const content = webhook.message.text;

                const nomarlizeSyntax = xoaDauTiengViet(content)
                    .toLowerCase()
                    .replace(/\s+/g, '');

                await sendMessage(accessToken, userId, nomarlizeSyntax);
        }

        await res.send('Done!');

        await updateTokenInDB(tokenColl, refreshToken);
    } catch (err) {
        console.error(err);
    } finally {
    }
};

function xoaDauTiengViet(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

/******************************************************************** */
async function deleteOneUser(coll, query) {
    const result = await coll.deleteOne(query);
    if (result.deletedCount === 1) {
        console.log('Successfully deleted one document.');
    } else {
        console.log('No documents matched the query. Deleted 0 documents.');
    }
}

async function insertManyUsers(coll, docs) {
    const result = await coll.insertMany(docs);
    let ids = result.insertedIds;

    console.log(`${result.insertedCount} users were inserted.`);
    for (let id of Object.values(ids)) {
        console.log(`Inserted an user with id ${id}`);
    }
}

async function insertOneUser(coll, doc) {
    const result = await coll.insertOne(doc);
    console.log(`New user created with the following id: ${result.insertedId}`);
}
/************************************************************** */
async function sendMessage(accessToken, userId, message) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v2.0/oa/message?`;

    const content = {
        recipient: { user_id: `${userId}` },
        message: { text: `${message}` },
    };

    await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });
}

/*************************************************************** */
async function updateTokenInDB(tokenColl, refreshToken) {
    const query = { refreshToken: `${refreshToken}` };

    const { access_token, refresh_token } = await createNewToken(refreshToken);

    const replacement = {
        accessToken: `${access_token}`,
        refreshToken: `${refresh_token}`,
    };

    await tokenColl.replaceOne(query, replacement);
}

async function readTokenFromDB(tokenColl) {
    return tokenColl.findOne();
}

async function createNewToken(refreshToken) {
    const SECRET_KEY = process.env.SECRET_KEY;
    const APP_ID = process.env.APP_ID;

    const URL = `https://oauth.zaloapp.com/v4/oa/access_token?refresh_token=${refreshToken}&app_id=${APP_ID}&grant_type=refresh_token`;

    const headers = {
        secret_key: SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
    });

    const jsonResponse = await response.json();
    return jsonResponse;
}
/*************************************************************** */
