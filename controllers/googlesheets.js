import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

export const getListUser = async (req, res) => {
    try {
        const data = req.body;

        console.log(data);

        res.send(data);
    } catch (err) {
        console.error(err);
    } finally {
    }
};
