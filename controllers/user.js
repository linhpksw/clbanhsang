import { nomarlizeSyntax } from './tool.js';
import { getFollowers, getProfile } from './zalo.js';
import { updateTokenInDB, readTokenFromDB, client } from './mongo.js';

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

                if (nomarlizeSyntax(content).includes('dkph')) {
                    if (nomarlizeSyntax.length !== 21) {
                        await sendMessage(
                            accessToken,
                            userId,
                            'Cú pháp không đúng. Phụ huynh vui lòng nhập lại.'
                        );
                        return;
                    }
                }

                await sendMessage(accessToken, userId, nomarlizeSyntax);
        }

        await res.send('Done!');

        await updateTokenInDB(tokenColl, refreshToken);
    } catch (err) {
        console.error(err);
    } finally {
    }
};
