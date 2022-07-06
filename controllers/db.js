import { MongoClient } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const dbRequest = async (req, res) => {
    const webhook = req.body;

    await run(webhook).catch(console.dir);

    res.send('Success');
};

const uri = process.env.URI;
const client = new MongoClient(uri);

async function run(data) {
    try {
        await client.connect();

        const db = client.db('zalo_servers');
        const classUsers = db.collection('classUsers');

        await insertManyUsers(classUsers, data);

        /* await listDatabases(client);
		
        await insertOneUser(users, {
            name: 'Linh',
            age: 21,
        });

        

		await deleteOneUser(users, {
            age: 19,
        });
		
		*/
    } finally {
        await client.close();
    }
}

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

async function listDatabases(client) {
    const databasesList = await client.db().admin().listDatabases();

    console.log('Databases:');
    databasesList.databases.forEach((db) => console.log(` - ${db.name}`));
}
