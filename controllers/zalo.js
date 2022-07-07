import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';
/********************************************************** */
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
import { table } from 'console';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
/********************************************************** */
const uri = process.env.URI;
const client = new MongoClient(uri);

test();

async function test() {
    try {
        await client.connect();
        const db = client.db('zalo_servers');

        const tokenColl = db.collection('tokens');
        const zaloUsersColl = db.collection('zaloUsers');

        const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);

        const allFollowers = await getFollowers(accessToken);

        await insertManyToDB(zaloUsersColl, allFollowers);

        await updateTokenInDB(tokenColl, refreshToken);
    } catch (err) {
        console.error(err);
    } finally {
    }
}

async function getFollowers(accessToken) {
    let totalFollowers = [];
    let offset = 0;
    let count = 50;
    const dataRequest = `%7B%22offset%22%3A${offset}%2C%22count%22%3A${count}%7D`;

    const URL = `https://openapi.zalo.me/v2.0/oa/getfollowers?data=${dataRequest}`;

    const response = await fetch(URL, {
        method: 'get',
        headers: { access_token: accessToken },
    });

    const jsonResponse = await response.json();

    const { total, followers } = jsonResponse.data;
    totalFollowers.push(...followers);

    while (totalFollowers.length < total) {
        offset += 50;
        count += 50;
        const dataRequest = `%7B%22offset%22%3A${offset}%2C%22count%22%3A${count}%7D`;

        const URL = `https://openapi.zalo.me/v2.0/oa/getfollowers?data=${dataRequest}`;

        const response = await fetch(URL, {
            method: 'get',
            headers: { access_token: accessToken },
        });

        const jsonResponse = await response.json();

        const { total, followers } = jsonResponse.data;

        totalFollowers.push(...followers);
    }

    let result = [];

    for (let i = 0; i < totalFollowers.length; i++) {
        const zaloUserId = totalFollowers[i].user_id;

        const userData = await getProfile(zaloUserId, accessToken);

        result.push(userData);
    }

    return result;
}

async function getProfile(zaloUserId, accessToken) {
    const dataRequest = `%7B%22user_id%22%3A%22${zaloUserId}%22%7D`;

    const URL = `https://openapi.zalo.me/v2.0/oa/getprofile?data=${dataRequest}`;

    const response = await fetch(URL, {
        method: 'get',
        headers: { access_token: accessToken },
    });

    const jsonResponse = (await response.json()).data;

    let {
        user_gender: userGender,
        display_name: displayName,
        shared_info: shareInfo = {},
        tags_and_notes_info: tagsAndNotesInfo,
    } = jsonResponse;

    userGender === 1 ? (userGender = 'Nam') : (userGender = 'Nữ');

    const {
        address: studentId = null,
        phone: userPhone = null,
        name: aliasName = null,
    } = shareInfo;

    const { tag_names: tagsName } = tagsAndNotesInfo;

    const classId = tagsName.filter((s) => s.includes('A')) || null;

    const role = tagsName.filter((s) => s.includes('P')) || null;

    const status =
        tagsName.filter((s) => !s.includes(classId) && !s.includes(role)) ||
        null;

    const result = {
        zaloUserId: zaloUserId,
        displayName: displayName,
        aliasName: aliasName,
        userGender: userGender,
        userPhone: userPhone,
        role: role[0],
        status: status[0],
        classId: classId[0],
        studentId: studentId,
    };
    return result;
}
/***************************************************************** */
async function insertManyToDB(coll, docs) {
    const result = await coll.insertMany(docs);
    console.log(`${result.insertedCount} users were inserted.`);
}
/**************************************************************** */
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
