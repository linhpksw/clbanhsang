import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

// async function insertToZaloDB() {
//     try {
//         await MongoDB.client.connect();
//         const db = MongoDB.client.db('zalo_servers');
//         const tokenColl = db.collection('tokens');
//         const zaloColl = db.collection('zaloUsers');

//         const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

//         const followers = await ZaloAPI.getFollowers(accessToken);

//         // console.log(followers);
//         // return;

//         await MongoDB.insertManyToDB(zaloColl, followers);

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
        const classInfoColl = db.collection('classInfo');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        let zaloUserId;

        if (eventName === 'user_click_chatnow') {
            zaloUserId = webhook.user_id;

            if (!(await Tools.isFollow(zaloUserId, zaloColl))) {
                ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');
            }
        } else if (eventName === 'follow') {
            zaloUserId = webhook.follower.id;

            const isExistInZaloColl = await MongoDB.findOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { projection: { _id: 0, userPhone: 1 } }
            );

            if (isExistInZaloColl === null) {
                const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);
                console.log(`${profileDoc.displayName} quan tâm OA (${profileDoc.zaloUserId})`);

                await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');
                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

                MongoDB.insertOneUser(zaloColl, profileDoc);
            } else {
                MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: `${zaloUserId}` },
                    { $set: { status: 'follow' } }
                );

                if (isExistInZaloColl.userPhone === null) {
                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');
                    await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');
                } else {
                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');
                }

                console.log('Nguời dùng quan tâm trở lại');
            }

            res.send('Done!');
        } else if (eventName === 'unfollow') {
            zaloUserId = webhook.follower.id;

            await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');
            await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

            MongoDB.updateOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { $set: { status: 'unfollow' } }
            );
            console.log('Người dùng bỏ quan tâm OA');
        } else if (eventName === 'user_reacted_message') {
            // Check xem tha tym den OA co tu phia Tro giang khong
            zaloUserId = webhook.sender.id;

            if (!(await Tools.isManager(zaloUserId, classInfoColl))) {
                res.send('Done!');
                return;
            } else {
                // Neu tu phia tro giang thi chuyen tiep tym lai cho phu huynh
                const reactMessageId = webhook.message.msg_id;

                const reactIcon = webhook.message.react_icon;

                await Tools.sendReactBack2Parent(accessToken, zaloUserId, reactMessageId, reactIcon);

                res.send('Done!');
                return;
            }
        } else if (eventName === 'user_send_text') {
            zaloUserId = webhook.sender.id;

            const messageId = webhook.message.msg_id;
            const content = webhook.message.text;

            const formatContent = Tools.nomarlizeSyntax(content);

            // Check xem nguoi dung da follow OA chua
            if (!(await Tools.isFollow(zaloUserId, zaloColl))) {
                // const failContent = `PHHS vui lòng nhấn Quan tâm OA để được hỗ trợ nhanh chóng và sử dụng đầy đủ những tính năng của lớp toán.`;

                // await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

                res.send('Done!');
                return;
            }

            if (formatContent.includes('dkph')) {
                Tools.signUp(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    formatContent,
                    messageId,
                    'Phụ huynh'
                );
            } else if (formatContent.includes('dkhs')) {
                Tools.signUp(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    formatContent,
                    messageId,
                    'Học sinh'
                );
            } else if (formatContent.includes('xph')) {
                Tools.deleteAccount(
                    res,
                    formatContent,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classInfoColl,
                    messageId,
                    'Phụ huynh'
                );
            } else if (formatContent.includes('xhs')) {
                Tools.deleteAccount(
                    res,
                    formatContent,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classInfoColl,
                    messageId,
                    'Học sinh'
                );
            } else if (formatContent.includes('dktg')) {
                Tools.signUp4Assistant(
                    res,
                    accessToken,
                    zaloUserId,
                    classInfoColl,
                    zaloColl,
                    content,
                    messageId
                );
            } else if (!formatContent.includes('#')) {
                // Check xem tin nhan den OA co tu phia Tro giang khong

                if (!(await Tools.isManager(zaloUserId, classInfoColl))) {
                    Tools.forwardMessage2Assistant(
                        res,
                        accessToken,
                        zaloUserId,
                        messageId,
                        zaloColl,
                        classInfoColl,
                        content,
                        localeTimeStamp
                    );
                } else {
                    // Neu tu phia tro giang thi phan hoi lai cho phu huynh
                    const quoteMessageId = webhook.message.quote_msg_id || null;

                    if (quoteMessageId !== null) {
                        const replyContent = webhook.message.text;

                        await Tools.sendMessageBack2Parent(
                            res,
                            accessToken,
                            zaloUserId,
                            replyContent,
                            quoteMessageId
                        );
                    } else {
                        res.send('Done!');
                        return;
                    }
                }
            } else if (formatContent.includes('#')) {
                if (content === '#TTCL') {
                    const attachMessage = {
                        text: 'Hiện tại lớp toán đang mở cả 3 khối 10, 11 và 12. Phụ huynh có nhu cầu đăng kí cho con khối nào ạ?',
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Khối 12',
                                        payload: '#k12',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối 11',
                                        payload: '#k11',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối 10',
                                        payload: '#k10',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
                } else if (formatContent === '#K10') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 10 ôn thi THPTQG, xếp lớp dựa trên kết quả thi vào 10 của các con. \n\nLớp 10A0 vận dụng cao dành cho các học sinh đỗ chuyên toán, chuyên tin các trường chuyên; hoặc điểm thi toán điều kiện từ 9,5 trở lên. Các con được xếp vào lớp 10A1 nếu điểm thi toán điều kiện từ 8 trở lên. \n\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 10A0 vận dụng cao',
                                        payload: '#2007A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 10A1 nâng cao',
                                        payload: '#2007A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
                } else if (content.substring(0, 4) === '#TT20' && content.length === 9) {
                    // #TT2007A0
                    const classId = content.substring(-6);

                    const classInfo = await MongoDB.findOneUser(
                        classInfoColl,
                        { classId: classId },
                        { projection: { _id: 0 } }
                    );

                    const {
                        className,
                        room,
                        description,
                        status,
                        currentTerm,
                        totalDate,
                        tuition,
                        startTerm,
                        endTerm,
                        assistants,
                        subjects,
                    } = classInfo;

                    console.log(classInfo);

                    // const message = `Mã lớp: `;

                    // await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
                }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const tokenRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        await MongoDB.updateTokenInDB(tokenColl, refreshToken);

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
