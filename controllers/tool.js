import { findOneUser, updateOneUser, insertOneUser } from './mongo.js';
import * as ZaloAPI from './zalo.js';
import { updateTokenInDB } from './mongo.js';

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

    updateTokenInDB(tokenColl, refreshToken);
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

    const specificZaloUserInfo = await findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}`, 'students.zaloStudentId': targetStudentId },
        { projection: { _id: 0, students: 1 } }
    );

    if (specificZaloUserInfo !== null) {
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
    const classUserInfo = await findOneUser(
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
    const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được liên kết với học sinh ${fullName}.\n\nID HS: ${targetStudentId}\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

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

    // Cap nhat tag tren Zalo OA Chat
    ZaloAPI.tagFollower(accessToken, zaloUserId, zaloRole);
    ZaloAPI.tagFollower(accessToken, zaloUserId, zaloClassId.at(-1));

    // cap nhat role cho PHHS trong zaloUsers Collection
    const filter = { zaloUserId: `${zaloUserId}` };

    const updateDoc = {
        userPhone: `${registerPhone}`,
        $push: {
            students: {
                zaloStudentId: targetStudentId,
                zaloClassId: classId,
                aliasName: `${zaloRole2Short[zaloRole]} ${fullName}`,
                role: zaloRole,
            },
        },
    };

    updateOneUser(zaloColl, filter, updateDoc);

    // Cap nhat thong tin tren Zalo OA Chat
    const totalZaloUserInfo = await findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, students: 1 } }
    );

    let formatZaloStudentId = [];
    let formatAliasName = [];
    totalZaloUserInfo.forEach((v) => {
        const [zaloStudentId, zaloClassId, aliasName, role] = v;
        formatZaloStudentId.push(zaloStudentId);
        formatAliasName.push(aliasName);
    });

    formatZaloStudentId.length === 1
        ? (formatZaloStudentId = formatZaloStudentId[0])
        : formatZaloStudentId.join(', ');

    formatAliasName.length === 1
        ? (formatAliasName = formatAliasName[0])
        : formatAliasName.join(', ');

    ZaloAPI.updateFollowerInfo(
        accessToken,
        formatZaloStudentId,
        zaloUserId,
        registerPhone,
        formatAliasName
    );

    return;
}

async function forceFollowOA(accessToken, zaloUserId) {
    const notFollowContent =
        'PHHS vui lòng nhấn quan tâm OA để sử dụng đầy đủ những tính năng của lớp toán.';
    await ZaloAPI.sendMessage(accessToken, zaloUserId, notFollowContent);
}

export { nomarlizeSyntax, forceFollowOA, signUp };
