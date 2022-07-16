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
        const managerColl = db.collection('managers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        let zaloUserId;

        if (eventName === 'user_click_chatnow') {
            zaloUserId = webhook.user_id;

            await Tools.isFollow(res, accessToken, refreshToken, zaloUserId, zaloColl, tokenColl);
        } else if (eventName === 'follow') {
            zaloUserId = webhook.follower.id;

            const isExistInZaloColl = await MongoDB.findOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { projection: { _id: 0, displayName: 1 } }
            );

            if (isExistInZaloColl === null) {
                const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);
                console.log(`${profileDoc.displayName} quan tâm OA (${profileDoc.zaloUserId})`);

                MongoDB.insertOneUser(zaloColl, profileDoc);

                MongoDB.updateTokenInDB(tokenColl, refreshToken);
            } else {
                MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: `${zaloUserId}` },
                    { $set: { status: 'follow' } }
                );

                console.log('Nguời dùng quan tâm trở lại');
            }

            res.send('Done!');
        } else if (eventName === 'unfollow') {
            zaloUserId = webhook.follower.id;

            MongoDB.updateOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { $set: { status: 'unfollow' } }
            );
            console.log('Người dùng bỏ quan tâm OA');
        } else if (eventName === 'user_send_text') {
            zaloUserId = webhook.sender.id;

            const messageId = webhook.message.msg_id;
            const content = webhook.message.text;

            const formatContent = Tools.nomarlizeSyntax(content);

            // Check xem nguoi dung da follow OA chua
            if (!(await Tools.isFollow(res, accessToken, refreshToken, zaloUserId, zaloColl, tokenColl))) {
                return;
            }

            if (formatContent.includes('dkph')) {
                Tools.signUp(
                    res,
                    accessToken,
                    refreshToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    tokenColl,
                    formatContent,
                    messageId,
                    'Phụ huynh'
                );
            } else if (formatContent.includes('dkhs')) {
                Tools.signUp(
                    res,
                    accessToken,
                    refreshToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    tokenColl,
                    formatContent,
                    messageId,
                    'Học sinh'
                );
            } else if (formatContent.includes('dktg')) {
                Tools.signUp4Assistant(
                    res,
                    accessToken,
                    refreshToken,
                    zaloUserId,
                    managerColl,
                    tokenColl,
                    content,
                    messageId
                );
            }

            // Neu khong nam trong cu phap thi chuyen tiep tin nhan tu PHHS den tro giang
            const isRegister = await MongoDB.findOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { projection: { _id: 0, students: 1 } }
            );

            if (isRegister.students.length === 0) {
                // PHHS chua dang ki tai khoan
                res.send('Done');
                return;
            } else {
                // PHHS da dang ki tai khoan
                for (let i = 0; i < isRegister.students.length; i++) {
                    // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                    const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

                    const cursor = managerColl.find(
                        { 'classes.classId': zaloClassId },
                        { projection: { _id: 0, zaloUserId: 1 } }
                    );

                    let zaloAssistantIdArr = [];
                    await cursor.forEach((v) => {
                        zaloAssistantIdArr.push(v.zaloUserId);
                    });

                    // chuyen tiep tin nhan den tro giang tuong ung
                    for (let i = 0; i < zaloAssistantIdArr.length; i++) {
                        const zaloAssistantId = zaloAssistantIdArr[i];

                        const forwardContent = `${aliasName} (${zaloStudentId}-${zaloClassId})\n\n Đã đã gửi tin nhắn vào lúc ${localeTimeStamp} với nội dung là:\n\n${content}`;

                        await ZaloAPI.sendMessage(accessToken, zaloAssistantId, forwardContent);

                        MongoDB.updateTokenInDB(tokenColl, refreshToken);
                    }

                    res.send('Done');

                    return;
                }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
    }
};
