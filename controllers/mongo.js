import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';

const uri = process.env.URI;
const client = new MongoClient(uri);

/*************************************************************** */
async function updateTokenInDB(tokenColl, refreshToken) {
    const query = { refreshToken: `${refreshToken}` };

    const { access_token, refresh_token } = await createNewToken(refreshToken);

    const replacement = {
        accessToken: `${access_token}`,
        refreshToken: `${refresh_token}`,
    };

    await tokenColl.replaceOne(query, replacement);

    console.log('Successfully updated token.');
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
async function deleteOneUser(coll, query) {
    const result = await coll.deleteOne(query);
    if (result.deletedCount === 1) {
        console.log('Successfully deleted one document.');
    } else {
        console.log('No documents matched the query. Deleted 0 documents.');
    }
}

async function insertManyToDB(coll, docs) {
    const result = await coll.insertMany(docs);
    let ids = result.insertedIds;

    console.log(`${result.insertedCount} users were inserted.`);

    for (let id of Object.values(ids)) {
        console.log(`Inserted an user with id ${id}`);
    }
}

async function updateOneUser(coll, filter, updateDoc) {
    const result = await coll.updateOne(filter, updateDoc);

    console.log(`${result.matchedCount} document(s) matched the query criteria.`);
    console.log(`${result.modifiedCount} document(s) was/were updated.`);
}

async function upsertOneUser(coll, filter, updateDoc) {
    const result = await coll.updateOne(filter, { $set: updateDoc }, { upsert: true });
    // console.log(`${result.matchedCount} tài liệu khớp với query, cập nhật ${result.modifiedCount} tài liệu.`);

    console.log(`${result.matchedCount} document(s) matched the query criteria.`);
    console.log(`${result.modifiedCount} document(s) was/were updated.`);
}

async function insertOneUser(coll, doc) {
    const result = await coll.insertOne(doc);

    console.log(`One document was inserted with the id ${result.upsertedId._id}`);
    // console.log(`Tạo thành công user mới với id: ${result.insertedId}`);
}

async function findOneUser(coll, query, options) {
    return await coll.findOne(query, options);
}

export {
    updateTokenInDB,
    readTokenFromDB,
    findOneUser,
    updateOneUser,
    insertManyToDB,
    insertOneUser,
    upsertOneUser,
    deleteOneUser,
    client,
};
