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
    const [syntax, classId, phone, name] = content.split(' ');

    // check xem da co tro giang tren he thong chua
    const isAssistantExist = await MongoDB.findOneUser(
        managerColl,
        { phone: phone },
        { projection: { _id: 0 } }
    );

    if (isAssistantExist === null) {
        MongoDB.insertOneUser(managerColl, {
            zaloUserId: zaloUserId,
            role: 'Trợ giảng',
            status: 'On',
            name: name,
            phone: phone,
            classes: [{ classId: classId }],
        });

        const successContent = `✅ Đăng kí thành công cho trợ giảng!\n\nTên TG: ${name}\nID Lớp: ${classId}\nSĐT: ${phone}`;

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
        // check xem tro giang da dang ki voi lop chua
        const isRegisterWithAssistant = await MongoDB.findOneUser(
            managerColl,
            { phone: phone, 'classes.classId': classId },
            { projection: { _id: 0 } }
        );

        if (isRegisterWithAssistant === null) {
            MongoDB.updateOneUser(
                zaloColl,
                { 'classes.classId': classId },
                {
                    $push: {
                        classes: {
                            classId: classId,
                        },
                    },
                }
            );
            const successContent = `✅ Đăng kí thành công cho trợ giảng!\n\nTên TG: ${name}\nID Lớp: ${classId}\nSĐT: ${phone}`;

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
            const failContent = `❌ Đăng kí thất bại cho trợ giảng!\n\nTG ${name} đã liên kết với ID lớp ${classId}`;

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

async function signUp(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    zaloColl,
    classColl,
    tokenColl,
    formatSyntax,
    messageId,
    zaloRole
) {
    if (formatSyntax.length !== 21) {
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

    const targetStudentId = parseInt(formatSyntax.substring(4, 11));
    const registerPhone = formatSyntax.slice(-10);

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

    if (zaloStudentIdArr.includes(targetStudentId)) {
        const notifyContent = `⭐ Tài khoản đã có trên hệ thống!\n\n${zaloRole} có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            notifyContent,
            'like'
        );

        return;
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
        const failContent = `❌ Đăng kí thất bại!\n\nMã học sinh ${targetStudentId} không có trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

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

    let { firstParentPhone, secondParentPhone, studentPhone, fullName, classId } = classUserInfo;

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
    const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được liên kết với học sinh ${fullName}.\n\nID HS: ${targetStudentId}\nID Lớp: ${classId}\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

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

export { nomarlizeSyntax, signUp, isFollow, signUp4Assistant };
