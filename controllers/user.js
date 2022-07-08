import { nomarlizeSyntax } from './tool.js';
import * as ZaloAPI from './zalo.js';
import {
    updateTokenInDB,
    readTokenFromDB,
    findOneUser,
    updateOneUser,
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
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);
        let zaloUserId;

        switch (eventName) {
            case 'user_click_chatnow':
                zaloUserId = webhook.user_id;

                const notFollowContent =
                    'PHHS vui lòng nhấn quan tâm OA để sử dụng đầy đủ những tính năng của lớp toán.';
                await ZaloAPI.sendMessage(
                    accessToken,
                    zaloUserId,
                    notFollowContent
                );
                break;

            case 'user_send_text':
                zaloUserId = webhook.sender.id;
                const messageId = webhook.message.msg_id;

                const content = webhook.message.text;

                const formatSyntax = nomarlizeSyntax(content);

                if (formatSyntax.includes('dkph')) {
                    if (formatSyntax.length !== 21) {
                        await ZaloAPI.sendHeartReaction(
                            accessToken,
                            zaloUserId,
                            messageId,
                            'sad'
                        );
                        await ZaloAPI.sendMessage(
                            accessToken,
                            zaloUserId,
                            '❌ Đăng kí thất bại!\n\nCú pháp không đúng. Phụ huynh vui lòng nhập lại.'
                        );
                        break;
                    }
                    // kiem tra tren zalo collection

                    const { role, displayName } = await findOneUser(
                        zaloColl,
                        { zaloUserId: `${zaloUserId}` },
                        { projection: { _id: 0, role: 1, displayName: 1 } }
                    );

                    if (role !== null) {
                        await ZaloAPI.sendHeartReaction(
                            accessToken,
                            zaloUserId,
                            messageId,
                            'like'
                        );
                        await ZaloAPI.sendMessage(
                            accessToken,
                            zaloUserId,
                            `Tài khoản đã có trên hệ thống. Phụ huynh đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`
                        );
                        break;
                    }

                    // kiem tra tren classes collection
                    const studentId = parseInt(formatSyntax.substring(4, 11));
                    const registerPhone = formatSyntax.slice(-10);

                    const userInfo = await findOneUser(
                        classColl,
                        { studentID: studentId },
                        {
                            projection: {
                                _id: 0,
                                fullName: 1,
                                classID: 1,
                                leaveDate: 1,
                                firstParentPhone: 1,
                                secondParentPhone: 1,
                            },
                        }
                    );

                    if (userInfo === null) {
                        await ZaloAPI.sendHeartReaction(
                            accessToken,
                            zaloUserId,
                            messageId,
                            'sad'
                        );
                        await ZaloAPI.sendMessage(
                            accessToken,
                            zaloUserId,
                            `❌ Đăng kí thất bại!\n\nMã học sinh ${studentId} không có trên hệ thống. Phụ huynh vui lòng liên hệ với trợ giảng để được hỗ trợ.`
                        );
                        break;
                    }

                    let {
                        firstParentPhone,
                        secondParentPhone,
                        fullName,
                        classID,
                        leaveDate,
                    } = userInfo;

                    const registerPhoneList = [
                        firstParentPhone,
                        secondParentPhone,
                    ];

                    if (!registerPhoneList.includes(registerPhone)) {
                        await ZaloAPI.sendHeartReaction(
                            accessToken,
                            zaloUserId,
                            messageId,
                            'sad'
                        );
                        await ZaloAPI.sendMessage(
                            accessToken,
                            zaloUserId,
                            `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. Phụ huynh vui lòng liên hệ với trợ giảng để được hỗ trợ.`
                        );
                        break;
                    }
                    // set up role cho phu huynh
                    await ZaloAPI.sendHeartReaction(
                        accessToken,
                        zaloUserId,
                        messageId,
                        'heart'
                    );
                    await ZaloAPI.sendMessage(
                        accessToken,
                        zaloUserId,
                        `✅ Đăng kí thành công cho Zalo ${displayName}!\n\nPhụ huynh đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`
                    );
                    let status;
                    leaveDate === null
                        ? (status = 'Đang học')
                        : (status = 'Nghỉ học');

                    const newDoc = {
                        aliasName: `PH ${fullName}`,
                        userPhone: `${registerPhone}`,
                        role: 'Phụ huynh',
                        status: status,
                        classId: classID.slice(-7),
                        studentId: studentId,
                    };

                    const filter = { zaloUserId: `${zaloUserId}` };
                    const updateDoc = {
                        $set: newDoc,
                    };
                    await updateOneUser(zaloColl, filter, updateDoc);

                    await ZaloAPI.tagFollower(
                        accessToken,
                        zaloUserId,
                        'Phụ huynh'
                    );
                    await ZaloAPI.tagFollower(accessToken, zaloUserId, classID);
                    await ZaloAPI.tagFollower(accessToken, zaloUserId, status);
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
