import * as MongoDB from './mongo.js';
import * as ZaloAPI from './zalo.js';

function nomarlizeSyntax(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, '');
}

async function findZaloIdFromStudentId(zaloColl, zaloStudentId) {
    const cursor = zaloColl.find(
        { 'students.zaloStudentId': parseInt(zaloStudentId) },
        { projection: { _id: 0, zaloUserId: 1, 'students.zaloClassId': 1 } }
    );

    let zaloIdArr = [];
    await cursor.forEach((v) => {
        zaloIdArr.push([v.zaloUserId, v.students[0].zaloClassId]);
    });

    return zaloIdArr;
}

async function sendMessage2Assistant(
    accessToken,
    refreshToken,
    tokenColl,
    managerColl,
    classId,
    forwardContent
) {
    const cursor = managerColl.find(
        { 'classes.classId': classId },
        { projection: { _id: 0, zaloUserId: 1 } }
    );

    let zaloAssistantIdArr = [];
    await cursor.forEach((v) => {
        zaloAssistantIdArr.push(v.zaloUserId);
    });

    for (let i = 0; i < zaloAssistantIdArr.length; i++) {
        const zaloAssistantId = zaloAssistantIdArr[i];

        await ZaloAPI.sendMessage(accessToken, zaloAssistantId, forwardContent);

        MongoDB.updateTokenInDB(tokenColl, refreshToken);
    }
}

async function sendResponse2Client(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    tokenColl,
    messageId,
    responseContent,
    action
) {
    ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, action);

    await ZaloAPI.sendMessage(accessToken, zaloUserId, responseContent);

    res.send('Done!');

    MongoDB.updateTokenInDB(tokenColl, refreshToken);
}

async function getContentFromMsgId(accessToken, zaloUserId, messageId) {
    const conversation = await ZaloAPI.getConversation(accessToken, zaloUserId);

    if (conversation !== undefined) {
        for (let i = 0; i < conversation.length; i++) {
            const { message_id, message } = conversation[i];

            if (message_id === messageId) {
                return message;
            }
        }
    } else {
        return undefined;
    }
}

async function sendReactBack2Parent(tokenColl, refreshToken, accessToken, zaloUserId, messageId, reactIcon) {
    const content = await getContentFromMsgId(accessToken, zaloUserId, messageId);

    if (content !== undefined) {
        const [UID, MID] = content.split('\n\n').at(-1).split(`\n`);

        const zaloId = UID.split(' ')[1];
        const zaloMessageId = MID.split(' ')[1];

        await ZaloAPI.sendReaction(accessToken, zaloId, zaloMessageId, reactIcon);

        MongoDB.updateTokenInDB(tokenColl, refreshToken);
    } else {
        MongoDB.updateTokenInDB(tokenColl, refreshToken);
    }
}

async function sendMessageBack2Parent(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    tokenColl,
    replyContent,
    quoteMessageId
) {
    const conversation = await ZaloAPI.getConversation(accessToken, zaloUserId);

    for (let i = 0; i < conversation.length; i++) {
        const { message_id, message } = conversation[i];

        if (typeof message === 'string') {
            if (message_id === quoteMessageId) {
                const [UID, MID] = message.split('\n\n').at(-1).split(`\n`);

                const zaloId = UID.split(' ')[1];
                const zaloMessageId = MID.split(' ')[1];

                await ZaloAPI.sendMessage(accessToken, zaloId, replyContent);

                MongoDB.updateTokenInDB(tokenColl, refreshToken);

                break;
            }
        }
    }

    res.send('Done');

    return;
}

async function forwardMessage2Assistant(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    messageId,
    zaloColl,
    managerColl,
    tokenColl,
    content,
    localeTimeStamp
) {
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, students: 1 } }
    );

    if (isRegister.students.length === 0) {
        // PHHS chua dang ki tai khoan
        await res.send('Done');
        return;
    } else {
        // PHHS da dang ki tai khoan
        for (let i = 0; i < isRegister.students.length; i++) {
            // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
            const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

            // chuyen tiep tin nhan den tro giang tuong ung
            const forwardContent = `${aliasName} ${zaloStudentId} ở lớp ${zaloClassId}\n\nĐã gửi tin nhắn vào lúc ${localeTimeStamp} với nội dung là:\n\n${content}\n\nUID: ${zaloUserId}\nMID: ${messageId}`;

            await sendMessage2Assistant(
                accessToken,
                refreshToken,
                tokenColl,
                managerColl,
                zaloClassId,
                forwardContent
            );

            await res.send('Done');

            return;
        }
    }
}

async function isManager(res, zaloUserId, managerColl) {
    const result = await MongoDB.findOneUser(
        managerColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, status: 1 } }
    );

    if (result === null || result.status !== 'On') {
        return false;
    }

    return true;
}

async function isFollow(res, accessToken, refreshToken, zaloUserId, zaloColl, tokenColl) {
    const result = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, status: 1 } }
    );

    if (result === null || result.status === 'unfollow') {
        const failContent = `PHHS vui lòng nhấn Quan tâm OA để được hỗ trợ nhanh chóng và sử dụng đầy đủ những tính năng của lớp toán.`;

        await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

        res.send('Done!');

        await MongoDB.updateTokenInDB(tokenColl, refreshToken);

        return false;
    }

    return true;
}

async function signUp4Assistant(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    managerColl,
    tokenColl,
    content,
    messageId
) {
    const [syntax, classId, phone, ...splitName] = content.split(' ');

    const name = splitName.join(' ');

    // check xem da co tro giang tren he thong chua
    const isAssistantExist = await MongoDB.findOneUser(
        managerColl,
        { phone: phone },
        { projection: { _id: 0 } }
    );

    // Neu chua ton tai thi tao moi
    if (isAssistantExist === null) {
        // Cap nhat tag tren Zalo OA Chat
        await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Trợ giảng');
        await ZaloAPI.tagFollower(accessToken, zaloUserId, classId);

        MongoDB.insertOneUser(managerColl, {
            zaloUserId: zaloUserId,
            role: 'Trợ giảng',
            status: 'On',
            name: name,
            phone: phone,
            classes: [{ classId: classId }],
        });

        const successContent = `✅ Đăng kí thành công cho trợ giảng ${name} với mã lớp ${classId} và số điện thoại ${phone}.`;

        await sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            successContent,
            'heart'
        );

        return;
    } else {
        // Neu ton tai roi thi:
        // check xem tro giang da dang ki voi lop nay chua
        const isRegisterWithAssistant = await MongoDB.findOneUser(
            managerColl,
            { phone: phone, 'classes.classId': classId },
            { projection: { _id: 0 } }
        );

        // Neu chua dang ki thi them vao
        if (isRegisterWithAssistant === null) {
            await ZaloAPI.tagFollower(accessToken, zaloUserId, classId);
            MongoDB.updateOneUser(
                managerColl,
                { phone: phone },
                {
                    $push: {
                        classes: {
                            classId: classId,
                        },
                    },
                }
            );
            const successContent = `✅ Đăng kí thành công cho trợ giảng ${name} với mã lớp ${classId} và số điện thoại ${phone}.`;

            await sendResponse2Client(
                res,
                accessToken,
                refreshToken,
                zaloUserId,
                tokenColl,
                messageId,
                successContent,
                'heart'
            );

            return;
        } else {
            // Neu dang ki roi thi gui message loi ve

            const failContent = `❌ Đăng kí thất bại vì trợ giảng ${name} đã liên kết với mã lớp ${classId}.`;

            await sendResponse2Client(
                res,
                accessToken,
                refreshToken,
                zaloUserId,
                tokenColl,
                messageId,
                failContent,
                'sad'
            );

            return;
        }
    }
}

async function deleteParentAccount(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    zaloColl,
    classColl,
    tokenColl,
    formatContent,
    messageId,
    zaloRole
) {
    if (formatContent.length !== 20) {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. Trợ giảng hãy nhập lại.`;
        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            failContent,
            'sad'
        );
        return;
    }

    const targetStudentId = parseInt(formatContent.substring(4, 11));
    const registerPhone = formatContent.slice(-10);
}

async function signUp(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    zaloColl,
    classColl,
    tokenColl,
    formatContent,
    messageId,
    zaloRole
) {
    if (formatContent.length !== 21) {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. ${zaloRole} hãy nhập lại.`;
        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            failContent,
            'sad'
        );
        return;
    }

    const targetStudentId = parseInt(formatContent.substring(4, 11));
    const registerPhone = formatContent.slice(-10);

    // Kiem tra sdt trong cu phap da duoc lien ket voi IDHS chua
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        {
            userPhone: registerPhone,
            'students.zaloStudentId': parseInt(targetStudentId),
        },
        { projection: { _id: 0 } }
    );

    if (isRegister !== null) {
        const failContent = `⭐ Thông báo!\n\nSố điện thoại ${registerPhone} đã được đăng kí với ID học sinh ${targetStudentId}.\n\n${zaloRole} lưu ý:\nMỗi tài khoản Zalo chỉ được liên kết với 1 số điện thoại đã được đăng kí với học sinh trước đó. Nếu có nhu cầu chuyển đổi tài khoản, ${zaloRole} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            failContent,
            'like'
        );

        return;
    }

    const zaloUserInfo = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, displayName: 1, students: 1 } }
    );

    const { displayName, students } = zaloUserInfo;

    let zaloStudentIdArr = [];
    let zaloClassIdArr = [];
    let aliasNameArr = [];

    if (students.length > 0) {
        students.forEach((v) => {
            const { zaloStudentId, zaloClassId, aliasName } = v;
            zaloStudentIdArr.push(zaloStudentId);
            zaloClassIdArr.push(zaloClassId);
            aliasNameArr.push(aliasName);
        });
    }

    // kiem tra tren classes collection
    const classUserInfo = await MongoDB.findOneUser(
        classColl,
        { studentId: targetStudentId },
        {
            projection: {
                _id: 0,
                fullName: 1,
                classId: 1,
                leaveDate: 1,
                studentPhone: 1,
                firstParentPhone: 1,
                secondParentPhone: 1,
            },
        }
    );

    if (classUserInfo === null) {
        const failContent = `❌ Đăng kí thất bại!\n\nID học sinh ${targetStudentId} không có trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            failContent,
            'sad'
        );

        return;
    }

    const { firstParentPhone, secondParentPhone, studentPhone, fullName, classId } = classUserInfo;

    let registerPhoneList;

    if (zaloRole === 'Phụ huynh') {
        registerPhoneList = [firstParentPhone, secondParentPhone];
    } else {
        registerPhoneList = [studentPhone];
    }

    if (!registerPhoneList.includes(registerPhone)) {
        const failContent = `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            failContent,
            'sad'
        );

        return;
    }
    // set up role cho zalo user
    const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được đăng kí với học sinh ${fullName} có ID là ${targetStudentId} ở mã lớp ${classId}\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

    sendResponse2Client(
        res,
        accessToken,
        refreshToken,
        zaloUserId,
        tokenColl,
        messageId,
        successContent,
        'heart'
    );

    const zaloRole2Short = {
        'Phụ huynh': 'PH',
        'Học sinh': 'HS',
    };

    // them class id moi
    zaloClassIdArr.push(classId);
    // them id hs moi
    zaloStudentIdArr.push(targetStudentId);
    // them alias moi
    aliasNameArr.push(`${zaloRole2Short[zaloRole]} ${fullName}`);

    // Cap nhat tag tren Zalo OA Chat
    ZaloAPI.tagFollower(accessToken, zaloUserId, zaloRole);
    ZaloAPI.tagFollower(accessToken, zaloUserId, zaloClassIdArr.at(-1));

    // cap nhat role cho PHHS trong Zalo Collection
    const filter = { zaloUserId: `${zaloUserId}` };

    const updateDoc = {
        $set: { userPhone: `${registerPhone}` },
        $push: {
            students: {
                zaloStudentId: targetStudentId,
                zaloClassId: classId,
                aliasName: `${zaloRole2Short[zaloRole]} ${fullName}`,
                role: zaloRole,
            },
        },
    };

    MongoDB.updateOneUser(zaloColl, filter, updateDoc);

    // Cap nhat thong tin tren Zalo OA Chat
    let formatZaloStudentId = [];
    let formatAliasName = [];

    zaloStudentIdArr.length === 1
        ? (formatZaloStudentId = zaloStudentIdArr[0])
        : (formatZaloStudentId = zaloStudentIdArr.join(', '));

    aliasNameArr.length === 1
        ? (formatAliasName = aliasNameArr[0])
        : (formatAliasName = aliasNameArr.join(', '));

    ZaloAPI.updateFollowerInfo(accessToken, formatZaloStudentId, zaloUserId, registerPhone, formatAliasName);

    return;
}

export {
    nomarlizeSyntax,
    signUp,
    isFollow,
    signUp4Assistant,
    forwardMessage2Assistant,
    isManager,
    sendMessageBack2Parent,
    sendMessage2Assistant,
    findZaloIdFromStudentId,
    sendReactBack2Parent,
};
