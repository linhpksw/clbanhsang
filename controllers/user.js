import * as Tools from './tool.js';
import { readTokenFromDB, client } from './mongo.js';

export const userRequest = async (req, res) => {
    const webhook = req.body;
    const eventName = webhook.event_name;
    const unixTimestamp = parseInt(webhook.timestamp);
    const localeTimeStamp = new Date(unixTimestamp).toLocaleString('vi-VN');

    try {
        await client.connect();
        const db = client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);

        let zaloUserId;

        if (eventName === 'user_click_chatnow') {
            zaloUserId = webhook.user_id;

            Tools.forceFollowOA(accessToken, zaloUserId);
        } else if (eventName === 'user_send_text') {
            zaloUserId = webhook.sender.id;

            const messageId = webhook.message.msg_id;
            const content = webhook.message.text;

            const formatSyntax = Tools.nomarlizeSyntax(content);

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
        }
    } catch (err) {
        console.error(err);
    } finally {
    }
};
