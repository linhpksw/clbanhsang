import { nomarlizeSyntax } from './tool.js';
import { sendMessage } from './zalo.js';
import {
    updateTokenInDB,
    readTokenFromDB,
    findOneUser,
    client,
} from './mongo.js';

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

                const formatSyntax = nomarlizeSyntax(content);

                if (formatSyntax.includes('dkph')) {
                    if (formatSyntax.length !== 21) {
                        await sendMessage(
                            accessToken,
                            userId,
                            'Cú pháp không đúng. Phụ huynh vui lòng nhập lại.'
                        );
                        return;
                    }

                    const query = { zaloUserId: `${userId}` };
                    const options = { projection: { role: 1 } };
                    const role = findOneUser(zaloColl, query, options);

                    if (role !== null) {
                        await sendMessage(
                            accessToken,
                            userId,
                            'Tài khoản đã có trên hệ thống. Phụ huynh có quyền truy cập vào các tính năng ở mục tiện ích bên dưới.'
                        );
                        return;
                    }

                    await sendMessage(
                        accessToken,
                        userId,
                        'Tài khoản chưa có trên hệ thống.'
                    );
                }
                break;
        }

        await res.send('Done!');

        await updateTokenInDB(tokenColl, refreshToken);
    } catch (err) {
        console.error(err);
    } finally {
    }
};
