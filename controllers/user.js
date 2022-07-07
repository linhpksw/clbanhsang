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

    const userId = webhook.sender.id;
    const syntax = webhook.message.text;

    try {
        await client.connect();
        const db = client.db('zalo_servers');

        const tokenColl = db.collection('tokens');

        const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);

        const messageSent = await sendMessage(accessToken, userId, 'Success!');
        console.log(messageSent);
        const updateToken = await updateTokenInDB(tokenColl, refreshToken);
        console.log(updateToken);

        await res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

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

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });

<<<<<<< HEAD
    return await response.json();
=======
    // const jsonResponse = await response.json();
>>>>>>> 561ec0eff378eb16bbfd9c4d962dc80cdba91c65
    // console.log(jsonResponse);
}

/*************************************************************** */
async function updateTokenInDB(tokenColl, refreshToken) {
    const query = { refreshToken: `${refreshToken}` };

    const { access_token, refresh_token } = await createNewToken(refreshToken);

    const replacement = {
        accessToken: `${access_token}`,
        refreshToken: `${refresh_token}`,
    };

<<<<<<< HEAD
    const result = await tokenColl.replaceOne(query, replacement);
    return result;
=======
    await tokenColl.replaceOne(query, replacement);
>>>>>>> 561ec0eff378eb16bbfd9c4d962dc80cdba91c65
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
