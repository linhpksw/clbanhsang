import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

// async function insertToZaloDB() {
//     try {
//         await MongoDB.client.connect();
//         const db = MongoDB.client.db('zalo_servers');
//         const tokenColl = db.collection('tokens');
//         const zaloColl = db.collection('zaloUsers');

//         const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);

//         const followers = await ZaloAPI.getFollowers(accessToken);

//         // console.log(followers);

//         await insertManyToDB(zaloColl, followers);

//         console.log('Success!');
//     } catch (err) {
//         console.error(err);
//     } finally {
//     }
// }

// insertToZaloDB();

export const userRequest = async (req, res) => {
    const webhook = req.body;
    const eventName = webhook.event_name;
    const unixTimestamp = parseInt(webhook.timestamp);
    const localeTimeStamp = new Date(unixTimestamp).toLocaleString('vi-VN');

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        let zaloUserId;

        if (eventName === 'user_click_chatnow') {
            zaloUserId = webhook.user_id;

            await Tools.isFollow(res, accessToken, refreshToken, zaloUserId, zaloColl, tokenColl);
        } else if (eventName === 'user_send_text') {
            zaloUserId = webhook.sender.id;

            const messageId = webhook.message.msg_id;
            const content = webhook.message.text;

            const formatSyntax = Tools.nomarlizeSyntax(content);

            // Check xem nguoi dung da follow OA chua
            await Tools.isFollow(res, accessToken, refreshToken, zaloUserId, zaloColl, tokenColl);

            if (formatSyntax.includes('dkph')) {
                // Sign up for Phu huynh
                Tools.signUp(
                    res,
                    accessToken,
                    refreshToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    tokenColl,
                    formatSyntax,
                    messageId,
                    'Phụ huynh'
                );
            } else if (formatSyntax.includes('dkhs')) {
                // sign up for Hoc sinh
                Tools.signUp(
                    res,
                    accessToken,
                    refreshToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    tokenColl,
                    formatSyntax,
                    messageId,
                    'Học sinh'
                );
            }
        } else if (eventName === 'follow') {
            zaloUserId = webhook.follower.id;

            const isExistInZaloColl = await MongoDB.findOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { projection: { _id: 0, displayName: 1 } }
            );

            if (isExistInZaloColl === null) {
                const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);

                MongoDB.insertOneUser(zaloColl, profileDoc);

                await MongoDB.updateTokenInDB(tokenColl, refreshToken);
            }

            res.send('Done!');
        } else if (eventName === 'unfollow') {
            zaloUserId = webhook.follower.id;
        }
    } catch (err) {
        console.error(err);
    } finally {
    }
};
