import { insertManyToDB, client } from './mongo.js';

export const dataRequest = async (req, res) => {
    try {
        const docs = req.body;
        await client.connect();
        const db = client.db('zalo_servers');
        const classColl = db.collection('classUsers');

        await insertManyToDB(classColl, docs);

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
